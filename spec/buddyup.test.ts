import { describe, expect, inject, it } from "vitest";
import { toSydneyInput } from "../src/time.ts";

// The testable parts of README "How good is checked", against the running app.
const baseUrl = inject("baseUrl");
const HOUR = 60 * 60 * 1000;
const tag = () => Math.random().toString(36).slice(2, 8);

async function post(path: string, body: Record<string, string>, cookie = ""): Promise<Response> {
  return fetch(new URL(path, baseUrl), {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: new URLSearchParams(body),
  });
}

async function get(path: string, cookie = ""): Promise<string> {
  const res = await fetch(new URL(path, baseUrl), { headers: { cookie } });
  expect(res.status).toBe(200);
  return res.text();
}

// a person is a nickname; the app hands back a cookie that identifies them
async function person(name = `tester-${tag()}`): Promise<{ name: string; cookie: string }> {
  const res = await post("/me", { name, next: "/" });
  expect(res.status).toBe(303);
  const set = res.headers.get("set-cookie") ?? "";
  expect(set).toMatch(/HttpOnly/i);
  return { name, cookie: set.split(";")[0] };
}

function meetupFields(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    starts_at: toSydneyInput(Date.now() + 3 * HOUR),
    place: `Union Court ${tag()}`,
    capacity: "4",
    note: "",
    ...overrides,
  };
}

// returns the new meetup's id
async function host(cookie: string, overrides: Record<string, string> = {}, interest = "coffee"): Promise<number> {
  const res = await post(`/i/${interest}/meetups`, meetupFields(overrides), cookie);
  expect(res.status).toBe(303);
  const id = Number(/#m(\d+)$/.exec(res.headers.get("location") ?? "")?.[1]);
  expect(id).toBeGreaterThan(0);
  return id;
}

describe("commitment 1: every meetup is concrete", () => {
  it("refuses a meetup with no place", async () => {
    const { cookie } = await person();
    expect((await post("/i/running/meetups", meetupFields({ place: "  " }), cookie)).status).toBe(400);
  });

  it("refuses a meetup with no time", async () => {
    const { cookie } = await person();
    expect((await post("/i/running/meetups", meetupFields({ starts_at: "" }), cookie)).status).toBe(400);
  });

  it("refuses a head count outside 2 to 12", async () => {
    const { cookie } = await person();
    for (const capacity of ["1", "13", "", "four"]) {
      expect((await post("/i/running/meetups", meetupFields({ capacity }), cookie)).status).toBe(400);
    }
  });
});

describe("commitment 2: everything is near", () => {
  it("refuses a meetup in the past", async () => {
    const { cookie } = await person();
    const res = await post("/i/badminton/meetups", meetupFields({ starts_at: toSydneyInput(Date.now() - HOUR) }), cookie);
    expect(res.status).toBe(400);
  });

  it("refuses a meetup more than seven days ahead", async () => {
    const { cookie } = await person();
    const res = await post("/i/badminton/meetups", meetupFields({ starts_at: toSydneyInput(Date.now() + 8 * 24 * HOUR) }), cookie);
    expect(res.status).toBe(400);
  });

  it("accepts one six days ahead", async () => {
    const { cookie } = await person();
    await host(cookie, { starts_at: toSydneyInput(Date.now() + 6 * 24 * HOUR) }, "badminton");
  });
});

describe("commitment 3: joining is one action, and so is leaving", () => {
  it("joins with one request, and leaving gives the spot back without a trace", async () => {
    const hostP = await person();
    const guest = await person();
    const id = await host(hostP.cookie, { capacity: "2" });

    expect((await post(`/m/${id}/join`, {}, guest.cookie)).status).toBe(303);
    let html = await get(`/m/${id}`);
    expect(html).toContain(guest.name);
    expect(html).toContain("2/2 going");

    expect((await post(`/m/${id}/leave`, {}, guest.cookie)).status).toBe(303);
    html = await get(`/m/${id}`);
    expect(html).not.toContain(guest.name);
    expect(html).toContain("1/2 going");
    // nothing records that they were ever there ("1 spot left" is fine)
    expect(html.toLowerCase()).not.toMatch(/flaked|no-show|dropped out|left the meetup/);
  });

  it("only the host can call a meetup off", async () => {
    const hostP = await person();
    const other = await person();
    const id = await host(hostP.cookie);
    expect((await post(`/m/${id}/cancel`, {}, other.cookie)).status).toBe(403);
    expect((await post(`/m/${id}/cancel`, {}, hostP.cookie)).status).toBe(303);
  });
});

describe("commitment 4: the head count is real", () => {
  it("lets exactly one of five simultaneous joiners take the last spot", async () => {
    const hostP = await person();
    const id = await host(hostP.cookie, { capacity: "2" });
    const guests = await Promise.all([1, 2, 3, 4, 5].map(() => person()));

    const results = await Promise.all(guests.map((g) => post(`/m/${id}/join`, {}, g.cookie)));
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
    expect((await fetch(new URL(`/m/${id}/edit`, baseUrl), { headers: { cookie: other.cookie } })).status).toBe(403);
    expect((await post(`/m/${id}/edit`, meetupFields(), other.cookie)).status).toBe(403);
  });

  it("says exactly what changed: time and place, but not an untouched head count", async () => {
    const hostP = await person();
    const id = await host(hostP.cookie, { capacity: "4" });
    const newPlace = `Moved to Hancock steps ${tag()}`;
    const res = await post(`/m/${id}/edit`, meetupFields({ place: newPlace, capacity: "4", starts_at: toSydneyInput(Date.now() + 5 * HOUR) }), hostP.cookie);
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
    const id = await host(hostP.cookie, { starts_at: start, place, note: "30 min" });
    const res = await post(`/m/${id}/edit`, meetupFields({ starts_at: start, place, note: "running 10 min late" }), hostP.cookie);
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
      expect((await post(`/m/${id}/join`, {}, g.cookie)).status).toBe(303);
    }
    // three going (host + 2): 2 is refused, 3 is fine
    expect((await post(`/m/${id}/edit`, meetupFields({ capacity: "2" }), hostP.cookie)).status).toBe(409);
    expect(await get(`/m/${id}`)).toContain("3/4 going");
    expect((await post(`/m/${id}/edit`, meetupFields({ capacity: "3" }), hostP.cookie)).status).toBe(303);
    const html = await get(`/m/${id}`);
    expect(html).toContain("3/3 going");
    expect(html).toContain("head count changed");
  });

  it("holds an edit to the same rules as a new meetup", async () => {
    const hostP = await person();
    const id = await host(hostP.cookie);
    const past = toSydneyInput(Date.now() - HOUR);
    expect((await post(`/m/${id}/edit`, meetupFields({ starts_at: past }), hostP.cookie)).status).toBe(400);
    expect((await post(`/m/${id}/edit`, meetupFields({ place: "" }), hostP.cookie)).status).toBe(400);
  });
});

