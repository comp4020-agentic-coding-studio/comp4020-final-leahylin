import type { Circle, Meetup, MyMeetup, Note, Person, Someone } from "./db.ts";
import { CHECKIN_MS, CIRCLE_MAX, NOTE_MAX, QUICK_NOTES, QUICK_REPLIES, RUNS_FOR_MS } from "./db.ts";
import { INTERESTS, findInterest, type Interest } from "./interests.ts";
import { esc } from "./html.ts";
import {
  formatDate,
  formatDay,
  formatTime,
  formatWhen,
  relative,
  toSydneyInput,
} from "./time.ts";
import { MAX_AHEAD_MS } from "./db.ts";

// Inline stroke icons instead of emoji: they take the interest's colour and
// read the same on every phone.
const PIN = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>`;
const FLAG = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></svg>`;

const CROSS = `<svg class="icon cross" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>`;

function where(place: string, meetingPoint: string, cls = "place"): string {
  return `<p class="${cls}">${PIN}<span>${esc(place)}</span></p>${
    meetingPoint ? `<p class="place note">${FLAG}<span>${esc(meetingPoint)}</span></p>` : ""
  }`;
}

// Changing how you appear; the username you sign in with doesn't change.
export function nameForm(current: string, error = ""): string {
  return `
<form method="post" action="/me">
  <fieldset>
    <legend>Change your display name</legend>
    ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}
    <label for="name">Display name</label>
    <input id="name" name="name" maxlength="24" required value="${esc(current)}" placeholder="e.g. Escaped ANU">
    <p class="hint">People going to the same meetup see this name.</p>
    <button type="submit">Save</button>
  </fieldset>
</form>`;
}

export interface AuthValues {
  username?: string;
  name?: string;
}

// The password is never written back into a form, even after an error.
export function loginForm(next: string, values: AuthValues = {}, error = ""): string {
  return `
<form method="post" action="/login" id="login">
  <fieldset>
    <legend>Log in</legend>
    ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}
    <label for="username">Username</label>
    <input id="username" name="username" autocomplete="username" autocapitalize="none" required value="${esc(values.username ?? "")}">
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <input type="hidden" name="next" value="${esc(next)}">
    <button type="submit">Log in</button>
  </fieldset>
</form>
<p>New here? <a href="/signup?next=${encodeURIComponent(next)}">Make an account</a></p>`;
}

export function signupForm(next: string, values: AuthValues = {}, error = ""): string {
  return `
<form method="post" action="/signup" id="signup">
  <fieldset>
    <legend>Make an account</legend>
    ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}
    <label for="username">Username</label>
    <input id="username" name="username" autocomplete="username" autocapitalize="none" required minlength="3" maxlength="20" pattern="[a-z0-9_]{3,20}" value="${esc(values.username ?? "")}">
    <p class="hint">3 to 20 lowercase letters, numbers or _. Friends find you by this.</p>
    <label for="name">Display name</label>
    <input id="name" name="name" maxlength="24" required value="${esc(values.name ?? "")}" placeholder="e.g. Escaped ANU">
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="new-password" required minlength="8" maxlength="200">
    <p class="hint">At least 8 characters. There's no email and no reset, so keep it somewhere safe.</p>
    <input type="hidden" name="next" value="${esc(next)}">
    <button type="submit">Make my account</button>
  </fieldset>
</form>
<p>Already have one? <a href="/login?next=${encodeURIComponent(next)}">Log in</a></p>`;
}

