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
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}
// when the host last changed the time or place after people could see it,
// so everyone going can tell what changed
addColumn("meetups", "time_changed_at", "INTEGER");
addColumn("meetups", "place_changed_at", "INTEGER");
addColumn("meetups", "capacity_changed_at", "INTEGER");
addColumn("meetups", "note_changed_at", "INTEGER");

export interface Person {
  id: number;
  token: string;
  name: string;
}

export interface Meetup {
  id: number;
  interest: string;
  host_id: number;
  host_name: string;
  starts_at: number;
  place: string;
  capacity: number;
  note: string;
  cancelled_at: number | null;
  time_changed_at: number | null;
  place_changed_at: number | null;
  capacity_changed_at: number | null;
  note_changed_at: number | null;
  going: number;
}

// How long after its start a meetup still counts as "on" rather than finished.
export const RUNS_FOR_MS = 2 * 60 * 60 * 1000;
export const MAX_AHEAD_MS = 7 * 24 * 60 * 60 * 1000;

const meetupCols = `
  m.id, m.interest, m.host_id, h.name AS host_name, m.starts_at, m.place,
  m.capacity, m.note, m.cancelled_at,
  m.time_changed_at, m.place_changed_at, m.capacity_changed_at, m.note_changed_at,
  (SELECT COUNT(*) FROM joins j WHERE j.meetup_id = m.id) AS going`;

const q = {
  personByToken: db.prepare("SELECT id, token, name FROM people WHERE token = ?"),
  insertPerson: db.prepare("INSERT INTO people (token, name, created_at) VALUES (?, ?, ?) RETURNING id, token, name"),
  renamePerson: db.prepare("UPDATE people SET name = ? WHERE id = ?"),
  meetup: db.prepare(`SELECT ${meetupCols} FROM meetups m JOIN people h ON h.id = m.host_id WHERE m.id = ?`),
  upcoming: db.prepare(`SELECT ${meetupCols} FROM meetups m JOIN people h ON h.id = m.host_id
    WHERE m.interest = ? AND m.cancelled_at IS NULL AND m.starts_at > ? ORDER BY m.starts_at`),
  finished: db.prepare(`SELECT ${meetupCols} FROM meetups m JOIN people h ON h.id = m.host_id
    WHERE m.interest = ? AND m.cancelled_at IS NULL AND m.starts_at <= ? ORDER BY m.starts_at DESC LIMIT 20`),
  countUpcoming: db.prepare(`SELECT interest, COUNT(*) AS n FROM meetups
    WHERE cancelled_at IS NULL AND starts_at > ? GROUP BY interest`),
  // what you're going to: still on, plus called-off ones until their start
  // time passes, so you hear about it instead of turning up
  mine: db.prepare(`SELECT ${meetupCols}, me.joined_at AS joined_at FROM meetups m JOIN people h ON h.id = m.host_id
    JOIN joins me ON me.meetup_id = m.id AND me.person_id = ?
    WHERE m.starts_at > ? AND (m.cancelled_at IS NULL OR m.starts_at > ?) ORDER BY m.starts_at`),
  people: db.prepare(`SELECT p.id, p.name FROM joins j JOIN people p ON p.id = j.person_id
    WHERE j.meetup_id = ? ORDER BY j.joined_at`),
  isGoing: db.prepare("SELECT 1 FROM joins WHERE meetup_id = ? AND person_id = ?"),
  insertMeetup: db.prepare(`INSERT INTO meetups (interest, host_id, starts_at, place, capacity, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`),
  insertJoin: db.prepare("INSERT INTO joins (meetup_id, person_id, joined_at) VALUES (?, ?, ?)"),
  deleteJoin: db.prepare("DELETE FROM joins WHERE meetup_id = ? AND person_id = ?"),
  cancel: db.prepare("UPDATE meetups SET cancelled_at = ? WHERE id = ? AND cancelled_at IS NULL"),
  update: db.prepare(`UPDATE meetups SET starts_at = ?, place = ?, capacity = ?, note = ?,
    time_changed_at = ?, place_changed_at = ?, capacity_changed_at = ?, note_changed_at = ? WHERE id = ?`),
};

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

