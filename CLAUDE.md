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
- **Never add accounts, passwords, emails, DMs, profiles, followers, likes,
  ratings, or a ranking of people.** README "What I chose not to build" says
  why. Proposing one is fine; building one without the README changing first
  is not.
- **Never trust the client for identity.** Who you are is the `buddyup` cookie's
  random token, looked up server-side. Names in form fields are never used to
  decide who did something.
- **Never render user text unescaped.** Every nickname, place and note goes
  through `esc()` in `src/html.ts`.

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