// Signed out, there is nothing to see but what this is and the way in.
export function welcome(): string {
  const step = (n: number, icon: string, title: string, text: string) =>
    `<li class="step"><span class="step-n">${n}</span>${icon}<div><b>${title}</b><p>${text}</p></div></li>`;
  return `
<div class="hero">
<div class="hero-text">
<h1>What do you want company for?</h1>
<p class="lede">Running, badminton or coffee, with people you already know: your circle or your friends.</p>
<p class="auth-actions"><a class="button" href="/signup">Make an account</a> <a class="button quiet" href="/login">Log in</a></p>
<p class="hint">Nothing here is public. You only see meetups from people you know.</p>
</div>
<ol class="steps" aria-label="How it works">
${step(1, `<svg class="step-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.2c3 .4 5.5 2.8 5.5 5.8"/></svg>`, "Start or join a circle", "Your class, your hall floor, your club. Up to 25 people, by invite.")}
${step(2, `<svg class="step-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18"/><path d="M8 2v4"/><path d="M16 2v4"/><path d="M12 12v6"/><path d="M9 15h6"/></svg>`, "Post a run, a game or a coffee", "Say when and where, and who it's for: one circle, or your friends.")}
${step(3, `<svg class="step-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>`, "Meet people you already know", "Notes for the group on the way, then check in when you're there.")}
</ol>
</div>`;
}

function spots(m: Meetup): string {
  const left = m.capacity - m.going;
  const dots = "●".repeat(m.going) + "○".repeat(Math.max(0, left));
  const words =
    left <= 0
      ? "<b>full</b>"
      : `<b>${left}</b> spot${left === 1 ? "" : "s"} left`;
  return `<span class="spots"><span class="dots" aria-hidden="true">${dots}</span> ${m.going}/${m.capacity} going · ${words}</span>`;
}

function actions(
  m: Meetup,
  me: Person | null,
  going: boolean,
  now: number,
): string {
  if (m.cancelled_at !== null) return `<span class="tag">called off</span>`;
  if (m.starts_at <= now)
    return `<span class="tag">${going ? "you're in · on now" : "on now"}</span>`;
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
  if (m.meeting_point_changed_at !== null) tags.push("meeting point changed");
  if (m.capacity_changed_at !== null) tags.push("head count changed");
  if (m.note_changed_at !== null) tags.push("note changed");
  return tags.length
    ? `<p class="changes">${tags.map((t) => `<span class="tag changed">${t}</span>`).join(" ")}</p>`
    : "";
}

// Where a meetup was shared: a circle's name, or the host's friends.
export function audienceLabel(m: Meetup): string {
  if (m.audience === "circle") return m.circle_name ?? "a circle";
  return `${m.host_name}'s friends`;
}

export function meetupCard(
  m: Meetup,
  me: Person | null,
  going: boolean,
  now: number,
  showInterest = false,
): string {
  const interest = findInterest(m.interest);
  const colour = interest ? ` style="--c:${interest.colour}"` : "";
  const label =
    showInterest && interest
      ? `<span class="tag">${esc(interest.name)}</span> `
      : "";
  const forWhom = `<span class="tag for">${esc(audienceLabel(m))}</span>`;
  return `
<li class="meetup"${colour} id="m${m.id}">
  <a class="title" href="/m/${m.id}">${label}<span class="when">${esc(formatWhen(m.starts_at))}</span><span class="rel">${esc(relative(m.starts_at, now))}</span></a>
  ${changes(m)}
  ${where(m.place, m.meeting_point)}
  ${m.note ? `<p class="note">${esc(m.note)}</p>` : ""}
  <p class="hint">hosted by ${esc(m.host_name)} · ${forWhom}</p>
  <div class="row">${spots(m)}<span>${actions(m, me, going, now)}</span></div>
</li>`;
}

// What the host changed after you joined, with the new value, so you go to the
// right place at the right time. Changes from before you joined aren't news.
function changedSinceJoined(m: MyMeetup): string[] {
  const since = (at: number | null) => at !== null && at > m.joined_at;
  const out: string[] = [];
  if (since(m.time_changed_at))
    out.push(`<b>Time changed:</b> now ${esc(formatWhen(m.starts_at))}`);
  if (since(m.place_changed_at))
    out.push(`<b>Place changed:</b> now ${esc(m.place)}`);
  if (since(m.meeting_point_changed_at))
    out.push(`<b>Meeting point changed:</b> now ${esc(m.meeting_point)}`);
  if (since(m.capacity_changed_at))
    out.push(`<b>Head count changed:</b> now ${m.capacity}`);
  if (since(m.note_changed_at))
    out.push(`<b>Note changed:</b> now "${esc(m.note)}"`);
  return out;
}

function changeBanner(m: MyMeetup): string {
  const lines = changedSinceJoined(m);
  return lines.length
    ? `<div class="banner" role="status">${lines.map((l) => `<p>${l}</p>`).join("")}</div>`
    : "";
}

