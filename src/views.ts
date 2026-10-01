import type { Meetup, MyMeetup, Person } from "./db.ts";
import { INTERESTS, findInterest, type Interest } from "./interests.ts";
import { esc } from "./html.ts";
import { formatDay, formatWhen, relative, toSydneyInput } from "./time.ts";
import { MAX_AHEAD_MS } from "./db.ts";

export function nicknameForm(next: string, current = "", error = ""): string {
  return `
<form method="post" action="/me">
  <fieldset>
    <legend>${current ? "Change your nickname" : "First, what should people call you?"}</legend>
    ${error ? `<p class="error">${esc(error)}</p>` : ""}
    <label for="name">Nickname</label>
    <input id="name" name="name" maxlength="24" required value="${esc(current)}" placeholder="e.g. Escaped ANU">
    <p class="hint">No account, no email. This browser remembers you. Others see this name when you join something.</p>
    <input type="hidden" name="next" value="${esc(next)}">
    <button type="submit">${current ? "Save" : "That's me"}</button>
  </fieldset>
</form>`;
}

function spots(m: Meetup): string {
  const left = m.capacity - m.going;
  const dots = "●".repeat(m.going) + "○".repeat(Math.max(0, left));
  const words = left <= 0 ? "<b>full</b>" : `<b>${left}</b> spot${left === 1 ? "" : "s"} left`;
  return `<span class="spots"><span class="dots" aria-hidden="true">${dots}</span> ${m.going}/${m.capacity} going · ${words}</span>`;
}

function actions(m: Meetup, me: Person | null, going: boolean, now: number): string {
  if (m.cancelled_at !== null) return `<span class="tag">called off</span>`;
  if (m.starts_at <= now) return `<span class="tag">${going ? "you're in · on now" : "on now"}</span>`;
  if (me && m.host_id === me.id) {
    return `<span class="tag you">you're hosting</span>
      <a class="button quiet" href="/m/${m.id}/edit">Edit</a>
      <form class="inline" method="post" action="/m/${m.id}/cancel"><button class="quiet">Call it off</button></form>`;
  }
  if (going) {
    return `<span class="tag you">you're in</span>
      <form class="inline" method="post" action="/m/${m.id}/leave"><button class="quiet">Can't make it</button></form>`;
  }
  if (m.going >= m.capacity) return `<button disabled>Full</button>`;
  return `<form class="inline" method="post" action="/m/${m.id}/join"><button>I'm in</button></form>`;
}

// Say exactly what the host changed, so nobody turns up at the old time or place.
function changes(m: Meetup): string {
  const tags: string[] = [];
  if (m.time_changed_at !== null) tags.push("time changed");
  if (m.place_changed_at !== null) tags.push("place changed");
  if (m.capacity_changed_at !== null) tags.push("head count changed");
  if (m.note_changed_at !== null) tags.push("note changed");
  return tags.length ? `<p class="changes">${tags.map((t) => `<span class="tag changed">${t}</span>`).join(" ")}</p>` : "";
}

export function meetupCard(m: Meetup, me: Person | null, going: boolean, now: number, showInterest = false): string {
  const interest = findInterest(m.interest);
  const colour = interest ? ` style="--c:${interest.colour}"` : "";
  const label = showInterest && interest ? `<span class="tag">${esc(interest.name)}</span> ` : "";
  return `
<li class="meetup"${colour} id="m${m.id}">
  <a class="title" href="/m/${m.id}">${label}<span class="when">${esc(formatWhen(m.starts_at))}</span><span class="rel">${esc(relative(m.starts_at, now))}</span></a>
  ${changes(m)}
  <p class="place">📍 ${esc(m.place)}</p>
  ${m.note ? `<p class="note">${esc(m.note)}</p>` : ""}
  <p class="hint">hosted by ${esc(m.host_name)}</p>
  <div class="row">${spots(m)}<span>${actions(m, me, going, now)}</span></div>
</li>`;
}

