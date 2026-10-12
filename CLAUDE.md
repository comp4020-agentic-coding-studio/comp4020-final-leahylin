# Buddy Up — rules for the agent

`README.md` is the argument for what good means in this app. These rules come
from it. If a change would break one of them, stop and say so. Don't route
around a rule; argue for changing the README first.

## What the app must never do

- **Never let a meetup go over its head count.** Joins are checked against
  capacity inside one database transaction, so two requests arriving together
  can't both take the last spot.
- **Never accept a vague meetup.** Every meetup has an interest, a start time,
  a place and a capacity (2–12). A start time in the past or more than 7 days
  ahead is refused on the server, whatever the form allows.
- **Never record that someone left.** Leaving deletes the join row. No
  "flaked", "left" or "no-show" state, counts or history.
- **Never show who checked in.** A meetup shows how many people said "I
  came", never which ones, and nothing reads one person's check-ins across
  more than one meetup: that would be an attendance record
  ([decision 2](docs/decisions/0002-crit9-scope.md)).
- **Never show a meetup's notes to anyone not going.** Notes and replies are
  for people with a join row, host included; leaving cuts you off at once,
  and they end two hours after the start.
- **Never add up quick replies.** An emoji reply shows as one person's reply,
  by name. No totals, no "❤️ 3": that's a like count.
- **Never show a meetup to anyone outside its audience.** A meetup's audience
  is one circle or the host's direct friends, never the public and never
  friends of friends. The server checks it on every read and every write, and
  the live-update stream only signals topics the viewer can see
  ([decision 4](docs/decisions/0004-accounts-circles-friends.md)).
- **Never show an activity's name to someone who can't see one of its
  meetups.** Activities beyond running, badminton and coffee are made by
  whoever posts the first meetup; the menu, home and `/i/<slug>` all go
  through the same VISIBLE rule
  ([decision 5](docs/decisions/0005-custom-activities.md)).
- **Never let a circle go over 25 members.** Joining checks the count inside
  the same transaction as the insert, like the head count.
- **Never store a password as typed.** Hash it with `scrypt` and a per-user
  salt, compare in constant time, and never log it or echo it back.
- **Display names are unique (ignoring case) and never change.** A name on
  a meetup is always the same person. A unique index in `src/db.ts` enforces
  it, not just the form, and there is no rename route.
- **Never make friend lists public.** No one sees another person's friends or
  a count of them.
- **Never add emails, DMs, public profiles, followers, likes, ratings, or a
  ranking of people.** README "What I chose not to build" says why. Proposing
  one is fine; building one without the README changing first is not.
- **Never trust the client for identity.** Who you are is the session cookie's
  random token, looked up server-side. Usernames or names in form fields are
  never used to decide who did something.
- **Never render user text unescaped.** Every nickname, place and note goes
  through `esc()` in `src/html.ts`.
- **Never log a password, note, or reply body.** Server logs carry only
  identifiers and short result codes, never free text someone typed.
  `src/log.ts`'s `format()` throws if a call site tries
  ([decision 6](docs/decisions/0006-action-logging.md)).

## What every page holds to

- Works with JavaScript off. Every action is a plain HTML form POST followed by
  a redirect (POST/redirect/GET). Script may enhance a page, never be required.
- Times are shown in Australia/Sydney, as a person would say them
  ("Tue 7 Oct, 6:00 pm").
- Readable on a phone at 360px wide. People will open this on the way out.
- English only: UI, docs and code. No Chinese text anywhere.

## What a change must not break

- `pnpm check` is green against the running app (`node src/server.ts`, then
  `pnpm check`). The two template checks in `spec/invariants.test.ts` stay.
- Data lives only in SQLite at `$DATA_DIR/buddyup.db` (`/data` on Fly). Nothing
  that matters lives in memory. A restart or redeploy loses nothing.
- Schema changes are additive `CREATE ... IF NOT EXISTS` / `ALTER TABLE ADD`
  migrations in `src/db.ts`. Never drop or rewrite a table holding real data.
- `/readme/` renders all of README.md.
- The app fits a 256 MB machine: no headless browsers, no build step at runtime,
  as few dependencies as possible. Ask before adding one.

## How to work

- Small commits that each do one thing, with messages that say why.
- When a decision trades something off (stack, what persists, what's left out),
  add or update a record in `docs/decisions/` and link it from `PROCESS.md`.
- New rules in the README's "How good is checked" list get a test in `spec/`.