describe("you're going to: opening the app tells you where to be", () => {
  it("tells someone who joined exactly what the host changed afterwards", async () => {
    const hostP = await person();
    const guest = await person();
    const id = await host(hostP.cookie);
    expect((await post(`/m/${id}/join`, {}, guest.cookie)).status).toBe(303);
    const newPlace = `Hancock steps ${tag()}`;
    expect((await post(`/m/${id}/edit`, meetupFields({ place: newPlace }), hostP.cookie)).status).toBe(303);
    const home = await get("/", guest.cookie);
    expect(home).toContain(`Place changed:</b> now ${newPlace}`);
  });

  it("doesn't flag changes made before you joined", async () => {
    const hostP = await person();
    const guest = await person();
    const id = await host(hostP.cookie);
    expect((await post(`/m/${id}/edit`, meetupFields({ note: "bring water" }), hostP.cookie)).status).toBe(303);
    await new Promise((r) => setTimeout(r, 5));
    expect((await post(`/m/${id}/join`, {}, guest.cookie)).status).toBe(303);
    expect(await get("/", guest.cookie)).not.toContain("changed:</b>");
  });

  it("says who called a meetup off, so nobody turns up", async () => {
    const hostP = await person();
    const guest = await person();
    const id = await host(hostP.cookie);
    expect((await post(`/m/${id}/join`, {}, guest.cookie)).status).toBe(303);
    expect((await post(`/m/${id}/cancel`, {}, hostP.cookie)).status).toBe(303);
    expect(await get("/", guest.cookie)).toContain(`Called off by ${hostP.name}`);
  });
});

describe("persistence: your trace is there when you come back", () => {
  it("shows a meetup and who's going to a fresh visitor, and to the host on return", async () => {
    const hostP = await person();
    const place = `Coffee Grounds ${tag()}`;
    const id = await host(hostP.cookie, { place });

    const stranger = await get(`/m/${id}`); // no cookie at all
    expect(stranger).toContain(place);
    expect(stranger).toContain(hostP.name);

    const back = await get("/", hostP.cookie);
    expect(back).toContain(place);
    expect(back).toContain(hostP.name);
  });
});

describe("safety", () => {
  it("escapes what people type", async () => {
    const { cookie } = await person();
    const id = await host(cookie, { place: `<script>alert(1)</script> ${tag()}` });
    const html = await get(`/m/${id}`);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
