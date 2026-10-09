import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFileSync } from "node:fs";
import { marked } from "marked";
import * as db from "./db.ts";
import * as events from "./events.ts";
import * as auth from "./auth.ts";
import { findInterest, INTERESTS } from "./interests.ts";
import { page } from "./html.ts";
import { parseSydney, toSydneyInput } from "./time.ts";
import * as views from "./views.ts";

// A new name, so crit 8's nickname cookie is simply ignored rather than misread.
const COOKIE = "buddyup_session";
const SESSION_S = db.SESSION_DAYS * 24 * 60 * 60;

function sessionCookie(req: IncomingMessage, token: string, maxAge: number): string {
  const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  return `${COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

function cookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0)
      out[part.slice(0, i).trim()] = decodeURIComponent(
        part.slice(i + 1).trim(),
      );
  }
  return out;
}

async function form(req: IncomingMessage): Promise<URLSearchParams> {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 10_000) throw new Error("body too large");
  }
  return new URLSearchParams(body);
}

function send(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(html);
}

// POST → redirect → GET, so a refresh never repeats an action
function redirect(
  res: ServerResponse,
  to: string,
  headers: Record<string, string> = {},
): void {
  res.writeHead(303, { location: to, ...headers });
  res.end();
}

// only same-site paths, so `next` can't send anyone elsewhere
function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/";
}

function clean(value: string | null, max: number): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

// One set of rules for starting and editing a meetup (README commitments 1 and 2).
function readMeetupForm(f: URLSearchParams, now: number) {
  const values = {
    starts_at: f.get("starts_at") ?? "",
    place: clean(f.get("place"), 80),
    meeting_point: clean(f.get("meeting_point"), 80),
    capacity: (f.get("capacity") ?? "").trim(),
    note: clean(f.get("note"), 140),
  };
  const startsAt = parseSydney(values.starts_at);
  const capacity = Number(values.capacity);
  let error = "";
  if (startsAt === null) error = "Say when: a day and a time.";
  else if (startsAt <= now) error = "That time has already passed.";
  else if (startsAt > now + db.MAX_AHEAD_MS)
    error =
      "Keep it within the next 7 days. Buddy Up is for plans that actually happen.";
  else if (!values.place) error = "Say where, exactly, so people can find you.";
  else if (!Number.isInteger(capacity) || capacity < 2 || capacity > 12)
    error = "Head count is 2 to 12, including you.";
  return { values, startsAt: startsAt ?? 0, capacity, error };
}

// A meetup changing touches two places people may be looking at: the meetup
// itself, and the list it sits in.
function touched(m: { id: number; interest: string }): string[] {
  return [`m:${m.id}`, `i:${m.interest}`];
}

function readmeHtml(): string {
  const md = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  return `<article class="readme">${marked.parse(md, { async: false })}</article>`;
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://local");
  const path = url.pathname;
  const method = req.method ?? "GET";
  const now = Date.now();
  const me = db.personBySession(cookies(req)[COOKIE], now);
  const who = me?.name ?? null;
  let m: RegExpExecArray | null;

  // The live stream. Answers only in text/event-stream, including when it is
  // turning someone away — see events.decline for why a 503 would be worse
  // than useless here.
  if (method === "GET" && path === "/events") {
    const topics = events.parseTopics(url.searchParams.get("topics"));
    if (
      topics.size === 0 ||
      !me ||
      !events.subscribe(req, res, topics, me?.id ?? null)
    )
      events.decline(res);
    return;
  }

  if (method === "GET" && path === "/") {
    const mine = me ? db.myMeetups(me.id, now) : [];
    return send(
      res,
      200,
      page({
        title: "Buddy Up",
        who,
        // the counts for every interest, plus whatever you're going to
        topics: me
          ? [...INTERESTS.map((i) => `i:${i.slug}`), ...mine.map((m) => `m:${m.id}`)]
          : undefined,
        body: views.home(me, db.upcomingCounts(now), mine, db.attendees, now),
      }),
    );
  }

  if (path === "/readme") return redirect(res, "/readme/");
  if (method === "GET" && path === "/readme/") {
    return send(
      res,
      200,
      page({ title: "About Buddy Up", who, body: readmeHtml() }),
    );
  }

  // Accounts (decision 4). Signing up or in sets a session cookie; the
  // password itself goes no further than the hash.
  if (method === "GET" && (path === "/login" || path === "/signup")) {
    const next = safeNext(url.searchParams.get("next"));
    if (me) return redirect(res, next);
    const body = path === "/login" ? views.loginForm(next) : views.signupForm(next);
    return send(res, 200, page({ title: path === "/login" ? "Log in" : "Make an account", who, body }));
  }

  if (method === "POST" && path === "/signup") {
    const f = await form(req);
    const next = safeNext(f.get("next"));
    const username = (f.get("username") ?? "").trim().toLowerCase();
    const name = clean(f.get("name"), 24);
    const password = f.get("password") ?? "";
    const values = { username, name };
    let error = "";
    if (!auth.USERNAME.test(username))
      error = "Usernames are 3 to 20 lowercase letters, numbers or _.";
    else if (!name) error = "Add a display name, so people know who's coming.";
    else if (password.length < auth.MIN_PASSWORD || password.length > auth.MAX_PASSWORD)
      error = `Passwords are at least ${auth.MIN_PASSWORD} characters.`;
    let person: db.Person | null = null;
    if (!error) {
      person = db.createAccount(username, name, await auth.hashPassword(password));
      if (!person) error = "That username is taken. Try another.";
    }
    if (error || !person)
      return send(res, 400, page({ title: "Make an account", who, body: views.signupForm(next, values, error) }));
    return redirect(res, next, {
      "set-cookie": sessionCookie(req, db.createSession(person.id), SESSION_S),
    });
  }

  if (method === "POST" && path === "/login") {
    const f = await form(req);
    const next = safeNext(f.get("next"));
    const username = (f.get("username") ?? "").trim().toLowerCase().slice(0, 40);
    const password = (f.get("password") ?? "").slice(0, auth.MAX_PASSWORD);
    const show = (status: number, error: string) =>
      send(res, status, page({ title: "Log in", who, body: views.loginForm(next, { username }, error) }));

    // Too many wrong guesses: refuse even the right password until it cools off.
    const until = db.lockedUntil(username, now);
    if (until !== null) {
      const mins = Math.max(1, Math.ceil((until - now) / 60000));
      return show(429, `Too many tries. Wait ${mins} minute${mins === 1 ? "" : "s"} and try again.`);
    }
    const row = db.loginRow(username);
    const ok = row ? await auth.verifyPassword(password, row.pass_hash) : (await auth.burnTime(password), false);
    if (!ok || !row) {
      db.recordFailure(username, now);
      // one message for both, so it doesn't say which usernames exist
      return show(401, "Username or password is wrong.");
    }
    db.clearFailures(username);
    return redirect(res, next, {
      "set-cookie": sessionCookie(req, db.createSession(row.id), SESSION_S),
    });
  }

  if (method === "POST" && path === "/logout") {
    const token = cookies(req)[COOKIE];
    if (token) db.deleteSession(token);
    return redirect(res, "/", { "set-cookie": sessionCookie(req, "", 0) });
  }

  // Everything past here is for people who are signed in. Nothing is public.
  if (!me) {
    if (method === "GET") return redirect(res, `/login?next=${encodeURIComponent(path + url.search)}`);
    return redirect(res, "/login");
  }

  if (method === "GET" && path === "/me") {
    return send(res, 200, page({ title: "Display name", who, body: views.nameForm(me.name) }));
  }

  if (method === "POST" && path === "/me") {
    const f = await form(req);
    const name = clean(f.get("name"), 24);
    if (!name)
      return send(res, 400, page({ title: "Display name", who, body: views.nameForm("", "A display name needs at least one character.") }));
    db.renamePerson(me.id, name);
    return redirect(res, "/");
  }

  if ((m = /^\/i\/([a-z]+)$/.exec(path)) && method === "GET") {
    const interest = findInterest(m[1]);
    if (!interest) return notFound(res, who);
    const list = db.upcoming(interest.slug, now);
    const going = new Set(
      me ? list.filter((x) => db.isGoing(x.id, me.id)).map((x) => x.id) : [],
    );
    const body = views.interestPage(
      interest,
      me,
      list,
      going,
      db.finished(interest.slug, now),
      now,
      views.hostForm(interest, now),
    );
    return send(
      res,
      200,
      page({
        title: `${interest.name} · Buddy Up`,
        who,
        colour: interest.colour,
        topics: [`i:${interest.slug}`],
        body,
      }),
    );
  }

  if ((m = /^\/i\/([a-z]+)\/meetups$/.exec(path)) && method === "POST") {
    const interest = findInterest(m[1]);
    if (!interest) return notFound(res, who);
    if (!me) return redirect(res, `/i/${interest.slug}`);
    const { values, startsAt, capacity, error } = readMeetupForm(
      await form(req),
      now,
    );
    if (error) {
      const list = db.upcoming(interest.slug, now);
      const going = new Set(
        list.filter((x) => db.isGoing(x.id, me.id)).map((x) => x.id),
      );
      const body = views.interestPage(
        interest,
        me,
        list,
        going,
        db.finished(interest.slug, now),
        now,
        views.hostForm(interest, now, values, error),
      );
      return send(
        res,
        400,
        page({
          title: `${interest.name} · Buddy Up`,
          who,
          colour: interest.colour,
          body,
        }),
      );
    }
    const id = db.createMeetup({
      interest: interest.slug,
      hostId: me.id,
      startsAt,
      place: values.place,
      meetingPoint: values.meeting_point,
      capacity,
      note: values.note,
    });
    // nobody is watching m:<id> yet — it didn't exist a moment ago
    events.publish([`i:${interest.slug}`]);
    return redirect(res, `/i/${interest.slug}#m${id}`);
  }

  if ((m = /^\/m\/(\d+)$/.exec(path)) && method === "GET") {
    const meetup = db.getMeetup(Number(m[1]));
    if (!meetup) return notFound(res, who);
    const interest = findInterest(meetup.interest)!;
    const going = me ? db.isGoing(meetup.id, me.id) : false;
    const body = views.meetupPage(
      meetup,
      me,
      going,
      db.attendees(meetup.id),
      now,
    );
    return send(
      res,
      200,
      page({
        title: `${interest.name} · Buddy Up`,
        who,
        colour: interest.colour,
        topics: [`m:${meetup.id}`],
        body,
      }),
    );
  }

  // Editing: host only, before it starts. Time and place changes are flagged on
  // the meetup; the head count can't drop below the people already going.
  if (
    (m = /^\/m\/(\d+)\/edit$/.exec(path)) &&
    (method === "GET" || method === "POST")
  ) {
    const meetup = db.getMeetup(Number(m[1]));
    if (!meetup) return notFound(res, who);
    if (!me) return redirect(res, `/m/${meetup.id}`);
    const interest = findInterest(meetup.interest)!;
    const back = `/i/${meetup.interest}#m${meetup.id}`;
    if (meetup.host_id !== me.id) {
      return send(
        res,
        403,
        page({
          title: "Not yours",
          who,
          body: views.message(
            "Not yours to edit",
            "Only the host can change a meetup.",
            back,
          ),
        }),
      );
    }
    if (meetup.cancelled_at !== null || meetup.starts_at <= now) {
      return send(
        res,
        409,
        page({
          title: "Too late",
          who,
          body: views.message(
            "Too late to edit",
            "This one has already started or been called off.",
            back,
          ),
        }),
      );
    }
    const editing = { id: meetup.id, going: meetup.going };
    const show = (status: number, values: views.HostFormValues, error = "") =>
      send(
        res,
        status,
        page({
          title: `Edit · Buddy Up`,
          who,
          colour: interest.colour,
          body: views.editPage(
            interest,
            views.hostForm(interest, now, values, error, editing),
          ),
        }),
      );

    if (method === "GET") {
      return show(200, {
        starts_at: toSydneyInput(meetup.starts_at),
        place: meetup.place,
        meeting_point: meetup.meeting_point,
        capacity: String(meetup.capacity),
        note: meetup.note,
      });
    }
    const { values, startsAt, capacity, error } = readMeetupForm(
      await form(req),
      now,
    );
    if (error) return show(400, values, error);
    const result = db.editMeetup(
      meetup.id,
      {
        startsAt,
        place: values.place,
        meetingPoint: values.meeting_point,
        capacity,
        note: values.note,
      },
      now,
    );
    if (result === "too_small") {
      const going = db.getMeetup(meetup.id)?.going ?? meetup.going;
      return show(
        409,
        values,
        `${going} people are already going, so the head count can't go below ${going}.`,
      );
    }
    if (result === "saved") events.publish(touched(meetup));
    return redirect(res, back);
  }

  if (
    (m = /^\/m\/(\d+)\/(join|leave|cancel)$/.exec(path)) &&
    method === "POST"
  ) {
    const meetup = db.getMeetup(Number(m[1]));
    if (!meetup) return notFound(res, who);
    if (!me) return redirect(res, `/m/${meetup.id}`);
    const back = `/i/${meetup.interest}#m${meetup.id}`;
    const action = m[2];

    if (action === "join") {
      const result = db.join(meetup.id, me.id, now);
      if (result === "full") {
        return send(
          res,
          409,
          page({
            title: "Full",
            who,
            body: views.message(
              "Just filled up",
              "Someone took the last spot a moment ago. Start your own? People often want the same thing.",
              back,
            ),
          }),
        );
      }
      if (result === "closed") {
        return send(
          res,
          409,
          page({
            title: "Closed",
            who,
            body: views.message(
              "Too late to join",
              "This one has already started or been called off.",
              back,
            ),
          }),
        );
      }
      // "already" means they were going before they asked; nothing moved
      if (result === "joined") events.publish(touched(meetup));
      return redirect(res, back);
    }

    if (meetup.host_id === me.id && action === "leave") {
      return send(
        res,
        400,
        page({
          title: "You're hosting",
          who,
          body: views.message(
            "You're hosting this one",
            "Call it off instead, so the others know.",
            back,
          ),
        }),
      );
    }
    if (action === "leave") {
      if (meetup.starts_at > now && db.leave(meetup.id, me.id))
        events.publish(touched(meetup));
      return redirect(res, back);
    }
    if (meetup.host_id !== me.id) {
      return send(
        res,
        403,
        page({
          title: "Not yours",
          who,
          body: views.message(
            "Not yours to call off",
            "Only the host can call off a meetup.",
            back,
          ),
        }),
      );
    }
    if (db.cancel(meetup.id, now)) events.publish(touched(meetup));
    return redirect(res, back);
  }

  return notFound(res, who);
}

function notFound(res: ServerResponse, who: string | null): void {
  send(
    res,
    404,
    page({
      title: "Not here",
      who,
      body: views.message(
        "Nothing here",
        "That page doesn't exist, or it's gone.",
        "/",
      ),
    }),
  );
}

const port = Number(process.env.PORT ?? 8080);
const server = createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent)
      send(
        res,
        500,
        page({
          title: "Error",
          body: views.message("Something broke", "Try again in a moment.", "/"),
        }),
      );
    else res.end();
  });
});
server.listen(port, "0.0.0.0", () =>
  console.log(`buddy up listening on :${port}`),
);

// Fly stops the machine when nobody is using it. Killed outright, every open
// stream is a severed socket, every client reconnects within seconds, and
// auto_start_machines boots the machine straight back up. Ending them properly
// first, with a retry delay, lets the stop actually stick.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    events.closeAll();
    server.close(() => process.exit(0));
    // don't wait on a keep-alive socket that never sends another request
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
