import { afterEach, describe, expect, inject, it } from "vitest";
import { toSydneyInput } from "../src/time.ts";

// The testable parts of README "How good is checked", against the running app.
const baseUrl = inject("baseUrl");
const HOUR = 60 * 60 * 1000;
const tag = () => Math.random().toString(36).slice(2, 8);

async function post(
  path: string,
  body: Record<string, string>,
  cookie = "",
): Promise<Response> {
  return fetch(new URL(path, baseUrl), {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams(body),
  });
}

// a person is an account: username, display name, password; signing up
// hands back a session cookie that identifies them
const PASSWORD = "correct horse battery";
async function person(
  name = `tester-${tag()}`,
): Promise<{ name: string; username: string; cookie: string }> {
  const username = `t_${tag()}${tag()}`.slice(0, 20);
  const res = await post("/signup", { username, name, password: PASSWORD, next: "/" });
  expect(res.status).toBe(303);
  const set = res.headers.get("set-cookie") ?? "";
  expect(set).toMatch(/HttpOnly/i);
  return { name, username, cookie: set.split(";")[0] };
}

// Nothing is public, so every page is looked at by someone signed in. Tests
// that don't care who is looking share one bystander.
let bystander: Promise<string> | null = null;
function anyone(): Promise<string> {
  bystander ??= person("bystander").then((p) => p.cookie);
  return bystander;
}

async function get(path: string, cookie?: string): Promise<string> {
  const res = await fetch(new URL(path, baseUrl), {
    headers: { cookie: cookie ?? (await anyone()) },
  });
  expect(res.status).toBe(200);
  return res.text();
}

function meetupFields(
  overrides: Record<string, string> = {},
): Record<string, string> {
  return {
    starts_at: toSydneyInput(Date.now() + 3 * HOUR),
    place: `Union Court ${tag()}`,
    capacity: "4",
    note: "",
    audience: "friends",
    ...overrides,
  };
}

