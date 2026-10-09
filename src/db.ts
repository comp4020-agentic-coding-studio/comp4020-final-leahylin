import { mkdirSync } from "node:fs";
import { join as joinPath } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";

// One SQLite file on the Fly volume. Nothing that matters lives in memory, so
// a restart or redeploy loses nothing.
const dataDir = process.env.DATA_DIR ?? "./data";
mkdirSync(dataDir, { recursive: true });
export const db = new DatabaseSync(joinPath(dataDir, "buddyup.db"));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 3000;

  -- a person is a nickname plus a random token kept in their browser's cookie
  CREATE TABLE IF NOT EXISTS people (
    id         INTEGER PRIMARY KEY,
    token      TEXT    NOT NULL UNIQUE,
    name       TEXT    NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS meetups (
    id           INTEGER PRIMARY KEY,
    interest     TEXT    NOT NULL,
    host_id      INTEGER NOT NULL REFERENCES people(id),
    starts_at    INTEGER NOT NULL,
    place        TEXT    NOT NULL,
    capacity     INTEGER NOT NULL CHECK (capacity BETWEEN 2 AND 12),
    note         TEXT    NOT NULL DEFAULT '',
    created_at   INTEGER NOT NULL,
    cancelled_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS meetups_by_interest ON meetups (interest, starts_at);

  -- leaving deletes the row: there is deliberately no record of who left
  CREATE TABLE IF NOT EXISTS joins (
    meetup_id INTEGER NOT NULL REFERENCES meetups(id),
    person_id INTEGER NOT NULL REFERENCES people(id),
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (meetup_id, person_id)
  );
`);

// Additive migrations: SQLite has no ADD COLUMN IF NOT EXISTS, so check first.
function addColumn(table: string, column: string, type: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  if (!cols.some((c) => c.name === column))
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}
// when the host last changed the time or place after people could see it,
// so everyone going can tell what changed
addColumn("meetups", "time_changed_at", "INTEGER");
addColumn("meetups", "place_changed_at", "INTEGER");
addColumn("meetups", "capacity_changed_at", "INTEGER");
addColumn("meetups", "note_changed_at", "INTEGER");
// the exact spot to meet, separate from the general place — optional, like note
addColumn("meetups", "meeting_point", "TEXT NOT NULL DEFAULT ''");
addColumn("meetups", "meeting_point_changed_at", "INTEGER");

// Accounts (decision 4): a person is now a username, a display name and a
// password hash. The old nickname-and-cookie columns stay (additive
// migrations only); `token` is filled with random bytes nobody holds.
addColumn("people", "username", "TEXT");
addColumn("people", "pass_hash", "TEXT");
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS people_by_username ON people (username)
    WHERE username IS NOT NULL;

  -- one row per signed-in browser, so logging out on a phone leaves the
  -- laptop signed in
  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT    PRIMARY KEY,
    person_id  INTEGER NOT NULL REFERENCES people(id),
    created_at INTEGER NOT NULL
  );

  -- failed logins per username, kept in the database so a restart doesn't
  -- reset someone's guesses
  CREATE TABLE IF NOT EXISTS login_failures (
    username TEXT    NOT NULL,
    at       INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS login_failures_by_username ON login_failures (username, at);
`);

// Decision 4: crit 8's people were nicknames with no password, so there is
// nothing to carry over. Cleared exactly once, recorded in user_version.
{
  const { user_version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  if (user_version < 1) {
    db.exec(`
      BEGIN IMMEDIATE;
      DELETE FROM joins WHERE person_id IN (SELECT id FROM people WHERE username IS NULL)
        OR meetup_id IN (SELECT m.id FROM meetups m JOIN people p ON p.id = m.host_id WHERE p.username IS NULL);
      DELETE FROM meetups WHERE host_id IN (SELECT id FROM people WHERE username IS NULL);
      DELETE FROM people WHERE username IS NULL;
      PRAGMA user_version = 1;
      COMMIT;
    `);
  }
}

export interface Person {
  id: number;
  username: string;
  name: string;
}

export const SESSION_DAYS = 90;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
export const LOCK_AFTER = 5;
export const LOCK_MS = 15 * 60 * 1000;

export interface Meetup {
  id: number;
  interest: string;
  host_id: number;
  host_name: string;
  starts_at: number;
  place: string;
  meeting_point: string;
  capacity: number;
  note: string;
  cancelled_at: number | null;
  time_changed_at: number | null;
  place_changed_at: number | null;
  meeting_point_changed_at: number | null;
  capacity_changed_at: number | null;
  note_changed_at: number | null;
  going: number;
  // who it's for (decision 4): one circle, or the host's friends
  audience: "circle" | "friends";
  audience_circle_id: number | null;
  circle_name: string | null;
}

// How long after its start a meetup still counts as "on" rather than finished.
export const RUNS_FOR_MS = 2 * 60 * 60 * 1000;
export const MAX_AHEAD_MS = 7 * 24 * 60 * 60 * 1000;

const meetupCols = `
  m.id, m.interest, m.host_id, h.name AS host_name, m.starts_at, m.place, m.meeting_point,
  m.capacity, m.note, m.cancelled_at,
  m.time_changed_at, m.place_changed_at, m.meeting_point_changed_at, m.capacity_changed_at, m.note_changed_at,
  (SELECT COUNT(*) FROM joins j WHERE j.meetup_id = m.id) AS going`;

const q = {
  personBySession: db.prepare(
    `SELECT p.id, p.username, p.name FROM sessions s JOIN people p ON p.id = s.person_id
     WHERE s.token = ? AND s.created_at > ?`,
  ),
  insertPerson: db.prepare(
    `INSERT INTO people (token, name, username, pass_hash, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT DO NOTHING RETURNING id, username, name`,
  ),
  loginRow: db.prepare("SELECT id, pass_hash FROM people WHERE username = ?"),
  insertSession: db.prepare(
    "INSERT INTO sessions (token, person_id, created_at) VALUES (?, ?, ?)",
  ),
  deleteSession: db.prepare("DELETE FROM sessions WHERE token = ?"),
  recordFailure: db.prepare(
    "INSERT INTO login_failures (username, at) VALUES (?, ?)",
  ),
  countFailures: db.prepare(
    "SELECT COUNT(*) AS n, MAX(at) AS last FROM login_failures WHERE username = ? AND at > ?",
  ),
  clearFailures: db.prepare("DELETE FROM login_failures WHERE username = ?"),
  renamePerson: db.prepare("UPDATE people SET name = ? WHERE id = ?"),
  meetup: db.prepare(
    `SELECT ${meetupCols} FROM meetups m JOIN people h ON h.id = m.host_id WHERE m.id = ?`,
  ),
  upcoming:
    db.prepare(`SELECT ${meetupCols} FROM meetups m JOIN people h ON h.id = m.host_id
    WHERE m.interest = ? AND m.cancelled_at IS NULL AND m.starts_at > ? ORDER BY m.starts_at`),
  finished:
    db.prepare(`SELECT ${meetupCols} FROM meetups m JOIN people h ON h.id = m.host_id
    WHERE m.interest = ? AND m.cancelled_at IS NULL AND m.starts_at <= ? ORDER BY m.starts_at DESC LIMIT 20`),
  countUpcoming: db.prepare(`SELECT interest, COUNT(*) AS n FROM meetups
    WHERE cancelled_at IS NULL AND starts_at > ? GROUP BY interest`),
  // what you're going to: still on, plus called-off ones until their start
  // time passes, so you hear about it instead of turning up
  mine: db.prepare(`SELECT ${meetupCols}, me.joined_at AS joined_at FROM meetups m JOIN people h ON h.id = m.host_id
    JOIN joins me ON me.meetup_id = m.id AND me.person_id = ?
    WHERE m.starts_at > ? AND (m.cancelled_at IS NULL OR m.starts_at > ?) ORDER BY m.starts_at`),
  people:
    db.prepare(`SELECT p.id, p.name FROM joins j JOIN people p ON p.id = j.person_id
    WHERE j.meetup_id = ? ORDER BY j.joined_at`),
  isGoing: db.prepare(
    "SELECT 1 FROM joins WHERE meetup_id = ? AND person_id = ?",
  ),
  insertMeetup:
    db.prepare(`INSERT INTO meetups (interest, host_id, starts_at, place, meeting_point, capacity, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`),
  insertJoin: db.prepare(
    "INSERT INTO joins (meetup_id, person_id, joined_at) VALUES (?, ?, ?)",
  ),
  deleteJoin: db.prepare(
    "DELETE FROM joins WHERE meetup_id = ? AND person_id = ?",
  ),
  cancel: db.prepare(
    "UPDATE meetups SET cancelled_at = ? WHERE id = ? AND cancelled_at IS NULL",
  ),
  update:
    db.prepare(`UPDATE meetups SET starts_at = ?, place = ?, meeting_point = ?, capacity = ?, note = ?,
    time_changed_at = ?, place_changed_at = ?, meeting_point_changed_at = ?, capacity_changed_at = ?, note_changed_at = ? WHERE id = ?`),
};

// joined_at and the *_changed_at columns only ever get compared against each
// other (never shown to a user), so what matters is that they strictly
// reflect call order. Date.now() alone doesn't: two requests in the same
// millisecond would tie, and a tie reads as "not after", hiding a real edit
// from someone who joined moments before it.
let clock = 0;
function tick(now: number): number {
  clock = now > clock ? now : clock + 1;
  return clock;
}

function tx<T>(fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function personBySession(token: string | undefined, now: number): Person | null {
  if (!token) return null;
  return (q.personBySession.get(token, now - SESSION_MS) as Person | undefined) ?? null;
}

// null when the username is taken (the unique index decides, not a racy check)
export function createAccount(username: string, name: string, passHash: string): Person | null {
  const unused = randomBytes(24).toString("base64url");
  return (
    (q.insertPerson.get(unused, name, username, passHash, Date.now()) as Person | undefined) ?? null
  );
}

export function loginRow(username: string): { id: number; pass_hash: string } | null {
  return (q.loginRow.get(username) as { id: number; pass_hash: string } | undefined) ?? null;
}

export function createSession(personId: number): string {
  const token = randomBytes(32).toString("base64url");
  q.insertSession.run(token, personId, Date.now());
  return token;
}

export function deleteSession(token: string): void {
  q.deleteSession.run(token);
}

// Locked when there have been LOCK_AFTER failures in the last LOCK_MS; stays
// locked until LOCK_MS after the most recent one.
export function lockedUntil(username: string, now: number): number | null {
  const { n, last } = q.countFailures.get(username, now - LOCK_MS) as { n: number; last: number | null };
  return n >= LOCK_AFTER && last !== null ? last + LOCK_MS : null;
}

export function recordFailure(username: string, now: number): void {
  q.recordFailure.run(username, now);
}

export function clearFailures(username: string): void {
  q.clearFailures.run(username);
}

export function renamePerson(id: number, name: string): void {
  q.renamePerson.run(name, id);
}

// Any meetup by id, whoever is asking. Only for code that has already
// checked, or is about to check, canSee: never to answer a viewer directly.
export function getMeetup(id: number): Meetup | null {
  return (vq.anyMeetup.get({ id }) as Meetup | undefined) ?? null;
}

// The meetup if this person may see it, else null: to anyone outside its
// audience a meetup doesn't exist.
export function meetupFor(id: number, viewerId: number): Meetup | null {
  return (vq.meetupFor.get({ id, v: viewerId }) as Meetup | undefined) ?? null;
}

export function canSee(meetupId: number, viewerId: number): boolean {
  return vq.canSee.get({ id: meetupId, v: viewerId }) !== undefined;
}

// still on: hasn't started, or started less than RUNS_FOR_MS ago
export function upcoming(interest: string, now: number, viewerId: number): Meetup[] {
  return vq.upcoming.all({ interest, since: now - RUNS_FOR_MS, v: viewerId }) as unknown as Meetup[];
}

export function finished(interest: string, now: number, viewerId: number): Meetup[] {
  return vq.finished.all({ interest, since: now - RUNS_FOR_MS, v: viewerId }) as unknown as Meetup[];
}

export function upcomingCounts(now: number, viewerId: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of vq.counts.all({ since: now - RUNS_FOR_MS, v: viewerId }) as {
    interest: string;
    n: number;
  }[]) {
    out[row.interest] = row.n;
  }
  return out;
}

export type MyMeetup = Meetup & { joined_at: number };

export function myMeetups(personId: number, now: number): MyMeetup[] {
  return vq.mine.all({ v: personId, since: now - RUNS_FOR_MS, now }) as unknown as MyMeetup[];
}

export function attendees(meetupId: number): { id: number; name: string }[] {
  return q.people.all(meetupId) as { id: number; name: string }[];
}

export function isGoing(meetupId: number, personId: number): boolean {
  return q.isGoing.get(meetupId, personId) !== undefined;
}

export interface NewMeetup {
  audience: "circle" | "friends";
  circleId: number | null;
  interest: string;
  hostId: number;
  startsAt: number;
  place: string;
  meetingPoint: string;
  capacity: number;
  note: string;
}

// The host is the first person going, so they count toward the head count.
// Posting to a circle you're not in is refused here, inside the transaction,
// not just in the form: null means "not yours to post to".
export function createMeetup(m: NewMeetup): number | null {
  return tx(() => {
    if (m.audience === "circle" && (m.circleId === null || !isCircleMember(m.circleId, m.hostId)))
      return null;
    const now = Date.now();
    const { id } = q.insertMeetup.get(
      m.interest,
      m.hostId,
      m.startsAt,
      m.place,
      m.meetingPoint,
      m.capacity,
      m.note,
      now,
    ) as {
      id: number;
    };
    vq.setAudience.run({ id, audience: m.audience, circle: m.audience === "circle" ? m.circleId : null });
    q.insertJoin.run(id, m.hostId, tick(now));
    return id;
  });
}

export type JoinResult = "joined" | "already" | "full" | "closed" | "missing";

// Capacity is checked and the row inserted in one IMMEDIATE transaction, so
// two people can't both take the last spot.
export function join(
  meetupId: number,
  personId: number,
  now: number,
): JoinResult {
  return tx(() => {
    // outside the audience, the meetup doesn't exist
    const m = meetupFor(meetupId, personId);
    if (!m) return "missing";
    if (m.cancelled_at !== null || m.starts_at <= now) return "closed";
    if (isGoing(meetupId, personId)) return "already";
    if (m.going >= m.capacity) return "full";
    q.insertJoin.run(meetupId, personId, tick(now));
    return "joined";
  });
}

// Both report whether a row actually moved, so the caller only announces a
// change that happened: leaving something you weren't going to, or calling off
// an already-cancelled meetup (a double tap on a slow phone), changes nothing.
export function leave(meetupId: number, personId: number): boolean {
  return Number(q.deleteJoin.run(meetupId, personId).changes) > 0;
}

export function cancel(meetupId: number, now: number): boolean {
  return Number(q.cancel.run(now, meetupId).changes) > 0;
}

export interface MeetupEdit {
  startsAt: number;
  place: string;
  meetingPoint: string;
  capacity: number;
  note: string;
}

export type EditResult = "saved" | "too_small" | "closed" | "missing";

// The head count can't go below the people already going: nobody who joined
// gets pushed out. Checked in the same transaction as the update.
export function editMeetup(
  meetupId: number,
  e: MeetupEdit,
  now: number,
): EditResult {
  return tx(() => {
    const m = getMeetup(meetupId);
    if (!m) return "missing";
    if (m.cancelled_at !== null || m.starts_at <= now) return "closed";
    if (e.capacity < m.going) return "too_small";
    const when = tick(now);
    q.update.run(
      e.startsAt,
      e.place,
      e.meetingPoint,
      e.capacity,
      e.note,
      e.startsAt !== m.starts_at ? when : m.time_changed_at,
      e.place !== m.place ? when : m.place_changed_at,
      e.meetingPoint !== m.meeting_point ? when : m.meeting_point_changed_at,
      e.capacity !== m.capacity ? when : m.capacity_changed_at,
      e.note !== m.note ? when : m.note_changed_at,
      meetupId,
    );
    return "saved";
  });
}

// ---- Circles (decision 4, step 2) ----
// A small group joined by invite. Anyone in it can share the link; only the
// owner can reset it. At most CIRCLE_MAX people, checked in the same
// transaction as the insert, like a meetup's head count.
db.exec(`
  CREATE TABLE IF NOT EXISTS circles (
    id          INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL,
    owner_id    INTEGER NOT NULL REFERENCES people(id),
    invite_code TEXT    NOT NULL UNIQUE,
    created_at  INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS circle_members (
    circle_id INTEGER NOT NULL REFERENCES circles(id),
    person_id INTEGER NOT NULL REFERENCES people(id),
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (circle_id, person_id)
  );
  CREATE INDEX IF NOT EXISTS circle_members_by_person ON circle_members (person_id);
`);

export const CIRCLE_MAX = 25;

export interface Circle {
  id: number;
  name: string;
  owner_id: number;
  invite_code: string;
  members: number;
}

const circleCols = `c.id, c.name, c.owner_id, c.invite_code,
  (SELECT COUNT(*) FROM circle_members cm WHERE cm.circle_id = c.id) AS members`;

const cq = {
  insert: db.prepare(
    "INSERT INTO circles (name, owner_id, invite_code, created_at) VALUES (?, ?, ?, ?) RETURNING id",
  ),
  addMember: db.prepare(
    "INSERT INTO circle_members (circle_id, person_id, joined_at) VALUES (?, ?, ?)",
  ),
  mine: db.prepare(
    `SELECT ${circleCols} FROM circles c JOIN circle_members me ON me.circle_id = c.id AND me.person_id = ?
     ORDER BY c.name COLLATE NOCASE`,
  ),
  asMember: db.prepare(
    `SELECT ${circleCols} FROM circles c JOIN circle_members me ON me.circle_id = c.id AND me.person_id = ?
     WHERE c.id = ?`,
  ),
  byCode: db.prepare(`SELECT ${circleCols} FROM circles c WHERE c.invite_code = ?`),
  byId: db.prepare(`SELECT ${circleCols} FROM circles c WHERE c.id = ?`),
  isMember: db.prepare("SELECT 1 FROM circle_members WHERE circle_id = ? AND person_id = ?"),
  members: db.prepare(
    `SELECT p.id, p.name FROM circle_members cm JOIN people p ON p.id = cm.person_id
     WHERE cm.circle_id = ? ORDER BY cm.joined_at, cm.rowid`,
  ),
  removeMember: db.prepare("DELETE FROM circle_members WHERE circle_id = ? AND person_id = ?"),
  setOwner: db.prepare("UPDATE circles SET owner_id = ? WHERE id = ?"),
  remove: db.prepare("DELETE FROM circles WHERE id = ?"),
  setCode: db.prepare("UPDATE circles SET invite_code = ? WHERE id = ?"),
};

// 12 characters from 9 random bytes: not guessable, short enough to read off
// a screen
function inviteCode(): string {
  return randomBytes(9).toString("base64url");
}

export function createCircle(name: string, ownerId: number): number {
  return tx(() => {
    const now = Date.now();
    const { id } = cq.insert.get(name, ownerId, inviteCode(), now) as { id: number };
    cq.addMember.run(id, ownerId, now);
    return id;
  });
}

export function myCircles(personId: number): Circle[] {
  return cq.mine.all(personId) as unknown as Circle[];
}

// null unless the person is in it: to anyone else, the circle doesn't exist
export function circleForMember(circleId: number, personId: number): Circle | null {
  return (cq.asMember.get(personId, circleId) as Circle | undefined) ?? null;
}

export function circleByCode(code: string): Circle | null {
  return (cq.byCode.get(code) as Circle | undefined) ?? null;
}

export function isCircleMember(circleId: number, personId: number): boolean {
  return cq.isMember.get(circleId, personId) !== undefined;
}

export function circleMembers(circleId: number): { id: number; name: string }[] {
  return cq.members.all(circleId) as { id: number; name: string }[];
}

export type CircleJoin =
  | { result: "joined"; id: number }
  | { result: "already"; id: number }
  | { result: "full" }
  | { result: "missing" };

export function joinCircle(code: string, personId: number): CircleJoin {
  return tx(() => {
    const c = circleByCode(code);
    if (!c) return { result: "missing" };
    if (isCircleMember(c.id, personId)) return { result: "already", id: c.id };
    if (c.members >= CIRCLE_MAX) return { result: "full" };
    cq.addMember.run(c.id, personId, Date.now());
    return { result: "joined", id: c.id };
  });
}

// The owner leaving hands the circle to whoever joined earliest; the last
// person leaving ends it.
export function leaveCircle(circleId: number, personId: number): void {
  tx(() => {
    const c = cq.byId.get(circleId) as Circle | undefined;
    if (!c || !isCircleMember(circleId, personId)) return;
    cq.removeMember.run(circleId, personId);
    const rest = circleMembers(circleId);
    if (rest.length === 0) cq.remove.run(circleId);
    else if (c.owner_id === personId) cq.setOwner.run(rest[0].id, circleId);
  });
}

// Only the owner; the old link stops working at once.
export function resetInvite(circleId: number, personId: number): boolean {
  return tx(() => {
    const c = cq.byId.get(circleId) as Circle | undefined;
    if (!c || c.owner_id !== personId) return false;
    cq.setCode.run(inviteCode(), circleId);
    return true;
  });
}

// ---- Friends (decision 4, step 3) ----
// Both ways: a request, then an accept. Declining or removing tells no one
// and leaves no record, like leaving a meetup. The one thing remembered is
// when a request was last sent, so nobody can ask the same person again and
// again: once a week at most.
db.exec(`
  CREATE TABLE IF NOT EXISTS friend_requests (
    from_id    INTEGER NOT NULL REFERENCES people(id),
    to_id      INTEGER NOT NULL REFERENCES people(id),
    created_at INTEGER NOT NULL,
    PRIMARY KEY (from_id, to_id)
  );
  CREATE INDEX IF NOT EXISTS friend_requests_to ON friend_requests (to_id);

  -- a pair is stored once, smaller id first
  CREATE TABLE IF NOT EXISTS friendships (
    a_id       INTEGER NOT NULL REFERENCES people(id),
    b_id       INTEGER NOT NULL REFERENCES people(id),
    created_at INTEGER NOT NULL,
    PRIMARY KEY (a_id, b_id),
    CHECK (a_id < b_id)
  );
  CREATE INDEX IF NOT EXISTS friendships_b ON friendships (b_id);

  CREATE TABLE IF NOT EXISTS friend_request_sends (
    from_id INTEGER NOT NULL,
    to_id   INTEGER NOT NULL,
    at      INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS friend_request_sends_pair ON friend_request_sends (from_id, to_id, at);
`);

export const ASK_AGAIN_MS = 7 * 24 * 60 * 60 * 1000;

export interface Someone {
  id: number;
  username: string;
  name: string;
}

const fq = {
  byUsername: db.prepare("SELECT id, username, name FROM people WHERE username = ?"),
  areFriends: db.prepare("SELECT 1 FROM friendships WHERE a_id = ? AND b_id = ?"),
  pending: db.prepare("SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?"),
  lastSend: db.prepare("SELECT MAX(at) AS at FROM friend_request_sends WHERE from_id = ? AND to_id = ?"),
  insertRequest: db.prepare("INSERT INTO friend_requests (from_id, to_id, created_at) VALUES (?, ?, ?)"),
  logSend: db.prepare("INSERT INTO friend_request_sends (from_id, to_id, at) VALUES (?, ?, ?)"),
  deleteRequest: db.prepare("DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?"),
  insertFriendship: db.prepare(
    "INSERT OR IGNORE INTO friendships (a_id, b_id, created_at) VALUES (?, ?, ?)",
  ),
  deleteFriendship: db.prepare("DELETE FROM friendships WHERE a_id = ? AND b_id = ?"),
  incoming: db.prepare(
    `SELECT p.id, p.username, p.name FROM friend_requests r JOIN people p ON p.id = r.from_id
     WHERE r.to_id = ? ORDER BY r.created_at`,
  ),
  outgoing: db.prepare(
    `SELECT p.id, p.username, p.name FROM friend_requests r JOIN people p ON p.id = r.to_id
     WHERE r.from_id = ? ORDER BY r.created_at`,
  ),
  incomingCount: db.prepare("SELECT COUNT(*) AS n FROM friend_requests WHERE to_id = ?"),
  friends: db.prepare(
    `SELECT p.id, p.username, p.name FROM friendships f
     JOIN people p ON p.id = CASE WHEN f.a_id = ? THEN f.b_id ELSE f.a_id END
     WHERE f.a_id = ? OR f.b_id = ? ORDER BY p.name COLLATE NOCASE`,
  ),
};

function pair(x: number, y: number): [number, number] {
  return x < y ? [x, y] : [y, x];
}

export function personByUsername(username: string): Someone | null {
  return (fq.byUsername.get(username) as Someone | undefined) ?? null;
}

export function areFriends(x: number, y: number): boolean {
  return fq.areFriends.get(...pair(x, y)) !== undefined;
}

export type FriendAsk =
  | { result: "sent" | "became_friends" | "already_friends" | "already_asked"; who: Someone }
  | { result: "too_soon"; who: Someone; until: number }
  | { result: "self" }
  | { result: "missing" };

export function askFriend(fromId: number, username: string, now: number): FriendAsk {
  return tx(() => {
    const who = personByUsername(username);
    if (!who) return { result: "missing" };
    if (who.id === fromId) return { result: "self" };
    if (areFriends(fromId, who.id)) return { result: "already_friends", who };
    // they already asked you: you both want it
    if (fq.pending.get(who.id, fromId) !== undefined) {
      fq.deleteRequest.run(who.id, fromId);
      fq.insertFriendship.run(...pair(fromId, who.id), now);
      return { result: "became_friends", who };
    }
    if (fq.pending.get(fromId, who.id) !== undefined) return { result: "already_asked", who };
    const { at } = fq.lastSend.get(fromId, who.id) as { at: number | null };
    if (at !== null && at > now - ASK_AGAIN_MS) return { result: "too_soon", who, until: at + ASK_AGAIN_MS };
    fq.insertRequest.run(fromId, who.id, now);
    fq.logSend.run(fromId, who.id, now);
    return { result: "sent", who };
  });
}

export function incomingRequests(personId: number): Someone[] {
  return fq.incoming.all(personId) as unknown as Someone[];
}

export function outgoingRequests(personId: number): Someone[] {
  return fq.outgoing.all(personId) as unknown as Someone[];
}

export function incomingCount(personId: number): number {
  return (fq.incomingCount.get(personId) as { n: number }).n;
}

// Your friends, for your eyes only: nothing calls this with anyone else's id.
export function friendsOf(personId: number): Someone[] {
  return fq.friends.all(personId, personId, personId) as unknown as Someone[];
}

export function acceptFriend(personId: number, fromId: number, now: number): boolean {
  return tx(() => {
    if (fq.pending.get(fromId, personId) === undefined) return false;
    fq.deleteRequest.run(fromId, personId);
    fq.insertFriendship.run(...pair(personId, fromId), now);
    return true;
  });
}

// declining, cancelling and removing all just delete: nobody is told
export function declineFriend(personId: number, fromId: number): void {
  fq.deleteRequest.run(fromId, personId);
}

export function cancelFriendRequest(personId: number, toId: number): void {
  fq.deleteRequest.run(personId, toId);
}

export function removeFriend(personId: number, otherId: number): void {
  fq.deleteFriendship.run(...pair(personId, otherId));
}


// ---- Who can see a meetup (decision 4, step 4) ----
// One rule, written once and used by every query that shows a meetup to
// someone. You can see a meetup if you host it, have already joined it (so a
// promise to turn up isn't stranded if you later leave the circle or lose the
// friendship), or are in its audience right now: a member of its circle, or a
// direct friend of its host. Friends of friends never.
addColumn("meetups", "audience", "TEXT NOT NULL DEFAULT 'friends'");
addColumn("meetups", "audience_circle_id", "INTEGER");

const VISIBLE = `(
  m.host_id = $v
  OR EXISTS (SELECT 1 FROM joins jv WHERE jv.meetup_id = m.id AND jv.person_id = $v)
  OR (m.audience = 'circle' AND EXISTS (
        SELECT 1 FROM circle_members cv WHERE cv.circle_id = m.audience_circle_id AND cv.person_id = $v))
  OR (m.audience = 'friends' AND EXISTS (
        SELECT 1 FROM friendships fv WHERE fv.a_id = MIN(m.host_id, $v) AND fv.b_id = MAX(m.host_id, $v)))
)`;

const visibleCols = `${meetupCols}, m.audience, m.audience_circle_id, cn.name AS circle_name`;
const FROM = `FROM meetups m JOIN people h ON h.id = m.host_id LEFT JOIN circles cn ON cn.id = m.audience_circle_id`;

const vq = {
  anyMeetup: db.prepare(`SELECT ${visibleCols} ${FROM} WHERE m.id = $id`),
  meetupFor: db.prepare(`SELECT ${visibleCols} ${FROM} WHERE m.id = $id AND ${VISIBLE}`),
  canSee: db.prepare(`SELECT 1 FROM meetups m WHERE m.id = $id AND ${VISIBLE}`),
  upcoming: db.prepare(`SELECT ${visibleCols} ${FROM}
    WHERE m.interest = $interest AND m.cancelled_at IS NULL AND m.starts_at > $since AND ${VISIBLE}
    ORDER BY m.starts_at`),
  finished: db.prepare(`SELECT ${visibleCols} ${FROM}
    WHERE m.interest = $interest AND m.cancelled_at IS NULL AND m.starts_at <= $since AND ${VISIBLE}
    ORDER BY m.starts_at DESC LIMIT 20`),
  counts: db.prepare(`SELECT m.interest, COUNT(*) AS n FROM meetups m
    WHERE m.cancelled_at IS NULL AND m.starts_at > $since AND ${VISIBLE} GROUP BY m.interest`),
  // what you're going to: still on, plus called-off ones until their start
  // time passes, so you hear about it instead of turning up
  mine: db.prepare(`SELECT ${visibleCols}, me.joined_at AS joined_at ${FROM}
    JOIN joins me ON me.meetup_id = m.id AND me.person_id = $v
    WHERE m.starts_at > $since AND (m.cancelled_at IS NULL OR m.starts_at > $now) ORDER BY m.starts_at`),
  setAudience: db.prepare("UPDATE meetups SET audience = $audience, audience_circle_id = $circle WHERE id = $id"),
};
