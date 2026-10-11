import { mkdirSync } from "node:fs";
import { join as joinPath } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomInt } from "node:crypto";

// One SQLite file on the Fly volume. Nothing that matters lives in memory, so
// a restart or redeploy loses nothing.
const dataDir = process.env.DATA_DIR ?? "./data";
export const NAME_MAX = 24;
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

// Display names are unique, ignoring case, and never change, so a name on a
// meetup is always the same person. Anyone who already shared a name keeps it
// if they signed up first; later ones become "Leah 2", "Leah 3". Done once.
{
  const { user_version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  if (user_version < 2) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const rows = db.prepare("SELECT id, name FROM people ORDER BY id").all() as { id: number; name: string }[];
      const taken = new Set(rows.map((r) => r.name.toLowerCase()));
      const seen = new Set<string>();
      const rename = db.prepare("UPDATE people SET name = ? WHERE id = ?");
      for (const r of rows) {
        const key = r.name.toLowerCase();
        if (!seen.has(key)) { seen.add(key); continue; }
        let n = 2;
        let next = "";
        do {
          const suffix = ` ${n++}`;
          next = r.name.slice(0, NAME_MAX - suffix.length) + suffix;
        } while (taken.has(next.toLowerCase()));
        taken.add(next.toLowerCase());
        seen.add(next.toLowerCase());
        rename.run(next, r.id);
      }
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS people_by_name ON people (name COLLATE NOCASE);
        PRAGMA user_version = 2;`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
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
  // how many people going said "I came": a count, never who
  came: number;
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
  nameTaken: db.prepare("SELECT 1 FROM people WHERE name = ? COLLATE NOCASE"),
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

export function nameTaken(name: string): boolean {
  return q.nameTaken.get(name) !== undefined;
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

export function calledOffIn(interest: string, now: number, viewerId: number): Meetup[] {
  return vq.calledOff.all({ interest, now, v: viewerId }) as unknown as Meetup[];
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

// A 6-digit number to type in, beside the link: easy to read off a screen or
// say out loud. It's short, so guessing is held back per person (below).
addColumn("circles", "join_number", "TEXT");
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS circles_by_number ON circles (join_number) WHERE join_number IS NOT NULL;
  CREATE TABLE IF NOT EXISTS circle_code_failures (person_id INTEGER NOT NULL, at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS circle_code_failures_by_person ON circle_code_failures (person_id, at);`);

export const CIRCLE_MAX = 25;

export interface Circle {
  id: number;
  name: string;
  owner_id: number;
  invite_code: string;
  join_number: string;
  members: number;
}

const circleCols = `c.id, c.name, c.owner_id, c.invite_code, c.join_number,
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
  setCode: db.prepare("UPDATE circles SET invite_code = ?, join_number = ? WHERE id = ?"),
  setNumber: db.prepare("UPDATE circles SET join_number = ? WHERE id = ?"),
  numberTaken: db.prepare("SELECT 1 FROM circles WHERE join_number = ?"),
  byNumber: db.prepare(`SELECT ${circleCols} FROM circles c WHERE c.join_number = ?`),
  noNumber: db.prepare("SELECT id FROM circles WHERE join_number IS NULL"),
  recordCodeFailure: db.prepare("INSERT INTO circle_code_failures (person_id, at) VALUES (?, ?)"),
  codeFailures: db.prepare(
    "SELECT COUNT(*) AS n, MAX(at) AS last FROM circle_code_failures WHERE person_id = ? AND at > ?",
  ),
};

// 12 characters from 9 random bytes: not guessable, short enough to read off
// a screen
function inviteCode(): string {
  return randomBytes(9).toString("base64url");
}

// six digits, never one another circle already has
function joinNumber(): string {
  for (;;) {
    const n = String(randomInt(0, 1_000_000)).padStart(6, "0");
    if (cq.numberTaken.get(n) === undefined) return n;
  }
}

// circles made before numbers existed get one at boot
for (const { id } of cq.noNumber.all() as { id: number }[]) cq.setNumber.run(joinNumber(), id);

export function createCircle(name: string, ownerId: number): number {
  return tx(() => {
    const now = Date.now();
    const { id } = cq.insert.get(name, ownerId, inviteCode(), now) as { id: number };
    cq.setNumber.run(joinNumber(), id);
    cq.addMember.run(id, ownerId, now);
    return id;
  });
}

export function circleByNumber(number: string): Circle | null {
  return (cq.byNumber.get(number) as Circle | undefined) ?? null;
}

// Ten wrong numbers in fifteen minutes and a person waits fifteen minutes,
// right number included. Kept in the database, like login failures.
export const CODE_TRIES = 10;
export const CODE_LOCK_MS = 15 * 60 * 1000;

export function codeLockedUntil(personId: number, now: number): number | null {
  const { n, last } = cq.codeFailures.get(personId, now - CODE_LOCK_MS) as { n: number; last: number | null };
  return n >= CODE_TRIES && last !== null ? last + CODE_LOCK_MS : null;
}

export function recordCodeFailure(personId: number, now: number): void {
  cq.recordCodeFailure.run(personId, now);
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
    // the link and the number change together; both old ones stop working
    cq.setCode.run(inviteCode(), joinNumber(), circleId);
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

// Check-in (ADR 0002): each person marks their own join row "I came". The
// only thing ever read back out is the count for one meetup.
addColumn("joins", "came_at", "INTEGER");

const VISIBLE = `(
  m.host_id = $v
  OR EXISTS (SELECT 1 FROM joins jv WHERE jv.meetup_id = m.id AND jv.person_id = $v)
  OR (m.audience = 'circle' AND EXISTS (
        SELECT 1 FROM circle_members cv WHERE cv.circle_id = m.audience_circle_id AND cv.person_id = $v))
  OR (m.audience = 'friends' AND EXISTS (
        SELECT 1 FROM friendships fv WHERE fv.a_id = MIN(m.host_id, $v) AND fv.b_id = MAX(m.host_id, $v)))
)`;

const visibleCols = `${meetupCols}, m.audience, m.audience_circle_id, cn.name AS circle_name,
  (SELECT COUNT(*) FROM joins jc WHERE jc.meetup_id = m.id AND jc.came_at IS NOT NULL) AS came`;
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
  // called off but not yet due: still listed, struck through, so nobody
  // who saw it there turns up
  calledOff: db.prepare(`SELECT ${visibleCols} ${FROM}
    WHERE m.interest = $interest AND m.cancelled_at IS NOT NULL AND m.starts_at > $now AND ${VISIBLE}
    ORDER BY m.starts_at`),
  counts: db.prepare(`SELECT m.interest, COUNT(*) AS n FROM meetups m
    WHERE m.cancelled_at IS NULL AND m.starts_at > $since AND ${VISIBLE} GROUP BY m.interest`),
  // what you're going to: still on, plus called-off ones until their start
  // time passes, so you hear about it instead of turning up
  mine: db.prepare(`SELECT ${visibleCols}, me.joined_at AS joined_at ${FROM}
    JOIN joins me ON me.meetup_id = m.id AND me.person_id = $v
    WHERE m.starts_at > $since AND (m.cancelled_at IS NULL OR m.starts_at > $now) ORDER BY m.starts_at`),
  setAudience: db.prepare("UPDATE meetups SET audience = $audience, audience_circle_id = $circle WHERE id = $id"),
};


// ---- Activities beyond the built-in three (decision 5) ----
// One is made the first time someone starts a meetup for it. Its name is only
// ever shown to people who can see one of its meetups: the same VISIBLE rule,
// so a circle's "Climbing" stays the circle's business.
db.exec(`CREATE TABLE IF NOT EXISTS activities (
  slug       TEXT    PRIMARY KEY,
  name       TEXT    NOT NULL,
  colour     TEXT    NOT NULL,
  created_by INTEGER NOT NULL REFERENCES people(id),
  created_at INTEGER NOT NULL
)`);

// dark enough for white text, and none of them the built-ins' colours
const ACTIVITY_COLOURS = ["#1D4ED8", "#7E22CE", "#BE185D", "#0F766E", "#0369A1", "#4338CA", "#9F1239", "#3F6212"];
export const ACTIVITY_MENU_MAX = 8;

export interface Activity {
  slug: string;
  name: string;
  colour: string;
}

const aq = {
  bySlug: db.prepare("SELECT slug, name, colour FROM activities WHERE slug = ?"),
  count: db.prepare("SELECT COUNT(*) AS n FROM activities"),
  insert: db.prepare(
    "INSERT INTO activities (slug, name, colour, created_by, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
  ),
  // with something still on (or called off but not yet due) that you can see
  // A join, not WHERE EXISTS: in SQLite 3.51 the EXISTS form lost an
  // activity when someone else's meetup of it came first and wasn't visible.
  // The spec ("joins a name someone already used") catches it.
  live: db.prepare(`SELECT DISTINCT a.slug, a.name, a.colour FROM activities a
    JOIN meetups m ON m.interest = a.slug
    WHERE ((m.cancelled_at IS NULL AND m.starts_at > $since) OR (m.cancelled_at IS NOT NULL AND m.starts_at > $now))
      AND ${VISIBLE}
    ORDER BY a.name COLLATE NOCASE LIMIT ${ACTIVITY_MENU_MAX}`),
  // any meetup of it you can see, past ones included: enough to open its page
  seen: db.prepare(`SELECT 1 FROM meetups m WHERE m.interest = $slug AND ${VISIBLE} LIMIT 1`),
};

export function activityBySlug(slug: string): Activity | null {
  return (aq.bySlug.get(slug) as Activity | undefined) ?? null;
}

export function liveActivities(viewerId: number, now: number): Activity[] {
  return aq.live.all({ since: now - RUNS_FOR_MS, now, v: viewerId }) as unknown as Activity[];
}

export function activitySeenBy(slug: string, viewerId: number): boolean {
  return aq.seen.get({ slug, v: viewerId }) !== undefined;
}

// The activity for this slug, made now if it's new. The first person's
// spelling ("Board games") is the one everyone sees.
export function ensureActivity(slug: string, name: string, personId: number, now: number): Activity {
  const n = (aq.count.get() as { n: number }).n;
  aq.insert.run(slug, name, ACTIVITY_COLOURS[n % ACTIVITY_COLOURS.length], personId, now);
  return activityBySlug(slug)!;
}

// ---- Check-in (ADR 0002) ----
// Open from the start time for an hour. Self-reported, one row per person per
// meetup, and nothing anywhere reads one person's check-ins across meetups.
export const CHECKIN_MS = 60 * 60 * 1000;

const ckq = {
  mine: db.prepare("SELECT came_at FROM joins WHERE meetup_id = $id AND person_id = $p"),
  set: db.prepare("UPDATE joins SET came_at = $at WHERE meetup_id = $id AND person_id = $p"),
};

export function checkInOpen(m: { starts_at: number; cancelled_at: number | null }, now: number): boolean {
  return m.cancelled_at === null && now >= m.starts_at && now <= m.starts_at + CHECKIN_MS;
}

export function myCheckIn(meetupId: number, personId: number): boolean {
  const row = ckq.mine.get({ id: meetupId, p: personId }) as { came_at: number | null } | undefined;
  return row?.came_at != null;
}

export type CheckInResult = "done" | "not_going" | "closed" | "missing";

export function checkIn(meetupId: number, personId: number, came: boolean, now: number): CheckInResult {
  return tx(() => {
    const m = meetupFor(meetupId, personId);
    if (!m) return "missing";
    if (!isGoing(meetupId, personId)) return "not_going";
    if (!checkInOpen(m, now)) return "closed";
    ckq.set.run({ at: came ? now : null, id: meetupId, p: personId });
    return "done";
  });
}

// ---- Notes for people going (ADR 0002) ----
// A notice board for one meetup: only people going (host included) can read
// or post, leaving cuts you off at once, and it ends with the meetup: notes
// are hidden RUNS_FOR_MS after the start and deleted soon after.
db.exec(`
  CREATE TABLE IF NOT EXISTS meetup_notes (
    id         INTEGER PRIMARY KEY,
    meetup_id  INTEGER NOT NULL REFERENCES meetups(id),
    person_id  INTEGER NOT NULL REFERENCES people(id),
    body       TEXT    NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS meetup_notes_by_meetup ON meetup_notes (meetup_id, created_at);
`);

export const NOTE_MAX = 280;
addColumn("meetup_notes", "reply_to", "INTEGER");

export interface Note {
  id: number;
  // the note this one answers, or null for a note of its own
  reply_to: number | null;
  person_id: number;
  name: string;
  body: string;
  created_at: number;
}

const nq = {
  list: db.prepare(`SELECT n.id, n.reply_to, n.person_id, p.name, n.body, n.created_at
    FROM meetup_notes n JOIN people p ON p.id = n.person_id JOIN meetups m ON m.id = n.meetup_id
    WHERE n.meetup_id = $id AND m.starts_at > $since ORDER BY n.created_at, n.id`),
  insert: db.prepare(
    "INSERT INTO meetup_notes (meetup_id, person_id, body, created_at, reply_to) VALUES ($id, $p, $body, $at, $reply)",
  ),
  one: db.prepare(`SELECT n.meetup_id, n.person_id, n.reply_to, m.host_id
    FROM meetup_notes n JOIN meetups m ON m.id = n.meetup_id WHERE n.id = $nid`),
  // a note goes with the replies under it
  remove: db.prepare("DELETE FROM meetup_notes WHERE id = $nid OR reply_to = $nid"),
  purge: db.prepare(
    "DELETE FROM meetup_notes WHERE meetup_id IN (SELECT id FROM meetups WHERE starts_at <= $since)",
  ),
};

export function notesOpen(m: { starts_at: number }, now: number): boolean {
  return m.starts_at > now - RUNS_FOR_MS;
}

// Callers check isGoing first; this only filters out ended meetups.
export function notesFor(meetupId: number, now: number): Note[] {
  return nq.list.all({ id: meetupId, since: now - RUNS_FOR_MS }) as unknown as Note[];
}

// A reply answers a note of its own on the same meetup: one level, no
// replies to replies.
export function addNote(
  meetupId: number,
  personId: number,
  body: string,
  now: number,
  replyTo: number | null = null,
): "posted" | "not_going" | "bad_reply" {
  return tx(() => {
    const m = getMeetup(meetupId);
    if (!m || !isGoing(meetupId, personId) || !notesOpen(m, now)) return "not_going";
    if (replyTo !== null) {
      const parent = nq.one.get({ nid: replyTo }) as { meetup_id: number; reply_to: number | null } | undefined;
      if (!parent || parent.meetup_id !== meetupId || parent.reply_to !== null) return "bad_reply";
    }
    nq.insert.run({ id: meetupId, p: personId, body, at: now, reply: replyTo });
    return "posted";
  });
}

// The quick replies: one tap, shown as "Mia ❤️", never added up into a
// count (README: no likes).
export const QUICK_REPLIES = ["❤️", "😂", "🎉", "🙏", "😅", "🥲", "😴", "💪"];

// One-tap notes for the moment of meeting up, which is what the board is for.
export const QUICK_NOTES = ["On my way", "5 min late", "I'm here", "Can't find you"];

// Your own note, or any note on a meetup you host. Returns the meetup id it
// came from, or null if it wasn't yours to remove.
export function deleteNote(noteId: number, personId: number): number | null {
  return tx(() => {
    const n = nq.one.get({ nid: noteId }) as { meetup_id: number; person_id: number; host_id: number } | undefined;
    if (!n || (n.person_id !== personId && n.host_id !== personId)) return null;
    nq.remove.run({ nid: noteId });
    return n.meetup_id;
  });
}

export function purgeEndedNotes(now: number): void {
  nq.purge.run({ since: now - RUNS_FOR_MS });
}