// The next thing you're going to, big: when, where, who.
function nextUp(
  m: MyMeetup,
  me: Person,
  people: { name: string }[],
  now: number,
): string {
  const interest = findInterest(m.interest);
  return `
<section class="next" style="--c:${interest?.colour ?? "var(--accent)"}" id="m${m.id}">
 <div class="inner">
  <div>
   <p class="label">Next up · ${esc(interest?.name ?? m.interest)}${m.host_id === me.id ? " · you're hosting" : ""}</p>
   ${changeBanner(m)}
   <p class="big-when"><a href="/m/${m.id}">${esc(formatTime(m.starts_at))}</a></p>
   <p class="countdown"><span class="date">${esc(formatDate(m.starts_at))}</span> · ${esc(relative(m.starts_at, now))}</p>
  </div>
  <div>
   ${where(m.place, m.meeting_point, "place big-place")}
   ${m.note ? `<p class="note">${esc(m.note)}</p>` : ""}
   <p class="hint people-label">Who's coming</p>
   <ul class="people">${people.map((p) => `<li>${esc(p.name)}</li>`).join("")}</ul>
   <div class="row">${spots(m)}<span>${actions(m, me, true, now)}</span></div>
  </div>
 </div>
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
  const interests = `<h2>Interests</h2>\n<div class="interests row3">${cards}</div>`;
  const intro = `<h1>What do you want company for?</h1>
<p class="lede">Pick a thing. Join someone who's going, or say when and where you are.</p>`;
  if (!me) return welcome();

  // With plans, they come first: opening the app should tell you where to be.
  const next = mine.find((m) => m.cancelled_at === null);
  const rest = mine.filter((m) => m !== next);
  const later = rest.length
    ? `<h2>${next ? "After that" : "Your plans"}</h2><ul class="later-list">${rest.map((m) => laterRow(m, me, now)).join("")}</ul>`
    : "";
  // Signed in there is no form on this page, and joining your first meetup
  // reorders the whole thing — plans move above the interests. Swapping a
  // region can't reorder its neighbours, so the whole body is one live region.
  const body =
    mine.length === 0
      ? `${intro}\n${interests}\n<h2>You're going to</h2>\n<p class="empty">Nothing yet. Pick something above.</p>`
      : `<div class="cols">
<div>
<h1>You're going to</h1>
${next ? nextUp(next, me, peopleFor(next.id), now) : ""}
${later}
</div>
<aside class="side">
<h2>Find something else</h2>
<div class="interests">${cards}</div>
</aside>
</div>`;
  return `<div data-live="home">${body}</div>`;
}

export interface AudienceChoices {
  circles: Circle[];
  friends: number;
}

// "Who's it for?": one of your circles, or your friends. Required, no
// default to the public because there is no public.
function audienceField(choices: AudienceChoices, chosen: string | undefined): string {
  const pick = chosen ?? (choices.circles[0] ? `circle:${choices.circles[0].id}` : "friends");
  const option = (value: string, label: string) =>
    `<option value="${esc(value)}"${value === pick ? " selected" : ""}>${esc(label)}</option>`;
  const nobody =
    choices.circles.length === 0 && choices.friends === 0
      ? `<p class="hint warn">Right now nobody would see this: you're not in a circle and have no friends here yet. <a href="/circles">Circles</a> · <a href="/friends">Friends</a></p>`
      : "";
  return `
    <label for="audience">Who's it for?</label>
    <select id="audience" name="audience" required>
      ${choices.circles.map((c) => option(`circle:${c.id}`, `${c.name} (circle, ${c.members})`)).join("")}
      ${option("friends", choices.friends ? `My friends (${choices.friends})` : "My friends (none yet)")}
    </select>
    <p class="hint">Only they can see it or join. It can't be changed after you post.</p>
    ${nobody}`;
}

export interface HostFormValues {
  audience?: string;
  starts_at?: string;
  place?: string;
  meeting_point?: string;
  capacity?: string;
  note?: string;
}