// What the host changed after you joined, with the new value, so you go to the
// right place at the right time. Changes from before you joined aren't news.
function changedSinceJoined(m: MyMeetup): string[] {
  const since = (at: number | null) => at !== null && at > m.joined_at;
  const out: string[] = [];
  if (since(m.time_changed_at)) out.push(`<b>Time changed:</b> now ${esc(formatWhen(m.starts_at))}`);
  if (since(m.place_changed_at)) out.push(`<b>Place changed:</b> now ${esc(m.place)}`);
  if (since(m.capacity_changed_at)) out.push(`<b>Head count changed:</b> now ${m.capacity}`);
  if (since(m.note_changed_at)) out.push(`<b>Note changed:</b> now "${esc(m.note)}"`);
  return out;
}

function changeBanner(m: MyMeetup): string {
  const lines = changedSinceJoined(m);
  return lines.length ? `<div class="banner" role="status">${lines.map((l) => `<p>${l}</p>`).join("")}</div>` : "";
}

// The next thing you're going to, big: when, where, who.
function nextUp(m: MyMeetup, me: Person, people: { name: string }[], now: number): string {
  const interest = findInterest(m.interest);
  return `
<section class="next" style="--c:${interest?.colour ?? "var(--accent)"}" id="m${m.id}">
  <p class="label">Next up · ${esc(interest?.name ?? m.interest)}${m.host_id === me.id ? " · you're hosting" : ""}</p>
  ${changeBanner(m)}
  <p class="big-when"><a href="/m/${m.id}">${esc(formatWhen(m.starts_at))}</a></p>
  <p class="countdown">${esc(relative(m.starts_at, now))}</p>
  <p class="big-place">📍 ${esc(m.place)}</p>
  ${m.note ? `<p class="note">${esc(m.note)}</p>` : ""}
  <p class="hint">Who's coming</p>
  <ul class="people">${people.map((p) => `<li>${esc(p.name)}</li>`).join("")}</ul>
  <div class="row">${spots(m)}<span>${actions(m, me, true, now)}</span></div>
</section>`;
}

// Everything after the next one, one line each.
function laterRow(m: MyMeetup, me: Person, now: number): string {
  const interest = findInterest(m.interest);
  const colour = interest ? ` style="--c:${interest.colour}"` : "";
  if (m.cancelled_at !== null) {
    return `<li class="later off"${colour}><a href="/m/${m.id}"><s>${esc(formatWhen(m.starts_at))} · ${esc(interest?.name ?? "")} · ${esc(m.place)}</s></a>
      <span class="tag changed">Called off by ${esc(m.host_name)}</span></li>`;
  }
  const lines = changedSinceJoined(m);
  return `<li class="later"${colour}><a href="/m/${m.id}">${esc(formatWhen(m.starts_at))} · ${esc(interest?.name ?? "")} · ${esc(m.place)} · ${m.going}/${m.capacity}</a>${
    m.host_id === me.id ? ` <span class="tag you">hosting</span>` : ""
  }${lines.length ? `<div class="banner small">${lines.map((l) => `<p>${l}</p>`).join("")}</div>` : ""}</li>`;
}

export function home(
  me: Person | null,
  counts: Record<string, number>,
  mine: MyMeetup[],
  peopleFor: (id: number) => { name: string }[],
  now: number,
): string {
  const cards = INTERESTS.map((i) => {
    const n = counts[i.slug] ?? 0;
    return `<a class="interest" href="/i/${i.slug}" style="--c:${i.colour}">
      <strong>${esc(i.name)}</strong>
      <div>${esc(i.blurb)}</div>
      <div class="meta">${n === 0 ? "nothing on yet — start one" : `${n} coming up`}</div>
    </a>`;
  }).join("");
  const interests = `<h2>Interests</h2>\n<div class="interests">${cards}</div>`;
  const intro = `<h1>What do you want company for?</h1>
<p class="lede">Pick a thing. Join someone who's going, or say when and where you are.</p>`;
  if (!me) return `${intro}\n${nicknameForm("/")}\n${interests}`;

  // With plans, they come first: opening the app should tell you where to be.
  const next = mine.find((m) => m.cancelled_at === null);
  if (mine.length === 0) {
    return `${intro}\n${interests}\n<h2>You're going to</h2>\n<p class="empty">Nothing yet. Pick something above.</p>`;
  }
  const rest = mine.filter((m) => m !== next);
  return `<h1>You're going to</h1>
${next ? nextUp(next, me, peopleFor(next.id), now) : ""}
${rest.length ? `<h2>${next ? "After that" : "Your plans"}</h2><ul class="later-list">${rest.map((m) => laterRow(m, me, now)).join("")}</ul>` : ""}
<h2>Find something else</h2>
<div class="interests">${cards}</div>`;
}

