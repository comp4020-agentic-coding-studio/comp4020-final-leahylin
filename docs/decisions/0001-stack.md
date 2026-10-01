# 1. Node + node:sqlite + server-rendered forms

Date: 2026-10-01 · Status: accepted (crit 8)

## Context

Crit 8 asks for proof of life: a stranger can host or join a meetup and find
it still there later. The course's Fly setup fixes the shape: one shared CPU,
**256 MB of memory**, one volume at `/data`, no separate database server. The
real-time layer can wait until crit 9, but the choice shouldn't make it hard.

The data is small and relational: people, meetups, who joined which. The one
hard rule is "a meetup never goes over its head count", which needs a real
transaction.

## Decision

- **Node 24, running `.ts` files directly.** Node strips types itself, so
  there's no bundler or build step. The harness (`pnpm check`) is already
  Node/TypeScript, so app and tests share one language and the tests can
  import `src/time.ts`.
- **`node:sqlite` (built in), one file at `/data/buddyup.db`, WAL mode.** It
  persists on the volume, needs no server process, and has no native module
  to compile. Capacity is enforced with `BEGIN IMMEDIATE` around check+insert.
- **Plain `node:http` and server-rendered HTML forms, no framework, no
  client JS.** Every action is a form POST then a redirect. It works on any
  phone with JS off and keeps the image tiny. One dependency: `marked`,
  to render README at `/readme/`.

## Alternatives considered

- **Next.js / SvelteKit + Postgres.** That's the median answer. A framework
  build and a Node server with SSR fit badly in 256 MB, and Postgres would
  have to be a second Fly app, which is outside the course setup.
- **better-sqlite3.** It's mature, but it's a native addon. That means a
  compile step on Alpine, and it adds nothing node:sqlite lacks at this scale.
- **A JSON file on the volume.** It's simplest, but there's no transaction,
  so two people could take the last spot together. That breaks commitment 4.
- **Hono / Express.** These would be nice for routing. There are about ten
  routes, so a regex switch is shorter than learning a router's conventions.

## Consequences

- `node:sqlite` is still marked experimental in Node 24 and prints a warning
  (silenced in the Dockerfile). The API is small and the data is a plain SQLite
  file, so moving to better-sqlite3 later would be a few lines.
- One machine, one process, one SQLite writer. That's fine for one campus. It
  also means crit 9's real-time layer can be **server-sent events from the same
  process**, broadcasting after each write, with no pub/sub needed.
- Hand-written routing and HTML escaping are mine to get right. The spec
  tests escaping, and CLAUDE.md requires `esc()` on every user value.