// The same form starts a meetup and edits one; `editing` is the meetup's id.
export function hostForm(
  interest: Interest,
  now: number,
  values: HostFormValues = {},
  error = "",
  editing?: { id: number; going: number; audienceLabel: string },
  choices?: AudienceChoices,
): string {
  const soonest = toSydneyInput(now + 15 * 60000);
  const latest = toSydneyInput(now + MAX_AHEAD_MS);
  const action = editing
    ? `/m/${editing.id}/edit`
    : `/i/${interest.slug}/meetups`;
  const legend = editing
    ? "Edit your meetup"
    : `Start a ${esc(interest.name.toLowerCase())} meetup`;
  const minCapacity = editing ? Math.max(2, editing.going) : 2;
  const capacityHint =
    editing && editing.going > 2
      ? `<p class="hint">${editing.going} people are already going, so it can't go below ${editing.going}.</p>`
      : "";
  return `
<form method="post" action="${action}" id="host">
  <fieldset>
    <legend>${legend}</legend>
    ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}
    ${
      editing
        ? `<p class="hint">For <b>${esc(editing.audienceLabel)}</b>. Who it's for can't change after posting.</p>`
        : choices
          ? audienceField(choices, values.audience)
          : ""
    }
    <label for="starts_at">When</label>
    <input id="starts_at" name="starts_at" type="datetime-local" required min="${soonest}" max="${latest}" value="${esc(values.starts_at ?? "")}">
    <p class="hint">Within the next 7 days. Canberra time.</p>
    <label for="place">Where</label>
    <input id="place" name="place" required maxlength="80" placeholder="${esc(interest.placeHint)}" value="${esc(values.place ?? "")}">
    <label for="meeting_point">Meeting point <span class="hint">(optional)</span></label>
    <input id="meeting_point" name="meeting_point" maxlength="80" placeholder="e.g. the clock tower, west entrance" value="${esc(values.meeting_point ?? "")}">
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
    ? `<ul class="meetups grid">${list.map((m) => meetupCard(m, me, goingIds.has(m.id), now)).join("")}</ul>`
    : `<p class="empty">Nothing on yet. Be the first. Someone's probably waiting for this.</p>`;
  const logList = `<ul class="log">${past
    .map(
      (m) =>
        `<li>${esc(formatDay(m.starts_at))} · ${esc(m.place)} · ${m.came ? `${m.came} came` : `${m.going} signed up`}</li>`,
    )
    .join("")}</ul>`;
  // Folded away on a phone, where the list matters more; open beside the form
  // on a wide screen. Plain <details>, so it works without script.
  const logPhone = past.length
    ? `<details class="past mobile-only"><summary>Already happened (${past.length})</summary>${logList}</details>`
    : "";
  const logWide = past.length
    ? `<section class="web-only"><h2>Already happened</h2>${logList}</section>`
    : "";
  return `
<div class="cols">
<div>
<h1 style="color:${interest.colour}">${esc(interest.name)}</h1>
<p class="lede">${esc(interest.blurb)}</p>
<h2>Coming up</h2>
<div data-live="coming">${items}</div>
${logPhone}
</div>
<aside class="side">
${form}
${logWide}
</aside>
</div>
<a class="fab" href="#host">+ Start one</a>`;
}

// Check-in: from the start time, for an hour. Only ever a count; never who.
function checkInBlock(m: Meetup, going: boolean, myCame: boolean, now: number): string {
  if (m.cancelled_at !== null || now < m.starts_at) return "";
  const open = now <= m.starts_at + CHECKIN_MS;
  const count = `<p class="checkin-count"><b>${m.came} of ${m.going}</b> checked in</p>`;
  if (!going || !open) return `<section class="checkin">${count}</section>`;
  const button = myCame
    ? `<p class="hint">You checked in. <form class="inline" method="post" action="/m/${m.id}/checkin"><input type="hidden" name="came" value="0"><button class="link">Undo</button></form></p>`
    : `<form method="post" action="/m/${m.id}/checkin"><input type="hidden" name="came" value="1"><button>I came</button></form>`;
  return `<section class="checkin">${count}${button}<p class="hint">Open until an hour after the start. Only the number is shown.</p></section>`;
}