export interface HostFormValues {
  starts_at?: string;
  place?: string;
  capacity?: string;
  note?: string;
}

// The same form starts a meetup and edits one; `editing` is the meetup's id.
export function hostForm(
  interest: Interest,
  now: number,
  values: HostFormValues = {},
  error = "",
  editing?: { id: number; going: number },
): string {
  const soonest = toSydneyInput(now + 15 * 60000);
  const latest = toSydneyInput(now + MAX_AHEAD_MS);
  const action = editing ? `/m/${editing.id}/edit` : `/i/${interest.slug}/meetups`;
  const legend = editing ? "Edit your meetup" : `Start a ${esc(interest.name.toLowerCase())} meetup`;
  const minCapacity = editing ? Math.max(2, editing.going) : 2;
  const capacityHint = editing && editing.going > 2
    ? `<p class="hint">${editing.going} people are already going, so it can't go below ${editing.going}.</p>`
    : "";
  return `
<form method="post" action="${action}" id="host">
  <fieldset>
    <legend>${legend}</legend>
    ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}
    <label for="starts_at">When</label>
    <input id="starts_at" name="starts_at" type="datetime-local" required min="${soonest}" max="${latest}" value="${esc(values.starts_at ?? "")}">
    <p class="hint">Within the next 7 days. Canberra time.</p>
    <label for="place">Where, exactly</label>
    <input id="place" name="place" required maxlength="80" placeholder="${esc(interest.placeHint)}" value="${esc(values.place ?? "")}">
    <label for="capacity">How many people, including you</label>
    <input id="capacity" name="capacity" type="number" min="${minCapacity}" max="12" required value="${esc(values.capacity ?? "4")}">
    ${capacityHint}
    <label for="note">Anything else <span class="hint">(optional)</span></label>
    <input id="note" name="note" maxlength="140" placeholder="${esc(interest.noteHint)}" value="${esc(values.note ?? "")}">
    <p><button type="submit">${editing ? "Save changes" : "Put it up"}</button>${
      editing ? ` <a href="/m/${editing.id}">Never mind</a>` : ""
    }</p>
  </fieldset>
</form>`;
}

export function interestPage(
  interest: Interest,
  me: Person | null,
  list: Meetup[],
  goingIds: Set<number>,
  past: Meetup[],
  now: number,
  form: string,
): string {
  const items = list.length
    ? `<ul class="meetups">${list.map((m) => meetupCard(m, me, goingIds.has(m.id), now)).join("")}</ul>`
    : `<p class="empty">Nothing on yet. Be the first. Someone's probably waiting for this.</p>`;
  const log = past.length
    ? `<h2>Already happened</h2><ul class="log">${past
        .map((m) => `<li>${esc(formatDay(m.starts_at))} · ${esc(m.place)} · ${m.going} went</li>`)
        .join("")}</ul>`
    : "";
  return `
<h1 style="color:${interest.colour}">${esc(interest.name)}</h1>
<p class="lede">${esc(interest.blurb)}</p>
<h2>Coming up</h2>
${items}
<h2>Or start one</h2>
${me ? form : nicknameForm(`/i/${interest.slug}#host`)}
${log}`;
}

export function meetupPage(m: Meetup, me: Person | null, going: boolean, people: { name: string }[], now: number): string {
  const interest = findInterest(m.interest)!;
  return `
<p><a href="/i/${interest.slug}">← ${esc(interest.name)}</a></p>
<ul class="meetups">${meetupCard(m, me, going, now)}</ul>
<h2>Who's going</h2>
<ul class="people">${people.map((p) => `<li>${esc(p.name)}</li>`).join("")}</ul>
${me ? "" : nicknameForm(`/m/${m.id}`)}`;
}

export function message(title: string, text: string, back: string): string {
  return `<h1>${esc(title)}</h1><p>${esc(text)}</p><p><a class="button" href="${esc(back)}">Back</a></p>`;
}

export function editPage(interest: Interest, form: string): string {
  return `<p><a href="/i/${interest.slug}">← ${esc(interest.name)}</a></p>
<p class="lede">Everyone going will see what changed on the meetup.</p>
${form}`;
}
