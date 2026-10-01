import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { marked } from "marked";
import * as db from "./db.ts";
import { findInterest } from "./interests.ts";
import { page } from "./html.ts";
import { parseSydney, toSydneyInput } from "./time.ts";
import * as views from "./views.ts";

const COOKIE = "buddyup";
const YEAR_S = 365 * 24 * 60 * 60;

function cookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
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
  res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(html);
}

// POST → redirect → GET, so a refresh never repeats an action
function redirect(res: ServerResponse, to: string, headers: Record<string, string> = {}): void {
  res.writeHead(303, { location: to, ...headers });
  res.end();
}

// only same-site paths, so `next` can't send anyone elsewhere
function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function clean(value: string | null, max: number): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

// One set of rules for starting and editing a meetup (README commitments 1 and 2).
function readMeetupForm(f: URLSearchParams, now: number) {
  const values = {
    starts_at: f.get("starts_at") ?? "",
    place: clean(f.get("place"), 80),
    capacity: (f.get("capacity") ?? "").trim(),
    note: clean(f.get("note"), 140),
  };
  const startsAt = parseSydney(values.starts_at);
  const capacity = Number(values.capacity);
  let error = "";
  if (startsAt === null) error = "Say when: a day and a time.";
  else if (startsAt <= now) error = "That time has already passed.";
  else if (startsAt > now + db.MAX_AHEAD_MS) error = "Keep it within the next 7 days. Buddy Up is for plans that actually happen.";
  else if (!values.place) error = "Say where, exactly, so people can find you.";
  else if (!Number.isInteger(capacity) || capacity < 2 || capacity > 12) error = "Head count is 2 to 12, including you.";
  return { values, startsAt: startsAt ?? 0, capacity, error };
}