export function personByToken(token: string | undefined): Person | null {
  if (!token) return null;
  return (q.personByToken.get(token) as Person | undefined) ?? null;
}

export function createPerson(name: string): Person {
  const token = randomBytes(24).toString("base64url");
  return q.insertPerson.get(token, name, Date.now()) as unknown as Person;
}

export function renamePerson(id: number, name: string): void {
  q.renamePerson.run(name, id);
}

export function getMeetup(id: number): Meetup | null {
  return (q.meetup.get(id) as Meetup | undefined) ?? null;
}

// still on: hasn't started, or started less than RUNS_FOR_MS ago
export function upcoming(interest: string, now: number): Meetup[] {
  return q.upcoming.all(interest, now - RUNS_FOR_MS) as unknown as Meetup[];
}

export function finished(interest: string, now: number): Meetup[] {
  return q.finished.all(interest, now - RUNS_FOR_MS) as unknown as Meetup[];
}

export function upcomingCounts(now: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of q.countUpcoming.all(now - RUNS_FOR_MS) as { interest: string; n: number }[]) {
    out[row.interest] = row.n;
  }
  return out;
}

export type MyMeetup = Meetup & { joined_at: number };

export function myMeetups(personId: number, now: number): MyMeetup[] {
  return q.mine.all(personId, now - RUNS_FOR_MS, now) as unknown as MyMeetup[];
}

export function attendees(meetupId: number): { id: number; name: string }[] {
  return q.people.all(meetupId) as { id: number; name: string }[];
}

export function isGoing(meetupId: number, personId: number): boolean {
  return q.isGoing.get(meetupId, personId) !== undefined;
}

export interface NewMeetup {
  interest: string;
  hostId: number;
  startsAt: number;
  place: string;
  capacity: number;
  note: string;
}

// The host is the first person going, so they count toward the head count.
export function createMeetup(m: NewMeetup): number {
  return tx(() => {
    const now = Date.now();
    const { id } = q.insertMeetup.get(m.interest, m.hostId, m.startsAt, m.place, m.capacity, m.note, now) as {
      id: number;
    };
    q.insertJoin.run(id, m.hostId, now);
    return id;
  });
}

export type JoinResult = "joined" | "already" | "full" | "closed" | "missing";

// Capacity is checked and the row inserted in one IMMEDIATE transaction, so
// two people can't both take the last spot.
export function join(meetupId: number, personId: number, now: number): JoinResult {
  return tx(() => {
    const m = getMeetup(meetupId);
    if (!m) return "missing";
    if (m.cancelled_at !== null || m.starts_at <= now) return "closed";
    if (isGoing(meetupId, personId)) return "already";
    if (m.going >= m.capacity) return "full";
    q.insertJoin.run(meetupId, personId, now);
    return "joined";
  });
}

export function leave(meetupId: number, personId: number): void {
  q.deleteJoin.run(meetupId, personId);
}

export function cancel(meetupId: number, now: number): void {
  q.cancel.run(now, meetupId);
}

export interface MeetupEdit {
  startsAt: number;
  place: string;
  capacity: number;
  note: string;
}

export type EditResult = "saved" | "too_small" | "closed" | "missing";

// The head count can't go below the people already going: nobody who joined
// gets pushed out. Checked in the same transaction as the update.
export function editMeetup(meetupId: number, e: MeetupEdit, now: number): EditResult {
  return tx(() => {
    const m = getMeetup(meetupId);
    if (!m) return "missing";
    if (m.cancelled_at !== null || m.starts_at <= now) return "closed";
    if (e.capacity < m.going) return "too_small";
    q.update.run(
      e.startsAt,
      e.place,
      e.capacity,
      e.note,
      e.startsAt !== m.starts_at ? now : m.time_changed_at,
      e.place !== m.place ? now : m.place_changed_at,
      e.capacity !== m.capacity ? now : m.capacity_changed_at,
      e.note !== m.note ? now : m.note_changed_at,
      meetupId,
    );
    return "saved";
  });
}