// The notice board: for people going, and only while the meetup is on.
function notesBlock(m: Meetup, me: Person, going: boolean, notes: Note[] | null, now: number): string {
  if (m.starts_at <= now - RUNS_FOR_MS) return "";
  if (!going || notes === null)
    return `<h2>Notes for people going</h2><p class="hint">Join to see what the group is saying.</p>`;
  const canDelete = (n: Note) => n.person_id === me.id || m.host_id === me.id;
  const del = (n: Note) =>
    canDelete(n)
      ? `<form class="inline note-actions" method="post" action="/m/${m.id}/notes/${n.id}/delete"><button class="tiny" aria-label="Delete ${esc(n.name)}'s ${n.reply_to === null ? "note" : "reply"}" title="Delete">${CROSS}</button></form>`
      : "";
  // one level of replies, in the order they came; a quick reply reads
  // "Mia ❤️" and is never totted up
  const replies = (parent: Note) =>
    notes
      .filter((r) => r.reply_to === parent.id)
      .map((r) => `<li class="reply-item"><span><b>${esc(r.name)}</b> <span class="reply-body">${esc(r.body)}</span></span>${del(r)}</li>`)
      .join("");
  const replyForm = (n: Note) => `
<details class="reply">
  <summary>Reply</summary>
  <form method="post" action="/m/${m.id}/notes" class="note-form">
    <input type="hidden" name="reply_to" value="${n.id}">
    <label for="reply-${n.id}" class="sr-only">Reply to ${esc(n.name)}</label>
    <input id="reply-${n.id}" name="body" maxlength="${NOTE_MAX}" placeholder="Reply, or any emoji from your keyboard">
    <button type="submit">Send</button>
  </form>
  <form method="post" action="/m/${m.id}/notes" class="quick">
    <input type="hidden" name="reply_to" value="${n.id}">
    ${QUICK_REPLIES.map((e) => `<button class="quiet" name="quick" value="${e}" aria-label="Reply ${e}">${e}</button>`).join("")}
  </form>
</details>`;
  const top = notes.filter((n) => n.reply_to === null);
  const list = top.length
    ? `<ul class="notes">${top
        .map((n) => {
          const r = replies(n);
          return `<li class="note-card"><div class="note-head"><b>${esc(n.name)}</b><span class="hint">${esc(formatTime(n.created_at))}</span>${del(n)}</div><p class="note-body">${esc(n.body)}</p>${
            r ? `<ul class="replies">${r}</ul>` : ""
          }${replyForm(n)}</li>`;
        })
        .join("")}</ul>`
    : `<p class="hint">Nothing yet. Running late, or the plan changed? Say it here.</p>`;
  return `
<h2>Notes for people going</h2>
<div data-live="notes">${list}</div>
<form method="post" action="/m/${m.id}/notes" id="note" class="note-form">
  <label for="note-body" class="sr-only">Add a note</label>
  <input id="note-body" name="body" maxlength="${NOTE_MAX}" required placeholder="e.g. 5 min late, start without me">
  <button type="submit">Post</button>
</form>
<form method="post" action="/m/${m.id}/notes" class="quick quick-notes" aria-label="Quick notes">
  ${QUICK_NOTES.map((t) => `<button class="quiet" name="quick" value="${esc(t)}">${esc(t)}</button>`).join("")}
</form>
<p class="hint">Only people going see these. They disappear two hours after the start.</p>`;
}

export function meetupPage(
  m: Meetup,
  me: Person,
  going: boolean,
  people: { name: string }[],
  now: number,
  extra: { notes: Note[] | null; myCame: boolean } = { notes: null, myCame: false },
): string {
  const interest = findInterest(m.interest)!;
  return `
<p><a href="/i/${interest.slug}">← ${esc(interest.name)}</a></p>
<div data-live="meetup">
<ul class="meetups">${meetupCard(m, me, going, now)}</ul>
${checkInBlock(m, going, extra.myCame, now)}
<h2>Who's going</h2>
<ul class="people">${people.map((p) => `<li>${esc(p.name)}</li>`).join("")}</ul>
</div>
${notesBlock(m, me, going, extra.notes, now)}
`;
}

export function message(title: string, text: string, back: string): string {
  return `<h1>${esc(title)}</h1><p>${esc(text)}</p><p><a class="button" href="${esc(back)}">Back</a></p>`;
}

export function editPage(interest: Interest, form: string): string {
  return `<p><a href="/i/${interest.slug}">← ${esc(interest.name)}</a></p>
<p class="lede">Everyone going will see what changed on the meetup.</p>
${form}`;
}

// ---- Circles (decision 4, step 2) ----

export function circlesPage(circles: Circle[], name = "", error = ""): string {
  const list = circles.length
    ? `<ul class="later-list circles">${circles
        .map(
          (c) =>
            `<li class="later"><a href="/c/${c.id}"><b>${esc(c.name)}</b></a><span class="hint">${c.members}/${CIRCLE_MAX}</span></li>`,
        )
        .join("")}</ul>`
    : `<p class="empty">You're not in any circle yet. Start one, or open an invite link someone sent you.</p>`;
  return `
<h1>Your circles</h1>
<p class="lede">A circle is a group who already know each other: a class, a hall floor, a club. At most ${CIRCLE_MAX} people.</p>
${list}
<form method="post" action="/circles" class="inline-gap" id="new-circle">
  <fieldset>
    <legend>Start a circle</legend>
    ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}
    <label for="circle-name">Name</label>
    <input id="circle-name" name="name" maxlength="40" required value="${esc(name)}" placeholder="e.g. COMP4020, Bruce Hall 3F">
    <button type="submit">Start it</button>
  </fieldset>
</form>`;
}