function readmeHtml(): string {
  const md = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  return `<article class="readme">${marked.parse(md, { async: false })}</article>`;
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://local");
  const path = url.pathname;
  const method = req.method ?? "GET";
  const me = db.personByToken(cookies(req)[COOKIE]);
  const now = Date.now();
  const who = me?.name ?? null;
  let m: RegExpExecArray | null;

  if (method === "GET" && path === "/") {
    const mine = me ? db.myMeetups(me.id, now) : [];
    return send(res, 200, page({ title: "Buddy Up", who, body: views.home(me, db.upcomingCounts(now), mine, db.attendees, now) }));
  }

  if (path === "/readme") return redirect(res, "/readme/");
  if (method === "GET" && path === "/readme/") {
    return send(res, 200, page({ title: "About Buddy Up", who, body: readmeHtml() }));
  }

  if (method === "GET" && path === "/me") {
    return send(res, 200, page({ title: "Nickname", who, body: views.nicknameForm("/", me?.name ?? "") }));
  }

  if (method === "POST" && path === "/me") {
    const f = await form(req);
    const name = clean(f.get("name"), 24);
    const next = safeNext(f.get("next"));
    if (!name) {
      return send(res, 400, page({ title: "Nickname", who, body: views.nicknameForm(next, "", "A nickname needs at least one character.") }));
    }
    if (me) {
      db.renamePerson(me.id, name);
      return redirect(res, next);
    }
    const person = db.createPerson(name);
    const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
    return redirect(res, next, {
      "set-cookie": `${COOKIE}=${person.token}; Path=/; Max-Age=${YEAR_S}; HttpOnly; SameSite=Lax${secure}`,
    });
  }

  if ((m = /^\/i\/([a-z]+)$/.exec(path)) && method === "GET") {
    const interest = findInterest(m[1]);
    if (!interest) return notFound(res, who);
    const list = db.upcoming(interest.slug, now);
    const going = new Set(me ? list.filter((x) => db.isGoing(x.id, me.id)).map((x) => x.id) : []);
    const body = views.interestPage(interest, me, list, going, db.finished(interest.slug, now), now, views.hostForm(interest, now));
    return send(res, 200, page({ title: `${interest.name} · Buddy Up`, who, colour: interest.colour, body }));
  }

  if ((m = /^\/i\/([a-z]+)\/meetups$/.exec(path)) && method === "POST") {
    const interest = findInterest(m[1]);
    if (!interest) return notFound(res, who);
    if (!me) return redirect(res, `/i/${interest.slug}`);
    const { values, startsAt, capacity, error } = readMeetupForm(await form(req), now);
    if (error) {
      const list = db.upcoming(interest.slug, now);
      const going = new Set(list.filter((x) => db.isGoing(x.id, me.id)).map((x) => x.id));
      const body = views.interestPage(interest, me, list, going, db.finished(interest.slug, now), now,
        views.hostForm(interest, now, values, error));
      return send(res, 400, page({ title: `${interest.name} · Buddy Up`, who, colour: interest.colour, body }));
    }
    const id = db.createMeetup({
      interest: interest.slug,
      hostId: me.id,
      startsAt,
      place: values.place,
      capacity,
      note: values.note,
    });
    return redirect(res, `/i/${interest.slug}#m${id}`);
  }

  if ((m = /^\/m\/(\d+)$/.exec(path)) && method === "GET") {
    const meetup = db.getMeetup(Number(m[1]));
    if (!meetup) return notFound(res, who);
    const interest = findInterest(meetup.interest)!;
    const going = me ? db.isGoing(meetup.id, me.id) : false;
    const body = views.meetupPage(meetup, me, going, db.attendees(meetup.id), now);
    return send(res, 200, page({ title: `${interest.name} · Buddy Up`, who, colour: interest.colour, body }));
  }

  // Editing: host only, before it starts. Time and place changes are flagged on
  // the meetup; the head count can't drop below the people already going.
  if ((m = /^\/m\/(\d+)\/edit$/.exec(path)) && (method === "GET" || method === "POST")) {
    const meetup = db.getMeetup(Number(m[1]));
    if (!meetup) return notFound(res, who);
    if (!me) return redirect(res, `/m/${meetup.id}`);
    const interest = findInterest(meetup.interest)!;
    const back = `/i/${meetup.interest}#m${meetup.id}`;
    if (meetup.host_id !== me.id) {
      return send(res, 403, page({ title: "Not yours", who, body: views.message("Not yours to edit", "Only the host can change a meetup.", back) }));
    }
    if (meetup.cancelled_at !== null || meetup.starts_at <= now) {
      return send(res, 409, page({ title: "Too late", who, body: views.message("Too late to edit", "This one has already started or been called off.", back) }));
    }
    const editing = { id: meetup.id, going: meetup.going };
    const show = (status: number, values: views.HostFormValues, error = "") =>
      send(res, status, page({
        title: `Edit · Buddy Up`, who, colour: interest.colour,
        body: views.editPage(interest, views.hostForm(interest, now, values, error, editing)),
      }));

    if (method === "GET") {
      return show(200, {
        starts_at: toSydneyInput(meetup.starts_at),
        place: meetup.place,
        capacity: String(meetup.capacity),
        note: meetup.note,
      });
    }
    const { values, startsAt, capacity, error } = readMeetupForm(await form(req), now);
    if (error) return show(400, values, error);
    const result = db.editMeetup(meetup.id, { startsAt, place: values.place, capacity, note: values.note }, now);
    if (result === "too_small") {
      const going = db.getMeetup(meetup.id)?.going ?? meetup.going;
      return show(409, values, `${going} people are already going, so the head count can't go below ${going}.`);
    }
    return redirect(res, back);
  }

  if ((m = /^\/m\/(\d+)\/(join|leave|cancel)$/.exec(path)) && method === "POST") {
    const meetup = db.getMeetup(Number(m[1]));
    if (!meetup) return notFound(res, who);
    if (!me) return redirect(res, `/m/${meetup.id}`);
    const back = `/i/${meetup.interest}#m${meetup.id}`;
    const action = m[2];

    if (action === "join") {
      const result = db.join(meetup.id, me.id, now);
      if (result === "full") {
        return send(res, 409, page({ title: "Full", who, body: views.message("Just filled up", "Someone took the last spot a moment ago. Start your own? People often want the same thing.", back) }));
      }
      if (result === "closed") {
        return send(res, 409, page({ title: "Closed", who, body: views.message("Too late to join", "This one has already started or been called off.", back) }));
      }
      return redirect(res, back);
    }

    if (meetup.host_id === me.id && action === "leave") {
      return send(res, 400, page({ title: "You're hosting", who, body: views.message("You're hosting this one", "Call it off instead, so the others know.", back) }));
    }
    if (action === "leave") {
      if (meetup.starts_at > now) db.leave(meetup.id, me.id);
      return redirect(res, back);
    }
    if (meetup.host_id !== me.id) {
      return send(res, 403, page({ title: "Not yours", who, body: views.message("Not yours to call off", "Only the host can call off a meetup.", back) }));
    }
    db.cancel(meetup.id, now);
    return redirect(res, back);
  }

  return notFound(res, who);
}

function notFound(res: ServerResponse, who: string | null): void {
  send(res, 404, page({ title: "Not here", who, body: views.message("Nothing here", "That page doesn't exist, or it's gone.", "/") }));
}

const port = Number(process.env.PORT ?? 8080);
createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) send(res, 500, page({ title: "Error", body: views.message("Something broke", "Try again in a moment.", "/") }));
    else res.end();
  });
}).listen(port, "0.0.0.0", () => console.log(`buddy up listening on :${port}`));
