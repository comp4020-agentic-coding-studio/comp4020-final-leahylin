# 6. Action logging: tell two people apart from the logs alone

Date: 2026-10-12 · Status: accepted, built (crit 10)

## Context

Crit 10 ("Fly by instruments") requires that a presenter narrate what two
pod members are doing in separate browsers purely by tailing
`flyctl logs -a <repo>`, without touching the app themselves. The
multi-user and server-side-authorization machinery itself was already in
place from crit 9 ([decision 4](0004-accounts-circles-friends.md)): every
meetup, circle and friend action runs through a session lookup and a
server-side check. What was missing was any record of it. `src/server.ts`
had exactly one `console.error` for crashes and one startup line — nothing
said who did what, or who was turned away.

## Decision

- **One log line per request**, written with `console.log` to stdout,
  which Fly already captures; `flyctl logs` tails it live with nothing new
  to provision.
- **Plain `key=value` pairs, not JSON.** A presenter reading lines off a
  terminal mid-demo needs `actor=amy#12 action=join_meetup meetup=7
  result=denied reason=full` to parse at a glance. It's still trivially
  greppable (`flyctl logs | grep actor=amy`).
- **A generic hook plus per-route enrichment.** `handle()` resolves the
  actor once (`username#id`, or `anon`) and logs `time`, `actor`, `method`,
  `path` and `status` on every request via `res.once("finish", ...)`. That
  alone tells two people apart and shows a bare status code. Route
  handlers attach an `action`, a resource id, and `result: "ok" | "denied"`
  (plus a short `reason` enum on denial) to the same line, so a mutating
  request is still exactly one line, not two.
- **`/events` is a special case.** It's a long-lived SSE connection, so
  `finish` only fires on disconnect, sometimes minutes later. Its
  subscribe/decline decision is logged immediately instead.
- **`src/log.ts`'s `format()` refuses to log a password, note, body or
  message field** — it throws if asked to. This is a structural guardrail,
  not a convention: it extends CLAUDE.md's existing "never log a password"
  rule to note and reply content, which CLAUDE.md also protects.

## Alternatives considered

- **JSON lines.** Machine-parseable, but harder for a human to read while
  narrating live off a scrolling terminal. Both are equally greppable, so
  there's no real accuracy trade-off, only readability.
- **A `logs` table in SQLite.** Would satisfy "persists past the crit",
  but stdout already does that via `flyctl logs`, and a table adds schema
  and storage cost on a 256 MB machine for no benefit the crit asks for.
- **A logging-as-a-service add-on.** New dependency and new cost outside
  the course's Fly-only setup; CLAUDE.md says ask before adding one, and
  nothing here needs it.

## Consequences

- Every mutating route gets one or two extra `ctx.*` assignments at its
  decision points; no route's behaviour or response changes.
- A future call site that tries to log a password, note, reply body or any
  field named `message` gets a thrown error instead of a leaked line.
- No `spec/` test: logging isn't observable over HTTP, and
  `vitest.config.ts` only runs tests against the running app's responses.
  This is a judged-not-tested item, like several others in `README.md` —
  the crit demo is the check.