export function circlePage(
  c: Circle,
  members: { id: number; name: string }[],
  me: Person,
  link: string,
): string {
  const owner = c.owner_id === me.id;
  return `
<p><a href="/circles">← Your circles</a></p>
<h1>${esc(c.name)}</h1>
<p class="lede">${c.members} of ${CIRCLE_MAX} people${owner ? " · you started this one" : ""}</p>
<h2>Invite someone you know</h2>
<p class="hint">Anyone with this link can join while there's room. Only send it to people you'd be glad to meet.</p>
<label for="invite" class="sr-only">Invite link</label>
<input id="invite" class="invite" readonly value="${esc(link)}">
${
  owner
    ? `<form method="post" action="/c/${c.id}/reset" class="inline-gap"><button class="quiet">Reset the link</button> <span class="hint">The old link stops working.</span></form>`
    : ""
}
<h2>Who's in it</h2>
<ul class="people">${members
    .map((m) => `<li>${esc(m.name)}${m.id === c.owner_id ? " (started it)" : ""}</li>`)
    .join("")}</ul>
<form method="post" action="/c/${c.id}/leave" class="inline-gap"><button class="quiet">Leave this circle</button></form>`;
}

// Opening an invite link only asks; joining is a button, so a chat app's link
// preview can't sign anyone up.
export function joinPage(c: Circle, code: string): string {
  const full = c.members >= CIRCLE_MAX;
  return `
<h1>Join ${esc(c.name)}?</h1>
<p class="lede">${c.members} of ${CIRCLE_MAX} people. You'll see meetups shared with this circle, and they'll see yours.</p>
${
  full
    ? `<p class="error">This circle is full.</p>`
    : `<form method="post" action="/join/${esc(code)}"><button>Join ${esc(c.name)}</button></form>`
}
<p><a href="/circles">Not now</a></p>`;
}

// ---- Friends (decision 4, step 3) ----
// Only ever rendered for the person whose friends these are.

function someoneRow(p: Someone, buttons: string): string {
  return `<li class="later"><span><b>${esc(p.name)}</b> <span class="hint">@${esc(p.username)}</span></span><span class="row-actions">${buttons}</span></li>`;
}

function smallForm(action: string, label: string, quiet = true): string {
  return `<form class="inline" method="post" action="${action}"><button${quiet ? ' class="quiet"' : ""}>${label}</button></form>`;
}

export function friendsPage(
  friends: Someone[],
  incoming: Someone[],
  outgoing: Someone[],
  opts: { username?: string; error?: string; note?: string } = {},
): string {
  const asking = incoming.length
    ? `<h2>Want to be your friend</h2><ul class="later-list">${incoming
        .map((p) =>
          someoneRow(p, smallForm(`/friends/${p.id}/accept`, "Accept", false) + " " + smallForm(`/friends/${p.id}/decline`, "Decline")),
        )
        .join("")}</ul>`
    : "";
  const sent = outgoing.length
    ? `<h2>Waiting on</h2><ul class="later-list">${outgoing
        .map((p) => someoneRow(p, smallForm(`/friends/${p.id}/cancel`, "Take it back")))
        .join("")}</ul>`
    : "";
  const mine = friends.length
    ? `<ul class="later-list">${friends
        .map((p) => someoneRow(p, smallForm(`/friends/${p.id}/remove`, "Remove")))
        .join("")}</ul>`
    : `<p class="empty">No friends here yet. Ask someone for their username.</p>`;
  return `
<h1>Friends</h1>
<p class="lede">Meetups you share with "my friends" go to these people, and no one else. Only you can see this list.</p>
${opts.note ? `<p class="banner" role="status">${esc(opts.note)}</p>` : ""}
<form method="post" action="/friends" id="add-friend" class="inline-gap">
  <fieldset>
    <legend>Add a friend</legend>
    ${opts.error ? `<p class="error" role="alert">${esc(opts.error)}</p>` : ""}
    <label for="friend-username">Their username</label>
    <input id="friend-username" name="username" autocapitalize="none" required value="${esc(opts.username ?? "")}" placeholder="e.g. escaped_anu">
    <p class="hint">Exact username only. There's no search, so ask them for it.</p>
    <button type="submit">Send request</button>
  </fieldset>
</form>
${asking}
${sent}
<h2>Your friends</h2>
${mine}`;
}