// Since decision 4 every meetup has an audience. Tests that aren't about who
// sees what post into a fresh circle of the host's, with the shared bystander
// in it, and anyone the test later has join goes through joinMeetup, which
// lets them into that circle first. Returns the new meetup's id.
const circleOfMeetup = new Map<number, string>();
async function host(
  cookie: string,
  overrides: Record<string, string> = {},
  interest = "coffee",
): Promise<number> {
  const cid = await circle(cookie);
  const code = await inviteCode(cookie, cid);
  await post(`/join/${code}`, {}, await anyone());
  const res = await post(
    `/i/${interest}/meetups`,
    { ...meetupFields(overrides), audience: `circle:${cid}`, ...overrides },
    cookie,
  );
  expect(res.status).toBe(303);
  const id = Number(/#m(\d+)$/.exec(res.headers.get("location") ?? "")?.[1]);
  expect(id).toBeGreaterThan(0);
  circleOfMeetup.set(id, code);
  return id;
}

// join a meetup made by host(), stepping into its circle first
async function joinMeetup(id: number, cookie: string): Promise<Response> {
  const code = circleOfMeetup.get(id);
  if (code) await post(`/join/${code}`, {}, cookie);
  return post(`/m/${id}/join`, {}, cookie);
}

describe("commitment 1: every meetup is concrete", () => {
  it("refuses a meetup with no place", async () => {
    const { cookie } = await person();
    expect(
      (await post("/i/running/meetups", meetupFields({ place: "  " }), cookie))
        .status,
    ).toBe(400);
  });

  it("refuses a meetup with no time", async () => {
    const { cookie } = await person();
    expect(
      (
        await post(
          "/i/running/meetups",
          meetupFields({ starts_at: "" }),
          cookie,
        )
      ).status,
    ).toBe(400);
  });

  it("refuses a head count outside 2 to 12", async () => {
    const { cookie } = await person();
    for (const capacity of ["1", "13", "", "four"]) {
      expect(
        (await post("/i/running/meetups", meetupFields({ capacity }), cookie))
          .status,
      ).toBe(400);
    }
  });
});

describe("commitment 2: everything is near", () => {
  it("refuses a meetup in the past", async () => {
    const { cookie } = await person();
    const res = await post(
      "/i/badminton/meetups",
      meetupFields({ starts_at: toSydneyInput(Date.now() - HOUR) }),
      cookie,
    );
    expect(res.status).toBe(400);
  });

  it("refuses a meetup more than seven days ahead", async () => {
    const { cookie } = await person();
    const res = await post(
      "/i/badminton/meetups",
      meetupFields({ starts_at: toSydneyInput(Date.now() + 8 * 24 * HOUR) }),
      cookie,
    );
    expect(res.status).toBe(400);
  });

  it("accepts one six days ahead", async () => {
    const { cookie } = await person();
    await host(
      cookie,
      { starts_at: toSydneyInput(Date.now() + 6 * 24 * HOUR) },
      "badminton",
    );
  });
});

describe("commitment 3: joining is one action, and so is leaving", () => {
  it("joins with one request, and leaving gives the spot back without a trace", async () => {
    const hostP = await person();
    const guest = await person();
    const id = await host(hostP.cookie, { capacity: "2" });

    expect((await joinMeetup(id, guest.cookie)).status).toBe(303);
    let html = await get(`/m/${id}`);
    expect(html).toContain(guest.name);
    expect(html).toContain("2/2 going");

    expect((await post(`/m/${id}/leave`, {}, guest.cookie)).status).toBe(303);
    html = await get(`/m/${id}`);
    expect(html).not.toContain(guest.name);
    expect(html).toContain("1/2 going");
    // nothing records that they were ever there ("1 spot left" is fine)
    expect(html.toLowerCase()).not.toMatch(
      /flaked|no-show|dropped out|left the meetup/,
    );
  });

  it("only the host can call a meetup off", async () => {
    const hostP = await person();
    const other = await person();
    const id = await host(hostP.cookie);
    // someone who can see it, but didn't post it
    await post(`/join/${circleOfMeetup.get(id)}`, {}, other.cookie);
    expect((await post(`/m/${id}/cancel`, {}, other.cookie)).status).toBe(403);
    expect((await post(`/m/${id}/cancel`, {}, hostP.cookie)).status).toBe(303);
  });
});

describe("commitment 4: the head count is real", () => {
  it("lets exactly one of five simultaneous joiners take the last spot", async () => {
    const hostP = await person();
    const id = await host(hostP.cookie, { capacity: "2" });
    const guests = await Promise.all([1, 2, 3, 4, 5].map(() => person()));

    const results = await Promise.all(
      guests.map((g) => joinMeetup(id, g.cookie)),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([303, 409, 409, 409, 409]);
    expect(await get(`/m/${id}`)).toContain("2/2 going");
  });
});

describe("editing: small changes without cancelling", () => {
  it("only the host can edit", async () => {
    const hostP = await person();
    const other = await person();
    const id = await host(hostP.cookie);
    // someone who can see it, but didn't post it
    await post(`/join/${circleOfMeetup.get(id)}`, {}, other.cookie);
    expect(
      (
        await fetch(new URL(`/m/${id}/edit`, baseUrl), {
          headers: { cookie: other.cookie },
        })
      ).status,
    ).toBe(403);
    expect(
      (await post(`/m/${id}/edit`, meetupFields(), other.cookie)).status,
    ).toBe(403);
  });

  it("says exactly what changed: time and place, but not an untouched head count", async () => {
    const hostP = await person();
    const id = await host(hostP.cookie, { capacity: "4" });
    const newPlace = `Moved to Hancock steps ${tag()}`;
    const res = await post(
      `/m/${id}/edit`,
      meetupFields({
        place: newPlace,
        capacity: "4",
        starts_at: toSydneyInput(Date.now() + 5 * HOUR),
      }),
      hostP.cookie,
    );
    expect(res.status).toBe(303);
    const html = await get(`/m/${id}`);
    expect(html).toContain(newPlace);
    expect(html).toContain("time changed");
    expect(html).toContain("place changed");
    expect(html).not.toContain("head count changed");
    expect(html).not.toContain("note changed");
  });

  it("flags a changed note, and only the note", async () => {
    const hostP = await person();
    const start = toSydneyInput(Date.now() + 4 * HOUR);
    const place = `Coffee Grounds ${tag()}`;
    const id = await host(hostP.cookie, {
      starts_at: start,
      place,
      note: "30 min",
    });
    const res = await post(
      `/m/${id}/edit`,
      meetupFields({ starts_at: start, place, note: "running 10 min late" }),
      hostP.cookie,
    );
    expect(res.status).toBe(303);
    const html = await get(`/m/${id}`);
    expect(html).toContain("running 10 min late");
    expect(html).toContain("note changed");
    expect(html).not.toMatch(/time changed|place changed|head count changed/);
  });

  it("won't drop the head count below the people already going", async () => {
    const hostP = await person();
    const id = await host(hostP.cookie, { capacity: "4" });
    for (const g of await Promise.all([person(), person()])) {
      expect((await joinMeetup(id, g.cookie)).status).toBe(303);
    }
    // three going (host + 2): 2 is refused, 3 is fine
    expect(
      (
        await post(
          `/m/${id}/edit`,
          meetupFields({ capacity: "2" }),
          hostP.cookie,
        )
      ).status,
    ).toBe(409);
    expect(await get(`/m/${id}`)).toContain("3/4 going");
    expect(
      (
        await post(
          `/m/${id}/edit`,
          meetupFields({ capacity: "3" }),
          hostP.cookie,
        )
      ).status,
    ).toBe(303);
    const html = await get(`/m/${id}`);
    expect(html).toContain("3/3 going");
    expect(html).toContain("head count changed");
  });

  it("holds an edit to the same rules as a new meetup", async () => {
    const hostP = await person();
    const id = await host(hostP.cookie);
    const past = toSydneyInput(Date.now() - HOUR);
    expect(
      (
        await post(
          `/m/${id}/edit`,
          meetupFields({ starts_at: past }),
          hostP.cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      (await post(`/m/${id}/edit`, meetupFields({ place: "" }), hostP.cookie))
        .status,
    ).toBe(400);
  });
});

describe("meeting point: a specific spot, separate from place", () => {
  it("shows the meeting point on the meetup page when set", async () => {
    const { cookie } = await person();
    const meetingPoint = `clock tower ${tag()}`;
    const id = await host(cookie, { meeting_point: meetingPoint });
    expect(await get(`/m/${id}`)).toContain(meetingPoint);
  });

  it("is genuinely optional: hosting with no meeting point succeeds", async () => {
    const { cookie } = await person();
    const res = await post(
      "/i/coffee/meetups",
      meetupFields({ meeting_point: "" }),
      cookie,
    );
    expect(res.status).toBe(303);
  });

  it("flags a changed meeting point, and only the meeting point", async () => {
    const hostP = await person();
    const start = toSydneyInput(Date.now() + 4 * HOUR);
    const place = `Coffee Grounds ${tag()}`;
    const id = await host(hostP.cookie, {
      starts_at: start,
      place,
      meeting_point: "front door",
    });
    const res = await post(
      `/m/${id}/edit`,
      meetupFields({ starts_at: start, place, meeting_point: "side door" }),
      hostP.cookie,
    );
    expect(res.status).toBe(303);
    const html = await get(`/m/${id}`);
    expect(html).toContain("side door");
    expect(html).toContain("meeting point changed");
    expect(html).not.toMatch(
      /time changed|place changed|head count changed|note changed/,
    );
  });

  it("escapes what people type into the meeting point", async () => {
    const { cookie } = await person();
    const id = await host(cookie, {
      meeting_point: `<script>alert(1)</script> ${tag()}`,
    });
    const html = await get(`/m/${id}`);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("you're going to: opening the app tells you where to be", () => {
  it("tells someone who joined exactly what the host changed afterwards", async () => {
    const hostP = await person();
    const guest = await person();
    const id = await host(hostP.cookie);
    expect((await joinMeetup(id, guest.cookie)).status).toBe(303);
    const newPlace = `Hancock steps ${tag()}`;
    expect(
      (
        await post(
          `/m/${id}/edit`,
          meetupFields({ place: newPlace }),
          hostP.cookie,
        )
      ).status,
    ).toBe(303);
    const home = await get("/", guest.cookie);
    expect(home).toContain(`Place changed:</b> now ${newPlace}`);
  });

  it("doesn't flag changes made before you joined", async () => {
    const hostP = await person();
    const guest = await person();
    const id = await host(hostP.cookie);
    expect(
      (
        await post(
          `/m/${id}/edit`,
          meetupFields({ note: "bring water" }),
          hostP.cookie,
        )
      ).status,
    ).toBe(303);
    await new Promise((r) => setTimeout(r, 5));
    expect((await joinMeetup(id, guest.cookie)).status).toBe(303);
    expect(await get("/", guest.cookie)).not.toContain("changed:</b>");
  });

  it("says who called a meetup off, so nobody turns up", async () => {
    const hostP = await person();
    const guest = await person();
    const id = await host(hostP.cookie);
    expect((await joinMeetup(id, guest.cookie)).status).toBe(303);
    expect((await post(`/m/${id}/cancel`, {}, hostP.cookie)).status).toBe(303);
    expect(await get("/", guest.cookie)).toContain(
      `Called off by ${hostP.name}`,
    );
  });
});

describe("persistence: your trace is there when you come back", () => {
  it("shows a meetup and who's going on a fresh visit, and to the host on return", async () => {
    const hostP = await person();
    const place = `Coffee Grounds ${tag()}`;
    const id = await host(hostP.cookie, { place });

    const someone = await get(`/m/${id}`);
    expect(someone).toContain(place);
    expect(someone).toContain(hostP.name);

    const back = await get("/", hostP.cookie);
    expect(back).toContain(place);
    expect(back).toContain(hostP.name);
  });
});

// A page that's already open hears about a change. Every stream opened here is
// aborted afterwards: the harness doesn't own the app, so nothing would close
// them for us and vitest would sit waiting on the socket.
const streaming = new Set<AbortController>();
afterEach(() => {
  for (const ac of streaming) ac.abort();
  streaming.clear();
});

async function listen(
  topics: string,
  cookie?: string,
): Promise<{ res: Response; next: (ms?: number) => Promise<string | null> }> {
  const ac = new AbortController();
  streaming.add(ac);
  const res = await fetch(
    new URL(`/events?topics=${encodeURIComponent(topics)}`, baseUrl),
    {
      headers: { accept: "text/event-stream", cookie: cookie ?? (await anyone()) },
      signal: ac.signal,
    },
  );
  // The server registers a subscriber before it writes the headers, so by the
  // time this resolves it is listening — a change published next cannot be
  // missed, and the test needs no sleep to avoid the race.
  const frames = events(res);
  return {
    res,
    next: (ms = 5000) =>
      Promise.race([
        frames.next().then((r) => (r.done ? null : r.value)),
        new Promise<null>((resolve) => {
          const t = setTimeout(() => resolve(null), ms);
          if (typeof t === "object") t.unref?.();
        }),
      ]),
  };
}

// SSE frames are separated by a blank line and can split across chunks.
// Comment-only frames are the heartbeat, not an event.
async function* events(res: Response): AsyncGenerator<string> {
  if (!res.body) return;
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    let at: number;
    while ((at = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, at);
      buffer = buffer.slice(at + 2);
      if (frame.includes("data:")) yield frame;
    }
  }
}

describe("live: a change reaches a page that's already open", () => {
  it("tells an open meetup page that someone joined", async () => {
    const hostP = await person();
    const guest = await person();
    const id = await host(hostP.cookie);

    const watcher = await listen(`m:${id}`);
    expect(watcher.res.status).toBe(200);
    expect(watcher.res.headers.get("content-type")).toMatch(
      /^text\/event-stream/,
    );

    expect((await joinMeetup(id, guest.cookie)).status).toBe(303);
    expect(await watcher.next()).toContain("event: change");
  });

  it("doesn't wake a page for a change it can't see", async () => {
    const hostP = await person();
    const guest = await person();
    const mine = await host(hostP.cookie);
    const other = await host(hostP.cookie, {}, "running");

    const watcher = await listen(`m:${mine}`);
    expect((await joinMeetup(other, guest.cookie)).status).toBe(303);
    expect(await watcher.next(1200)).toBe(null);
  });

  // The signal says a topic moved and nothing else. Everything a page then
  // shows comes from re-fetching it under the viewer's own cookie, so the
  // stream itself never has to be trusted with who may see what.
  it("carries no one's name or place down the wire", async () => {
    const hostP = await person();
    const guest = await person();
    const place = `Secret Garden ${tag()}`;
    const id = await host(hostP.cookie, { place });

    const watcher = await listen(`m:${id}`);
    expect((await joinMeetup(id, guest.cookie)).status).toBe(303);
    const frame = await watcher.next();
    expect(frame).toContain("event: change");
    expect(frame).not.toContain(guest.name);
    expect(frame).not.toContain(place);
  });

  // A browser gives up on an EventSource for good if the response isn't 200
  // text/event-stream. Turning someone away has to still look like a stream,
  // or that tab is silently dead until the person reloads.
  it("turns an over-limit connection away without killing it", async () => {
    const crowd = await person();
    for (let i = 0; i < 3; i++) {
      expect((await listen("i:coffee", crowd.cookie)).res.status).toBe(200);
    }
    const refused = await listen("i:coffee", crowd.cookie);
    expect(refused.res.status).toBe(200);
    expect(refused.res.headers.get("content-type")).toMatch(
      /^text\/event-stream/,
    );
    expect(await refused.res.text()).toContain("retry:");
  });

  it("refuses nonsense topics instead of tracking them", async () => {
    for (const topics of ["", "not-a-topic", "m:" + "9".repeat(40)]) {
      const res = await listen(topics);
      expect(res.res.status).toBe(200);
      expect(await res.res.text()).toContain("retry:");
    }
  });

  // CLAUDE.md: script may enhance a page, never be required.
  it("still works with the script off", async () => {
    const hostP = await person();
    const id = await host(hostP.cookie);
    const html = await get(`/m/${id}`);
    // the state and the way to act on it are both in the HTML already
    expect(html).toContain("1/4 going");
    expect(html).toContain(`action="/m/${id}/join"`);
    // nothing to download and no build step: whatever script there is, is inline
    expect(html).not.toMatch(/<script[^>]+src=/);
  });
});

describe("safety", () => {
  it("escapes what people type", async () => {
    const { cookie } = await person();
    const id = await host(cookie, {
      place: `<script>alert(1)</script> ${tag()}`,
    });
    const html = await get(`/m/${id}`);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("accounts: only people who signed in, as themselves", () => {
  it("shows a signed-out visitor nothing but the way in", async () => {
    const hostP = await person();
    const place = `Hidden Lawn ${tag()}`;
    const id = await host(hostP.cookie, { place });
    for (const path of [`/m/${id}`, "/i/coffee"]) {
      const res = await fetch(new URL(path, baseUrl), { redirect: "manual" });
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toMatch(/^\/login\?next=/);
    }
    const home = await (await fetch(new URL("/", baseUrl))).text();
    expect(home).not.toContain(place);
    expect(home).toContain('href="/login"');
    // and signed out, nothing can be done either
    const join = await post(`/m/${id}/join`, {});
    expect(join.headers.get("location")).toBe("/login");
    const watcher = await listen(`m:${id}`, "");
    expect(await watcher.res.text()).toContain("retry:");
  });

  it("refuses a username that's taken, whatever its case", async () => {
    const p = await person();
    const res = await post("/signup", { username: p.username.toUpperCase(), name: "copy", password: PASSWORD });
    expect(res.status).toBe(400);
  });

  it("refuses a short password or a malformed username", async () => {
    expect((await post("/signup", { username: `t_${tag()}`, name: "x", password: "short" })).status).toBe(400);
    expect((await post("/signup", { username: "no spaces here", name: "x", password: PASSWORD })).status).toBe(400);
  });

  it("logs in with the right password, and says the same thing for any wrong one", async () => {
    const p = await person();
    const ok = await post("/login", { username: p.username, password: PASSWORD });
    expect(ok.status).toBe(303);
    expect(ok.headers.get("set-cookie")).toMatch(/HttpOnly/i);

    const wrongPass = await post("/login", { username: p.username, password: "not it at all" });
    const noSuchUser = await post("/login", { username: `nobody_${tag()}`, password: PASSWORD });
    expect(wrongPass.status).toBe(401);
    expect(noSuchUser.status).toBe(401);
    const a = await wrongPass.text();
    const b = await noSuchUser.text();
    expect(a).toContain("Username or password is wrong.");
    expect(b).toContain("Username or password is wrong.");
    // and the password typed is never echoed back into the page
    expect(a).not.toContain("not it at all");
  });

  it("ends the session on log out, and only that one", async () => {
    const p = await person();
    const other = await post("/login", { username: p.username, password: PASSWORD });
    const laptop = (other.headers.get("set-cookie") ?? "").split(";")[0];

    expect((await post("/logout", {}, p.cookie)).status).toBe(303);
    const after = await fetch(new URL("/i/coffee", baseUrl), { headers: { cookie: p.cookie }, redirect: "manual" });
    expect(after.status).toBe(303);
    expect(await get("/i/coffee", laptop)).toContain("Coffee");
  });

  it("locks a username after five wrong guesses, even against the right password", async () => {
    const p = await person();
    for (let i = 0; i < 5; i++) {
      expect((await post("/login", { username: p.username, password: `guess ${i} wrong` })).status).toBe(401);
    }
    const right = await post("/login", { username: p.username, password: PASSWORD });
    expect(right.status).toBe(429);
    expect(right.headers.get("set-cookie")).toBe(null);
  });
});

// ---- Circles (decision 4, step 2) ----

async function circle(cookie: string, name = `Circle ${tag()}`): Promise<number> {
  const res = await post("/circles", { name }, cookie);
  expect(res.status).toBe(303);
  const id = Number(/^\/c\/(\d+)$/.exec(res.headers.get("location") ?? "")?.[1]);
  expect(id).toBeGreaterThan(0);
  return id;
}

// any member can read the invite link off the circle page
async function inviteCode(cookie: string, circleId: number): Promise<string> {
  const html = await get(`/c/${circleId}`, cookie);
  const code = /\/join\/([A-Za-z0-9_-]+)"/.exec(html)?.[1];
  expect(code).toBeTruthy();
  return code!;
}

async function joinCircle(cookie: string, code: string): Promise<Response> {
  return post(`/join/${code}`, {}, cookie);
}

describe("circles: a group joined by invite, at most 25", () => {
  it("lets someone in by invite, and shows them in the member list", async () => {
    const owner = await person();
    const friend = await person();
    const id = await circle(owner.cookie);
    const code = await inviteCode(owner.cookie, id);

    // opening the link only asks; it doesn't join
    expect(await get(`/join/${code}`, friend.cookie)).toContain(`action="/join/${code}"`);
    expect(await get(`/c/${id}`, owner.cookie)).not.toContain(friend.name);

    expect((await joinCircle(friend.cookie, code)).status).toBe(303);
    const page = await get(`/c/${id}`, friend.cookie);
    expect(page).toContain(friend.name);
    expect(page).toContain(owner.name);
    // any member can share the link, not just the owner
    expect(page).toContain(`/join/${code}`);
  });

  it("doesn't exist to someone outside it", async () => {
    const owner = await person();
    const outsider = await person();
    const id = await circle(owner.cookie, `Private ${tag()}`);
    const res = await fetch(new URL(`/c/${id}`, baseUrl), { headers: { cookie: outsider.cookie } });
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("Private");
  });

  it("refuses a 26th member, even when several arrive at once", async () => {
    const owner = await person();
    const id = await circle(owner.cookie);
    const code = await inviteCode(owner.cookie, id);
    const first = await Promise.all(Array.from({ length: 23 }, () => person()));
    for (const p of first) expect((await joinCircle(p.cookie, code)).status).toBe(303);
    // 24 in; five people race for the 25th place
    const racers = await Promise.all(Array.from({ length: 5 }, () => person()));
    const statuses = (await Promise.all(racers.map((p) => joinCircle(p.cookie, code)))).map((r) => r.status).sort();
    expect(statuses).toEqual([303, 409, 409, 409, 409]);
    expect(await get(`/c/${id}`, owner.cookie)).toContain("25 of 25 people");
  });

  it("kills the old link when the owner resets it, and only the owner can", async () => {
    const owner = await person();
    const member = await person();
    const late = await person();
    const id = await circle(owner.cookie);
    const oldCode = await inviteCode(owner.cookie, id);
    expect((await joinCircle(member.cookie, oldCode)).status).toBe(303);

    expect((await post(`/c/${id}/reset`, {}, member.cookie)).status).toBe(403);
    expect((await post(`/c/${id}/reset`, {}, owner.cookie)).status).toBe(303);

    expect((await joinCircle(late.cookie, oldCode)).status).toBe(404);
    const newCode = await inviteCode(owner.cookie, id);
    expect(newCode).not.toBe(oldCode);
    expect((await joinCircle(late.cookie, newCode)).status).toBe(303);
  });

  it("hands the circle on when its owner leaves, and shuts you out once you've left", async () => {
    const owner = await person();
    const second = await person();
    const id = await circle(owner.cookie);
    expect((await joinCircle(second.cookie, await inviteCode(owner.cookie, id))).status).toBe(303);

    expect((await post(`/c/${id}/leave`, {}, owner.cookie)).status).toBe(303);
    const gone = await fetch(new URL(`/c/${id}`, baseUrl), { headers: { cookie: owner.cookie } });
    expect(gone.status).toBe(404);
    // the earliest remaining member now owns it, so can reset it
    expect((await post(`/c/${id}/reset`, {}, second.cookie)).status).toBe(303);
  });
});

// ---- Friends (decision 4, step 3) ----

async function ask(fromCookie: string, username: string): Promise<Response> {
  return post("/friends", { username }, fromCookie);
}

// The id the app uses for someone, read off the asker's own friends page.
async function idOf(cookie: string, username: string): Promise<number> {
  const html = await get("/friends", cookie);
  const at = html.indexOf(`@${username}`);
  expect(at).toBeGreaterThan(-1);
  const id = /\/friends\/(\d+)\//.exec(html.slice(at))?.[1];
  return Number(id);
}

async function befriend(a: { cookie: string }, b: { cookie: string; username: string }, aUsername: string): Promise<void> {
  expect((await ask(a.cookie, b.username)).status).toBe(303);
  const id = await idOf(b.cookie, aUsername);
  expect((await post(`/friends/${id}/accept`, {}, b.cookie)).status).toBe(303);
}

describe("friends: both ways, and only you see yours", () => {
  it("becomes friends when one asks and the other accepts", async () => {
    const a = await person();
    const b = await person();
    expect((await ask(a.cookie, b.username)).status).toBe(303);
    // b sees it waiting, with a count in the header
    const bPage = await get("/friends", b.cookie);
    expect(bPage).toContain("Want to be your friend");
    expect(bPage).toContain(`@${a.username}`);
    expect(bPage).toContain("Friends <span class=\"count\">(1)</span>");

    const id = await idOf(b.cookie, a.username);
    expect((await post(`/friends/${id}/accept`, {}, b.cookie)).status).toBe(303);
    expect(await get("/friends", a.cookie)).toContain(`@${b.username}`);
    expect(await get("/friends", b.cookie)).not.toContain("Want to be your friend");
  });

  it("says plainly when there's no such username, and won't add yourself", async () => {
    const a = await person();
    const missing = await ask(a.cookie, `nobody_${tag()}`);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain("no one with the username");
    expect((await ask(a.cookie, a.username)).status).toBe(400);
  });

  it("makes two people friends at once when they ask each other", async () => {
    const a = await person();
    const b = await person();
    expect((await ask(a.cookie, b.username)).status).toBe(303);
    const both = await ask(b.cookie, a.username);
    expect(both.headers.get("location")).toBe("/friends?done=friends");
    expect(await get("/friends", a.cookie)).toContain(`@${b.username}`);
  });

  it("declines quietly, and won't let the same person ask again within a week", async () => {
    const a = await person();
    const b = await person();
    expect((await ask(a.cookie, b.username)).status).toBe(303);
    const id = await idOf(b.cookie, a.username);
    expect((await post(`/friends/${id}/decline`, {}, b.cookie)).status).toBe(303);

    const aPage = await get("/friends", a.cookie);
    expect(aPage).not.toContain(`@${b.username}`);
    expect(aPage.toLowerCase()).not.toContain("declined");
    expect((await ask(a.cookie, b.username)).status).toBe(429);
  });

  it("removes a friend from both lists, telling no one", async () => {
    const a = await person();
    const b = await person();
    await befriend(a, b, a.username);
    const id = await idOf(a.cookie, b.username);
    expect((await post(`/friends/${id}/remove`, {}, a.cookie)).status).toBe(303);
    expect(await get("/friends", a.cookie)).not.toContain(`@${b.username}`);
    expect(await get("/friends", b.cookie)).not.toContain(`@${a.username}`);
  });

  it("never shows anyone else's friends", async () => {
    const a = await person();
    const b = await person();
    const c = await person();
    await befriend(a, b, a.username);
    // c looks everywhere it can; a's friend b appears nowhere
    for (const path of ["/", "/friends", "/circles", "/i/coffee", "/i/running", "/me"]) {
      const html = await get(path, c.cookie);
      expect(html).not.toContain(b.username);
      expect(html).not.toContain(b.name);
    }
  });
});

// ---- Who can see a meetup (decision 4, step 4) ----
// README commitment 5: you only meet people you know.

async function postTo(
  cookie: string,
  audience: string,
  overrides: Record<string, string> = {},
  interest = "badminton",
): Promise<{ res: Response; id: number; place: string }> {
  const place = `Secret court ${tag()}`;
  const res = await post(`/i/${interest}/meetups`, { ...meetupFields({ place, ...overrides }), audience }, cookie);
  const id = Number(/#m(\d+)$/.exec(res.headers.get("location") ?? "")?.[1] ?? 0);
  return { res, id, place };
}

async function status(path: string, cookie: string): Promise<number> {
  return (await fetch(new URL(path, baseUrl), { headers: { cookie }, redirect: "manual" })).status;
}

describe("audience: a meetup reaches its circle or the host's friends, no one else", () => {
  it("shows a circle's meetup to its members and to no one outside", async () => {
    const hostP = await person();
    const member = await person();
    const outsider = await person();
    const cid = await circle(hostP.cookie, `Hall ${tag()}`);
    expect((await joinCircle(member.cookie, await inviteCode(hostP.cookie, cid))).status).toBe(303);
    const { res, id, place } = await postTo(hostP.cookie, `circle:${cid}`);
    expect(res.status).toBe(303);

    // the member sees it in the list, on its page, and can join
    expect(await get("/i/badminton", member.cookie)).toContain(place);
    expect(await get(`/m/${id}`, member.cookie)).toContain(place);
    expect((await post(`/m/${id}/join`, {}, member.cookie)).status).toBe(303);

    // the outsider: not in the list, a 404 for the page, and can't join
    expect(await get("/i/badminton", outsider.cookie)).not.toContain(place);
    expect(await status(`/m/${id}`, outsider.cookie)).toBe(404);
    expect((await post(`/m/${id}/join`, {}, outsider.cookie)).status).toBe(404);
    expect((await post(`/m/${id}/edit`, meetupFields(), outsider.cookie)).status).toBe(404);
  });

  it("keeps its live updates from anyone who can't see it", async () => {
    const hostP = await person();
    const member = await person();
    const outsider = await person();
    const cid = await circle(hostP.cookie);
    const code = await inviteCode(hostP.cookie, cid);
    expect((await joinCircle(member.cookie, code)).status).toBe(303);
    const { id } = await postTo(hostP.cookie, `circle:${cid}`, {}, "running");

    // watching the meetup itself is refused outright
    const peek = await listen(`m:${id}`, outsider.cookie);
    expect(await peek.res.text()).toContain("retry:");

    // watching the list: the member hears a join, the outsider hears nothing
    const inside = await listen("i:running", member.cookie);
    const outside = await listen("i:running", outsider.cookie);
    const joiner = await person();
    expect((await joinCircle(joiner.cookie, code)).status).toBe(303);
    expect((await post(`/m/${id}/join`, {}, joiner.cookie)).status).toBe(303);
    expect(await inside.next()).toContain("event: change");
    expect(await outside.next(1200)).toBe(null);
  });

  it("shows a friends meetup to direct friends only, never friends of friends", async () => {
    const hostP = await person();
    const friend = await person();
    const friendOfFriend = await person();
    await befriend(hostP, friend, hostP.username);
    await befriend(friend, friendOfFriend, friend.username);
    const { id, place } = await postTo(hostP.cookie, "friends", {}, "coffee");

    expect(await get(`/m/${id}`, friend.cookie)).toContain(place);
    expect(await status(`/m/${id}`, friendOfFriend.cookie)).toBe(404);
    expect(await get("/i/coffee", friendOfFriend.cookie)).not.toContain(place);
  });

  it("stops showing new meetups to someone who left the circle or lost the friendship", async () => {
    const hostP = await person();
    const was = await person();
    const cid = await circle(hostP.cookie);
    expect((await joinCircle(was.cookie, await inviteCode(hostP.cookie, cid))).status).toBe(303);
    await befriend(hostP, was, hostP.username);

    expect((await post(`/c/${cid}/leave`, {}, was.cookie)).status).toBe(303);
    const wasId = await idOf(hostP.cookie, was.username);
    expect((await post(`/friends/${wasId}/remove`, {}, hostP.cookie)).status).toBe(303);

    const inCircle = await postTo(hostP.cookie, `circle:${cid}`);
    const toFriends = await postTo(hostP.cookie, "friends");
    expect(await status(`/m/${inCircle.id}`, was.cookie)).toBe(404);
    expect(await status(`/m/${toFriends.id}`, was.cookie)).toBe(404);
  });

  it("keeps a meetup you already joined, even after you leave its circle", async () => {
    const hostP = await person();
    const guest = await person();
    const cid = await circle(hostP.cookie);
    expect((await joinCircle(guest.cookie, await inviteCode(hostP.cookie, cid))).status).toBe(303);
    const { id, place } = await postTo(hostP.cookie, `circle:${cid}`);
    expect((await post(`/m/${id}/join`, {}, guest.cookie)).status).toBe(303);

    expect((await post(`/c/${cid}/leave`, {}, guest.cookie)).status).toBe(303);
    expect(await get(`/m/${id}`, guest.cookie)).toContain(place);
    expect(await get("/", guest.cookie)).toContain(place);
  });

  it("won't post to a circle you're not in, or to no one in particular", async () => {
    const owner = await person();
    const stranger = await person();
    const cid = await circle(owner.cookie);
    expect((await postTo(stranger.cookie, `circle:${cid}`)).res.status).toBe(400);
    expect((await postTo(stranger.cookie, "everyone")).res.status).toBe(400);
    expect((await postTo(stranger.cookie, "")).res.status).toBe(400);
  });

  it("doesn't offer to change who it's for once it's posted", async () => {
    const hostP = await person();
    const id = await host(hostP.cookie);
    const edit = await get(`/m/${id}/edit`, hostP.cookie);
    expect(edit).toContain("can't change after posting");
    expect(edit).not.toContain('name="audience"');
  });
});

// ---- Notes and check-in (ADR 0002) ----

// a meetup in a circle of the host's, with `goers` joined and `watchers`
// in the circle but not going
async function gathering(goers: number, watchers: number, overrides: Record<string, string> = {}) {
  const hostP = await person();
  const cid = await circle(hostP.cookie);
  const code = await inviteCode(hostP.cookie, cid);
  const going = await Promise.all(Array.from({ length: goers }, () => person()));
  const looking = await Promise.all(Array.from({ length: watchers }, () => person()));
  for (const p of [...going, ...looking]) expect((await joinCircle(p.cookie, code)).status).toBe(303);
  const { id } = await postTo(hostP.cookie, `circle:${cid}`, overrides, "running");
  for (const p of going) expect((await post(`/m/${id}/join`, {}, p.cookie)).status).toBe(303);
  return { hostP, id, going, looking, cid };
}

describe("notes: a notice board for the people going, only while it's on", () => {
  it("is read and written by people going, and only them", async () => {
    const { hostP, id, going, looking } = await gathering(1, 1);
    const [goer] = going;
    const [watcher] = looking;
    const note = `running 5 late ${tag()}`;
    expect((await post(`/m/${id}/notes`, { body: note }, goer.cookie)).status).toBe(303);

    expect(await get(`/m/${id}`, hostP.cookie)).toContain(note);
    expect(await get(`/m/${id}`, goer.cookie)).toContain(note);
    // can see the meetup, isn't going: no notes, and can't post one
    const theirs = await get(`/m/${id}`, watcher.cookie);
    expect(theirs).not.toContain(note);
    expect(theirs).toContain("Join to see what the group is saying");
    expect((await post(`/m/${id}/notes`, { body: "hi" }, watcher.cookie)).status).toBe(403);
  });

  it("cuts you off when you leave, and escapes what's written", async () => {
    const { id, going } = await gathering(2, 0);
    const [stays, leaves] = going;
    const mark = `mark${tag()}`;
    const note = `<img src=x onerror=alert(1)> ${mark}`;
    expect((await post(`/m/${id}/notes`, { body: note }, stays.cookie)).status).toBe(303);
    const html = await get(`/m/${id}`, leaves.cookie);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");

    expect((await post(`/m/${id}/leave`, {}, leaves.cookie)).status).toBe(303);
    // (the page's own live-update script says "onerror", so look for the note's mark)
    expect(await get(`/m/${id}`, leaves.cookie)).not.toContain(mark);
  });

  it("lets the author or the host delete a note, and nobody else", async () => {
    const { hostP, id, going } = await gathering(2, 0);
    const [author, other] = going;
    const note = `wrong park ${tag()}`;
    expect((await post(`/m/${id}/notes`, { body: note }, author.cookie)).status).toBe(303);
    const noteId = /\/notes\/(\d+)\/delete/.exec(await get(`/m/${id}`, author.cookie))?.[1];
    expect(noteId).toBeTruthy();
    // the other goer sees no delete button and can't delete it
    expect(await get(`/m/${id}`, other.cookie)).not.toContain(`/notes/${noteId}/delete`);
    expect((await post(`/m/${id}/notes/${noteId}/delete`, {}, other.cookie)).status).toBe(404);
    expect((await post(`/m/${id}/notes/${noteId}/delete`, {}, hostP.cookie)).status).toBe(303);
    expect(await get(`/m/${id}`, author.cookie)).not.toContain(note);
  });

  it("tells people going about a new note, and nobody else", async () => {
    const { id, going, looking } = await gathering(2, 1);
    const [writer, reader] = going;
    const inside = await listen(`m:${id}`, reader.cookie);
    const outside = await listen(`m:${id}`, looking[0].cookie);
    expect((await post(`/m/${id}/notes`, { body: "on my way" }, writer.cookie)).status).toBe(303);
    expect(await inside.next()).toContain("event: change");
    expect(await outside.next(1200)).toBe(null);
  });
});

describe("check-in: self-reported, shown only as a count", () => {
  it("isn't open before the start", async () => {
    const { id, going } = await gathering(1, 0);
    const res = await post(`/m/${id}/checkin`, { came: "1" }, going[0].cookie);
    expect(res.status).toBe(409);
    expect(await get(`/m/${id}`, going[0].cookie)).not.toContain("checked in");
  });

  // The form only takes whole minutes, so this waits for the next minute to
  // start: up to a minute of real time.
  it("opens at the start for people going, and only ever shows a number", { timeout: 90_000 }, async () => {
    const startsAt = Math.ceil((Date.now() + 2000) / 60000) * 60000;
    const { hostP, id, going, looking } = await gathering(1, 1, { starts_at: toSydneyInput(startsAt) });
    const [goer] = going;
    await new Promise((r) => setTimeout(r, startsAt - Date.now() + 500));

    expect((await post(`/m/${id}/checkin`, { came: "1" }, goer.cookie)).status).toBe(303);
    expect((await post(`/m/${id}/checkin`, { came: "1" }, looking[0].cookie)).status).toBe(403);

    const html = await get(`/m/${id}`, hostP.cookie);
    const section = /<section class="checkin">([\s\S]*?)<\/section>/.exec(html)?.[1] ?? "";
    expect(section).toContain("1 of 2");
    // a count, never who
    expect(section).not.toContain(goer.name);
    expect(section).not.toContain(hostP.name);

    // and it can be taken back
    expect((await post(`/m/${id}/checkin`, { came: "0" }, goer.cookie)).status).toBe(303);
    expect(await get(`/m/${id}`, goer.cookie)).toContain("0 of 2");
  });
});

describe("replies: answer a note with words or a quick emoji, never a count", () => {
  async function noteId(cookie: string, meetupId: number, text: string): Promise<string> {
    const html = await get(`/m/${meetupId}`, cookie);
    const at = html.indexOf(text);
    expect(at).toBeGreaterThan(-1);
    return /name="reply_to" value="(\d+)"/.exec(html.slice(at))![1];
  }

  it("lets people going reply in words or with a quick emoji, shown by name", async () => {
    const { id, going, looking } = await gathering(2, 1);
    const [a, b] = going;
    const note = `rain plan? ${tag()}`;
    expect((await post(`/m/${id}/notes`, { body: note }, a.cookie)).status).toBe(303);
    const nid = await noteId(a.cookie, id, note);

    const words = `indoors then 🏸 ${tag()}`;
    expect((await post(`/m/${id}/notes`, { body: words, reply_to: nid }, b.cookie)).status).toBe(303);
    expect((await post(`/m/${id}/notes`, { quick: "💪", reply_to: nid }, a.cookie)).status).toBe(303);
    const html = await get(`/m/${id}`, b.cookie);
    expect(html).toContain(words);
    expect(html).toContain(`<b>${a.name}</b> <span class="reply-body">💪</span>`);

    // not going: can't see them, can't reply
    expect(await get(`/m/${id}`, looking[0].cookie)).not.toContain(words);
    expect((await post(`/m/${id}/notes`, { quick: "💪", reply_to: nid }, looking[0].cookie)).status).toBe(403);
  });

  it("never adds quick replies up into a count", async () => {
    const { id, going } = await gathering(3, 0);
    const note = `see you there ${tag()}`;
    expect((await post(`/m/${id}/notes`, { body: note }, going[0].cookie)).status).toBe(303);
    const nid = await noteId(going[0].cookie, id, note);
    for (const p of going) expect((await post(`/m/${id}/notes`, { quick: "❤️", reply_to: nid }, p.cookie)).status).toBe(303);
    const html = await get(`/m/${id}`, going[0].cookie);
    for (const p of going) expect(html).toContain(`<b>${p.name}</b> <span class="reply-body">❤️</span>`);
    expect(html).not.toMatch(/❤️\s*(×|x)?\s*\d/);
  });

  it("only offers the listed quick replies, and no replies to replies", async () => {
    const { id, going } = await gathering(1, 0);
    const note = `meet at gate ${tag()}`;
    expect((await post(`/m/${id}/notes`, { body: note }, going[0].cookie)).status).toBe(303);
    const nid = await noteId(going[0].cookie, id, note);
    expect((await post(`/m/${id}/notes`, { quick: "<b>x</b>", reply_to: nid }, going[0].cookie)).status).toBe(400);
    const reply = `ok ${tag()}`;
    expect((await post(`/m/${id}/notes`, { body: reply, reply_to: nid }, going[0].cookie)).status).toBe(303);
    const html = await get(`/m/${id}`, going[0].cookie);
    // the reply's own id: the highest note id on the page
    const ids = [...html.matchAll(/\/notes\/(\d+)\/delete/g)].map((x) => Number(x[1]));
    const newest = String(Math.max(...ids));
    expect(newest).not.toBe(nid);
    expect((await post(`/m/${id}/notes`, { body: "deeper", reply_to: newest }, going[0].cookie)).status).toBe(400);
  });

  it("takes a note's replies with it when the note is deleted", async () => {
    const { id, going } = await gathering(2, 0);
    const note = `old plan ${tag()}`;
    expect((await post(`/m/${id}/notes`, { body: note }, going[0].cookie)).status).toBe(303);
    const nid = await noteId(going[0].cookie, id, note);
    const reply = `sounds good ${tag()}`;
    expect((await post(`/m/${id}/notes`, { body: reply, reply_to: nid }, going[1].cookie)).status).toBe(303);
    expect((await post(`/m/${id}/notes/${nid}/delete`, {}, going[0].cookie)).status).toBe(303);
    expect(await get(`/m/${id}`, going[1].cookie)).not.toContain(reply);
  });
});

describe("quick notes: one tap for the moment of meeting up", () => {
  it("posts one of the four, as a note people going can see", async () => {
    const { id, going } = await gathering(2, 0);
    const [here, waiting] = going;
    expect((await post(`/m/${id}/notes`, { quick: "I'm here" }, here.cookie)).status).toBe(303);
    expect(await get(`/m/${id}`, waiting.cookie)).toContain("I&#39;m here");
    expect((await post(`/m/${id}/notes`, { quick: "Come to my party" }, here.cookie)).status).toBe(400);
  });
});

describe("signed out, the header offers only what's there", () => {
  it("shows About and Log in, not links that only lead to the login page", async () => {
    const html = await (await fetch(new URL("/", baseUrl))).text();
    const nav = /<nav class="nav"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? "";
    expect(nav).toContain('href="/readme/"');
    expect(nav).not.toContain('href="/i/');
    expect(nav).not.toContain('href="/circles"');
    expect(await get("/")).toContain('href="/circles"');
  });
});
