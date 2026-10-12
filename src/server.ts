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
import * as log from "./log.ts";
import {
  canOpen,
  findInterest,
  INTERESTS,
  interestsFor,
  NEW_INTEREST,
  NEW_SLUG,
  readActivityName,
  type Interest,
} from "./interests.ts";
import { page, type Who } from "./html.ts";
import { parseSydney, toSydneyInput } from "./time.ts";
import * as views from "./views.ts";
import { qrSvg } from "./qr.ts";

// A new name, so crit 8's nickname cookie is simply ignored rather than misread.
const COOKIE = "buddyup_session";
const SESSION_S = db.SESSION_DAYS * 24 * 60 * 60;

function sessionCookie(
  req: IncomingMessage,
  token: string,
  maxAge: number,
): string {
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
    // Pages load webfonts from Google, and a path here can carry a meetup id
    // or an activity someone named. New browsers send only the origin to
    // another site; old ones send the whole URL. Say it, don't assume it.
    "referrer-policy": "strict-origin-when-cross-origin",
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

// Someone's own pages (friend requests, the nav count, their circles list),
// and a circle's member list. Each reaches only the person, or the members.
function tellPerson(...ids: number[]): void {
  for (const id of ids) events.publish([`p:${id}`], (pid) => pid === id);
}
function tellCircle(circleId: number): void {
  events.publish(
    [`c:${circleId}`],
    (pid) => pid !== null && db.isCircleMember(circleId, pid),
  );
}

// A meetup for an activity beyond the three can add that activity to its
// audience's menu and home (it may be new to them, so no page watches its i:
// topic) or, when called off, take it away. Their own p: topic moves those
// pages; only people who can see the meetup are told.
function tellActivityAudience(meetupId: number): void {
  const m = db.getMeetup(meetupId);
  if (!m || INTERESTS.some((i) => i.slug === m.interest)) return;
  const audienceIds =
    m.audience === "circle" && m.audience_circle_id !== null
      ? db.circleMembers(m.audience_circle_id).map((p) => p.id)
      : db.friendsOf(m.host_id).map((p) => p.id);
  for (const pid of new Set([m.host_id, ...audienceIds]))
    events.publish([`p:${pid}`], (x) => x === pid && db.canSee(meetupId, pid));
}

// Tell the pages watching a meetup that it changed, but only the people who
// can see it (decision 4).
function announce(m: { id: number; interest: string }): void {
  events.publish(touched(m), (pid) => pid !== null && db.canSee(m.id, pid));
}

// What the host form offers under "Who's it for?"
function audienceChoices(personId: number): views.AudienceChoices {
  return {
    circles: db.myCircles(personId),
    friends: db.friendsOf(personId).length,
  };
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
  const listed = me ? interestsFor(me.id, now) : [];
  const who = me
    ? {
        name: me.name,
        requests: db.incomingCount(me.id),
        activities: listed.map(({ slug, name, colour }) => ({
          slug,
          name,
          colour,
        })),
      }
    : null;
  let m: RegExpExecArray | null;

  // One log line per request, naming who made it and what came back — crit
  // 10's requirement that the server tell two people apart from its logs
  // alone (decision 0006). Route handlers below enrich `ctx` with the
  // specific action, resource and allow/deny reason; this is what makes it
  // one line rather than one per decision point.
  const actor = me ? `${me.username}#${me.id}` : "anon";
  const ctx: log.Fields = {};
  res.once("finish", () =>
    log.emit({
      time: new Date(now).toISOString(),
      actor,
      method,
      path,
      status: res.statusCode,
      ...ctx,
    }),
  );

  // The live stream. Answers only in text/event-stream, including when it is
  // turning someone away — see events.decline for why a 503 would be worse
  // than useless here.
  if (method === "GET" && path === "/events") {
    const topics = events.parseTopics(url.searchParams.get("topics"));
    // no watching a meetup you can't see, another person's requests, or a
    // circle you're not in
    if (me)
      for (const t of [...topics]) {
        const id = Number(t.slice(2));
        if (t.startsWith("m:") && !db.canSee(id, me.id)) topics.delete(t);
        if (t.startsWith("p:") && id !== me.id) topics.delete(t);
        if (t.startsWith("c:") && !db.isCircleMember(id, me.id))
          topics.delete(t);
      }
    // `finish` fires late on a long-lived stream (only once it closes), so
    // this is logged as soon as the decision is made, not on disconnect.
    ctx.action = "subscribe";
    ctx.topics = [...topics].join(",") || undefined;
    if (
      topics.size === 0 ||
      !me ||
      !events.subscribe(req, res, topics, me?.id ?? null)
    ) {
      ctx.result = "declined";
      events.decline(res);
    } else {
      ctx.result = "ok";
    }
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
          ? [
              ...listed.map((i) => `i:${i.slug}`),
              ...mine.map((m) => `m:${m.id}`),
              `p:${me.id}`,
            ]
          : undefined,
        body: views.home(
          me,
          me ? db.upcomingCounts(now, me.id) : {},
          mine,
          db.attendees,
          now,
          me
            ? {
                circles: db.myCircles(me.id).length,
                friends: db.friendsOf(me.id).length,
                requests: who?.requests ?? 0,
              }
            : undefined,
          listed,
        ),
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
    const body =
      path === "/login" ? views.loginForm(next) : views.signupForm(next);
    return send(
      res,
      200,
      page({
        title: path === "/login" ? "Log in" : "Make an account",
        who,
        body,
      }),
    );
  }

  if (method === "POST" && path === "/signup") {
    const f = await form(req);
    const next = safeNext(f.get("next"));
    const username = (f.get("username") ?? "").trim().toLowerCase();
    const name = clean(f.get("name"), 24);
    const password = f.get("password") ?? "";
    const values = { username, name };
    let error = "";
    let reason = "";
    ctx.action = "signup";
    if (!auth.USERNAME.test(username)) {
      error = "Usernames are 3 to 20 lowercase letters, numbers or _.";
      reason = "bad_username";
    } else if (!name) {
      error = "Add a display name, so people know who's coming.";
      reason = "bad_name";
    } else if (
      password.length < auth.MIN_PASSWORD ||
      password.length > auth.MAX_PASSWORD
    ) {
      error = `Passwords are at least ${auth.MIN_PASSWORD} characters.`;
      reason = "bad_password";
    }
    let person: db.Person | null = null;
    if (!error) {
      person = db.createAccount(
        username,
        name,
        await auth.hashPassword(password),
      );
      // both are unique; say which one clashed (names ignore case)
      if (!person) {
        error = db.nameTaken(name)
          ? "Someone already goes by that name. Try another, maybe with an initial."
          : "That username is taken. Try another.";
        reason = "taken";
      }
    }
    if (error || !person) {
      ctx.result = "denied";
      ctx.reason = reason;
      return send(
        res,
        400,
        page({
          title: "Make an account",
          who,
          body: views.signupForm(next, values, error),
        }),
      );
    }
    ctx.result = "ok";
    ctx.user = `${person.username}#${person.id}`;
    return redirect(res, next, {
      "set-cookie": sessionCookie(req, db.createSession(person.id), SESSION_S),
    });
  }

  if (method === "POST" && path === "/login") {
    const f = await form(req);
    const next = safeNext(f.get("next"));
    const username = (f.get("username") ?? "")
      .trim()
      .toLowerCase()
      .slice(0, 40);
    const password = (f.get("password") ?? "").slice(0, auth.MAX_PASSWORD);
    ctx.action = "login";
    ctx.user = username;
    const show = (status: number, error: string) =>
      send(
        res,
        status,
        page({
          title: "Log in",
          who,
          body: views.loginForm(next, { username }, error),
        }),
      );

    // Too many wrong guesses: refuse even the right password until it cools off.
    const until = db.lockedUntil(username, now);
    if (until !== null) {
      const mins = Math.max(1, Math.ceil((until - now) / 60000));
      ctx.result = "denied";
      ctx.reason = "locked";
      return show(
        429,
        `Too many tries. Wait ${mins} minute${mins === 1 ? "" : "s"} and try again.`,
      );
    }
    const row = db.loginRow(username);
    const ok = row
      ? await auth.verifyPassword(password, row.pass_hash)
      : (await auth.burnTime(password), false);
    if (!ok || !row) {
      db.recordFailure(username, now);
      ctx.result = "denied";
      ctx.reason = "wrong";
      // one message for both, so it doesn't say which usernames exist
      return show(401, "Username or password is wrong.");
    }
    db.clearFailures(username);
    ctx.result = "ok";
    ctx.user = `${username}#${row.id}`;
    return redirect(res, next, {
      "set-cookie": sessionCookie(req, db.createSession(row.id), SESSION_S),
    });
  }

  if (method === "POST" && path === "/logout") {
    const token = cookies(req)[COOKIE];
    ctx.action = "logout";
    ctx.result = "ok";
    if (token) db.deleteSession(token);
    return redirect(res, "/", { "set-cookie": sessionCookie(req, "", 0) });
  }

  // Everything past here is for people who are signed in. Nothing is public.
  if (!me) {
    if (method === "GET")
      return redirect(
        res,
        `/login?next=${encodeURIComponent(path + url.search)}`,
      );
    return redirect(res, "/login");
  }

  // ---- People: circles and friends on one page ----
  // A form that fails re-renders this page with its error beside that form.
  const showPeople = (status: number, forms: views.PeopleForms = {}) => {
    const circles = db.myCircles(me.id);
    return send(
      res,
      status,
      page({
        title: "People · Buddy Up",
        who,
        // only a 200 from a GET is safe to re-fetch live (see page())
        topics:
          status === 200
            ? [`p:${me.id}`, ...circles.map((c) => `c:${c.id}`)]
            : undefined,
        body: views.peoplePage(
          circles,
          db.friendsOf(me.id),
          db.incomingRequests(me.id),
          db.outgoingRequests(me.id),
          forms,
        ),
      }),
    );
  };

  if (path === "/people" && method === "GET") {
    const done = url.searchParams.get("done");
    const notes: Record<string, string> = {
      sent: "Request sent. They'll see it next time they look.",
      friends: "You're friends now.",
    };
    return showPeople(200, { note: done ? notes[done] : undefined });
  }

  // the old pages, kept so links and bookmarks still work
  if ((path === "/circles" || path === "/friends") && method === "GET") {
    return redirect(res, `/people${url.search}#${path.slice(1)}`);
  }

  // ---- Circles (decision 4, step 2) ----

  if (path === "/circles" && method === "POST") {
    const name = clean((await form(req)).get("name"), 40);
    ctx.action = "create_circle";
    if (!name) {
      ctx.result = "denied";
      ctx.reason = "bad_name";
      return showPeople(400, {
        circleError: "Give the circle a name people will recognise.",
      });
    }
    const id = db.createCircle(name, me.id);
    ctx.result = "ok";
    ctx.circle = id;
    return redirect(res, `/c/${id}`);
  }

  // Joining by the 6-digit number: it only finds the circle, then goes to the
  // same "Join X?" page as the link. Wrong guesses count toward a lock.
  if (path === "/circles/code" && method === "POST") {
    const typed = ((await form(req)).get("code") ?? "").replace(/\s+/g, "");
    ctx.action = "circle_code";
    const show = (status: number, error: string) =>
      showPeople(status, { code: { value: typed.slice(0, 7), error } });
    const until = db.codeLockedUntil(me.id, now);
    if (until !== null) {
      const mins = Math.max(1, Math.ceil((until - now) / 60000));
      ctx.result = "denied";
      ctx.reason = "locked";
      return show(
        429,
        `Too many wrong codes. Wait ${mins} minute${mins === 1 ? "" : "s"} and try again.`,
      );
    }
    const circle = /^\d{6}$/.test(typed) ? db.circleByNumber(typed) : null;
    if (!circle) {
      db.recordCodeFailure(me.id, now);
      ctx.result = "denied";
      ctx.reason = "not_found";
      return show(
        404,
        "That code doesn't match a circle. Check it with someone in the circle.",
      );
    }
    ctx.result = "ok";
    ctx.circle = circle.id;
    if (db.isCircleMember(circle.id, me.id))
      return redirect(res, `/c/${circle.id}`);
    return redirect(res, `/join/${circle.invite_code}`);
  }

  if ((m = /^\/c\/(\d+)$/.exec(path)) && method === "GET") {
    // to anyone outside it, a circle doesn't exist
    const circle = db.circleForMember(Number(m[1]), me.id);
    if (!circle) return notFound(res, who);
    const proto =
      req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    const link = `${proto}://${req.headers.host ?? "localhost"}/join/${circle.invite_code}`;
    return send(
      res,
      200,
      page({
        title: `${circle.name} · Buddy Up`,
        who,
        topics: [`c:${circle.id}`, `p:${me.id}`],
        body: views.circlePage(
          circle,
          db.circleMembers(circle.id),
          me,
          link,
          qrSvg(link, "QR code for the invite link"),
        ),
      }),
    );
  }

  if ((m = /^\/c\/(\d+)\/(leave|reset)$/.exec(path)) && method === "POST") {
    const id = Number(m[1]);
    ctx.action = m[2] === "leave" ? "leave_circle" : "reset_invite";
    ctx.circle = id;
    if (!db.circleForMember(id, me.id)) {
      ctx.result = "denied";
      ctx.reason = "not_member";
      return notFound(res, who);
    }
    if (m[2] === "leave") {
      db.leaveCircle(id, me.id);
      ctx.result = "ok";
      tellCircle(id);
      tellPerson(me.id);
      return redirect(res, "/people#circles");
    }
    if (!db.resetInvite(id, me.id)) {
      ctx.result = "denied";
      ctx.reason = "not_owner";
      return send(
        res,
        403,
        page({
          title: "Not yours",
          who,
          body: views.message(
            "Only the person who started it",
            "Only the circle's owner can reset its link.",
            `/c/${id}`,
          ),
        }),
      );
    }
    ctx.result = "ok";
    tellCircle(id);
    return redirect(res, `/c/${id}`);
  }

  if ((m = /^\/join\/([A-Za-z0-9_-]{6,40})$/.exec(path))) {
    const code = m[1];
    const gone = () =>
      send(
        res,
        404,
        page({
          title: "Link expired",
          who,
          body: views.message(
            "This invite link doesn't work",
            "It may have been reset. Ask someone in the circle for a fresh one.",
            "/people#circles",
          ),
        }),
      );
    if (method === "GET") {
      const circle = db.circleByCode(code);
      if (!circle) return gone();
      if (db.isCircleMember(circle.id, me.id))
        return redirect(res, `/c/${circle.id}`);
      return send(
        res,
        200,
        page({
          title: `Join ${circle.name}`,
          who,
          body: views.joinPage(circle, code),
        }),
      );
    }
    if (method === "POST") {
      const joined = db.joinCircle(code, me.id);
      ctx.action = "join_circle";
      if (joined.result === "missing") {
        ctx.result = "denied";
        ctx.reason = "missing";
        return gone();
      }
      if (joined.result === "full") {
        ctx.result = "denied";
        ctx.reason = "full";
        return send(
          res,
          409,
          page({
            title: "Full",
            who,
            body: views.message(
              "This circle is full",
              `A circle holds at most ${db.CIRCLE_MAX} people, so everyone in it can know each other.`,
              "/people#circles",
            ),
          }),
        );
      }
      ctx.circle = joined.id;
      ctx.result = "ok";
      if (joined.result === "joined") {
        tellCircle(joined.id);
        tellPerson(me.id);
      }
      return redirect(res, `/c/${joined.id}`);
    }
  }

  // ---- Friends (decision 4, step 3) ----
  if (path === "/friends" && method === "POST") {
    const username = ((await form(req)).get("username") ?? "")
      .trim()
      .replace(/^@/, "")
      .toLowerCase()
      .slice(0, 40);
    const asked = db.askFriend(me.id, username, now);
    ctx.action = "add_friend";
    ctx.reason = asked.result;
    const show = (status: number, error: string) =>
      showPeople(status, { username, friendError: error });
    switch (asked.result) {
      case "missing":
        ctx.result = "denied";
        return show(
          404,
          `There's no one with the username "${username}". Check the spelling with them.`,
        );
      case "self":
        ctx.result = "denied";
        return show(400, "That's you.");
      case "already_friends":
        ctx.result = "denied";
        ctx.other = asked.who.id;
        return show(409, `You and ${asked.who.name} are already friends.`);
      case "already_asked":
        ctx.result = "denied";
        ctx.other = asked.who.id;
        return show(
          409,
          `You've already asked ${asked.who.name}. It's up to them now.`,
        );
      case "too_soon": {
        ctx.result = "denied";
        ctx.other = asked.who.id;
        const days = Math.max(1, Math.ceil((asked.until - now) / 86400000));
        return show(
          429,
          `You asked ${asked.who.name} recently. You can ask again in ${days} day${days === 1 ? "" : "s"}.`,
        );
      }
      case "became_friends":
        ctx.result = "ok";
        ctx.other = asked.who.id;
        tellPerson(asked.who.id, me.id);
        return redirect(res, "/people?done=friends#friends");
      case "sent":
        ctx.result = "ok";
        ctx.other = asked.who.id;
        tellPerson(asked.who.id, me.id);
        return redirect(res, "/people?done=sent#friends");
    }
  }

  if (
    (m = /^\/friends\/(\d+)\/(accept|decline|cancel|remove)$/.exec(path)) &&
    method === "POST"
  ) {
    const other = Number(m[1]);
    ctx.action = `friend_${m[2]}`;
    ctx.other = other;
    // both people's pages move; neither gets a message, as before
    if (m[2] === "accept") {
      if (db.acceptFriend(me.id, other, now)) {
        ctx.result = "ok";
        tellPerson(other, me.id);
        return redirect(res, "/people?done=friends#friends");
      }
      ctx.result = "denied";
    } else {
      ctx.result = "ok";
      if (m[2] === "decline") db.declineFriend(me.id, other);
      else if (m[2] === "cancel") db.cancelFriendRequest(me.id, other);
      else db.removeFriend(me.id, other);
    }
    tellPerson(other, me.id);
    return redirect(res, "/people#friends");
  }

  // Starting something that isn't listed: the host form plus a name for it.
  if (path === `/i/${NEW_SLUG}` && method === "GET") {
    return send(
      res,
      200,
      page({
        title: "Something else · Buddy Up",
        who,
        body: views.newActivityPage(
          views.hostForm(
            NEW_INTEREST,
            now,
            {},
            "",
            undefined,
            audienceChoices(me.id),
          ),
        ),
      }),
    );
  }

  if ((m = /^\/i\/([a-z0-9-]{1,32})$/.exec(path)) && method === "GET") {
    const interest = findInterest(m[1]);
    // someone else's activity doesn't exist for you, name included
    if (!interest || !canOpen(interest.slug, me.id)) return notFound(res, who);
    const list = db.upcoming(interest.slug, now, me.id);
    const going = new Set(
      me ? list.filter((x) => db.isGoing(x.id, me.id)).map((x) => x.id) : [],
    );
    const body = views.interestPage(
      interest,
      me,
      list,
      going,
      db.finished(interest.slug, now, me.id),
      now,
      views.hostForm(interest, now, {}, "", undefined, audienceChoices(me.id)),
      db.calledOffIn(interest.slug, now, me.id),
    );
    return send(
      res,
      200,
      page({
        title: `${interest.name} · Buddy Up`,
        who,
        colour: interest.colour,
        topics: [`i:${interest.slug}`, `p:${me.id}`],
        body,
      }),
    );
  }

  if (
    (m = /^\/i\/([a-z0-9-]{1,32})\/meetups$/.exec(path)) &&
    method === "POST"
  ) {
    const isNew = m[1] === NEW_SLUG;
    const found = isNew ? NEW_INTEREST : findInterest(m[1]);
    if (!found || (!isNew && !canOpen(found.slug, me.id)))
      return notFound(res, who);
    let interest: Interest = found;
    const f = await form(req);
    // a new one: the typed name, or the listed activity it already is
    const named = isNew ? readActivityName(f.get("what")) : null;
    const name = named && "slug" in named ? named : null;
    if (name) interest = findInterest(name.slug) ?? interest;
    const {
      values,
      startsAt,
      capacity,
      error: formError,
    } = readMeetupForm(f, now);
    // who it's for: "friends", or "circle:<id>" for a circle you're in
    const aud = f.get("audience") ?? "";
    const circleId = /^circle:(\d+)$/.exec(aud)?.[1];
    const audience = aud === "friends" ? "friends" : circleId ? "circle" : null;
    const choices = audienceChoices(me.id);
    const error =
      (named?.error ?? "") ||
      formError ||
      (audience === null
        ? "Say who it's for: one of your circles, or your friends."
        : "") ||
      (audience === "circle" &&
      !choices.circles.some((c) => c.id === Number(circleId))
        ? "You can only post to a circle you're in."
        : "");
    const valuesWithAudience = {
      ...values,
      audience: aud,
      what: f.get("what") ?? "",
    };
    if (error && isNew) {
      return send(
        res,
        400,
        page({
          title: "Something else · Buddy Up",
          who,
          body: views.newActivityPage(
            views.hostForm(
              NEW_INTEREST,
              now,
              valuesWithAudience,
              error,
              undefined,
              choices,
            ),
          ),
        }),
      );
    }
    if (error) {
      const list = db.upcoming(interest.slug, now, me.id);
      const going = new Set(
        list.filter((x) => db.isGoing(x.id, me.id)).map((x) => x.id),
      );
      const body = views.interestPage(
        interest,
        me,
        list,
        going,
        db.finished(interest.slug, now, me.id),
        now,
        views.hostForm(
          interest,
          now,
          valuesWithAudience,
          error,
          undefined,
          choices,
        ),
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
    // made only now, with a meetup to show it to: an activity is never listed
    // with nothing in it
    if (name && interest.slug === NEW_SLUG)
      interest = {
        ...interest,
        ...db.ensureActivity(name.slug, name.name, me.id, now),
      };
    const id = db.createMeetup({
      audience: audience!,
      circleId: audience === "circle" ? Number(circleId) : null,
      interest: interest.slug,
      hostId: me.id,
      startsAt,
      place: values.place,
      meetingPoint: values.meeting_point,
      capacity,
      note: values.note,
    });
    if (id === null) return redirect(res, `/i/${interest.slug}`);
    // nobody is watching m:<id> yet — it didn't exist a moment ago; and only
    // its audience hears that the list moved
    events.publish(
      [`i:${interest.slug}`],
      (pid) => pid !== null && db.canSee(id, pid),
    );
    tellActivityAudience(id);
    return redirect(res, `/i/${interest.slug}#m${id}`);
  }

  if ((m = /^\/m\/(\d+)$/.exec(path)) && method === "GET") {
    const meetup = db.meetupFor(Number(m[1]), me.id);
    if (!meetup) return notFound(res, who);
    const interest = findInterest(meetup.interest)!;
    const going = db.isGoing(meetup.id, me.id);
    const body = views.meetupPage(
      meetup,
      me,
      going,
      db.attendees(meetup.id),
      now,
      {
        // notes are for people going only: anyone else gets no list at all
        notes: going ? db.notesFor(meetup.id, now) : null,
        myCame: going && db.myCheckIn(meetup.id, me.id),
      },
    );
    return send(
      res,
      200,
      page({
        title: `${interest.name} · Buddy Up`,
        who,
        colour: interest.colour,
        topics: [`m:${meetup.id}`, `p:${me.id}`],
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
    const meetup = db.meetupFor(Number(m[1]), me.id);
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
    const editing = {
      id: meetup.id,
      going: meetup.going,
      audienceLabel: views.audienceLabel(meetup),
    };
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
    if (result === "saved") announce(meetup);
    return redirect(res, back);
  }

  // ---- Notes and check-in (ADR 0002) ----
  if ((m = /^\/m\/(\d+)\/(notes|checkin)$/.exec(path)) && method === "POST") {
    const meetup = db.meetupFor(Number(m[1]), me.id);
    if (!meetup) return notFound(res, who);
    const f = await form(req);
    const back = `/m/${meetup.id}`;
    if (m[2] === "notes") {
      // a quick reply must be one of the offered emoji; anything else is typed
      const quick = f.get("quick");
      if (
        quick !== null &&
        !db.QUICK_REPLIES.includes(quick) &&
        !db.QUICK_NOTES.includes(quick)
      )
        return send(
          res,
          400,
          page({
            title: "Notes",
            who,
            body: views.message(
              "Not a quick reply",
              "Type it in the box instead.",
              back,
            ),
          }),
        );
      const body = quick ?? clean(f.get("body"), db.NOTE_MAX);
      if (!body) return redirect(res, back);
      const replyTo = /^\d+$/.test(f.get("reply_to") ?? "")
        ? Number(f.get("reply_to"))
        : null;
      const posted = db.addNote(meetup.id, me.id, body, now, replyTo);
      if (posted === "bad_reply")
        return send(
          res,
          400,
          page({
            title: "Notes",
            who,
            body: views.message(
              "Can't reply to that",
              "Replies go under a note, one level deep.",
              back,
            ),
          }),
        );
      if (posted === "not_going")
        return send(
          res,
          403,
          page({
            title: "Notes",
            who,
            body: views.message(
              "Only for people going",
              "Join this meetup to post a note to the group.",
              back,
            ),
          }),
        );
      // only people going hear about a note
      events.publish(
        [`m:${meetup.id}`],
        (pid) => pid !== null && db.isGoing(meetup.id, pid),
      );
      return redirect(res, `${back}#note`);
    }
    const result = db.checkIn(meetup.id, me.id, f.get("came") === "1", now);
    if (result === "not_going")
      return send(
        res,
        403,
        page({
          title: "Check-in",
          who,
          body: views.message(
            "Only for people going",
            "Check-in is for people who joined this meetup.",
            back,
          ),
        }),
      );
    if (result === "closed")
      return send(
        res,
        409,
        page({
          title: "Check-in",
          who,
          body: views.message(
            "Check-in isn't open",
            "It opens at the start time and closes an hour later.",
            back,
          ),
        }),
      );
    if (result === "missing") return notFound(res, who);
    announce(meetup);
    return redirect(res, back);
  }

  if (
    (m = /^\/m\/(\d+)\/notes\/(\d+)\/delete$/.exec(path)) &&
    method === "POST"
  ) {
    const meetupId = db.deleteNote(Number(m[2]), me.id);
    if (meetupId === null) return notFound(res, who);
    events.publish(
      [`m:${meetupId}`],
      (pid) => pid !== null && db.isGoing(meetupId, pid),
    );
    return redirect(res, `/m/${meetupId}#note`);
  }

  if (
    (m = /^\/m\/(\d+)\/(join|leave|cancel)$/.exec(path)) &&
    method === "POST"
  ) {
    const meetup = db.meetupFor(Number(m[1]), me.id);
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
      if (result === "joined") announce(meetup);
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
        announce(meetup);
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
    if (db.cancel(meetup.id, now)) {
      announce(meetup);
      tellActivityAudience(meetup.id);
    }
    // back to the page the button was on; anything else goes to the interest
    const from = (await form(req)).get("from");
    const to =
      from === "/" || from === `/m/${meetup.id}`
        ? from
        : `/i/${meetup.interest}`;
    return redirect(res, to);
  }

  return notFound(res, who);
}

function notFound(res: ServerResponse, who: Who): void {
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

// Notes end with their meetup (ADR 0002). Queries already hide them two hours
// after the start; this deletes them, at boot and every ten minutes. unref'd
// so it never keeps the machine awake on its own.
db.purgeEndedNotes(Date.now());
setInterval(() => db.purgeEndedNotes(Date.now()), 10 * 60 * 1000).unref();

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
