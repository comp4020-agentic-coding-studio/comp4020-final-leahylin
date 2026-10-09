# 3. Live updates: broadcast a signal, let each page re-fetch itself

Date: 2026-10-09 · Status: accepted (crit 9)

## Context

[0002](0002-crit9-scope.md) fixed the shape: site-wide live updating, server-sent
events from the same process, no pub/sub. It left the hard parts open — what
actually travels over the stream, and what stops a few hundred open sockets from
sinking a 256 MB machine. Building it also turned up a cost consequence 0002
didn't anticipate, which is the part worth writing down.

The app had no client JavaScript at all before this, and CLAUDE.md's rule is
that script may enhance a page but never be required.

## Decision

- **The stream carries a signal, not content.** An event says only that a topic
  (`i:coffee`, `m:12`) moved. The page then re-fetches *itself* with its own
  cookie and swaps in the regions whose HTML differs. Rendering stays entirely
  in `src/views.ts`: there is no second renderer on the client to drift, and no
  personalised HTML on a shared broadcast.
- **Topics are a filter, never authorization.** Subscribing to someone else's
  topic tells you only that something changed. What you see still comes from a
  normal request authorised by your cookie, so `personByToken` remains the one
  identity seam, per CLAUDE.md. A spec test asserts no nickname or place ever
  appears in a frame.
- **Turning a client away still looks like a stream.** Per the EventSource
  spec, a response that isn't `200 text/event-stream` *fails the connection* —
  the browser gives up for good and that tab is silently dead until someone
  reloads. So a connection over the cap gets `200`, a `retry:` delay, and a
  clean close. Never a 503.
- **Four caps**: total streams, anonymous streams, per person, per IP. The
  anonymous share is capped separately because a cookie-less flood would
  otherwise lock out everyone who has one.
- **Pages that are mostly a form get no stream at all.** Only a GET that
  returned 200 passes topics, so the host form's 400 page — which holds what
  someone just typed — is never re-fetched and swapped.

## Alternatives considered

- **Push rendered HTML fragments.** Halves the round trips, but a card's markup
  depends on who's looking (`you're hosting`, `you're in`, the join button), so
  a broadcast fragment would have to be rendered per subscriber, or the client
  would have to patch it. Re-fetching keeps one renderer and one authorisation
  path.
- **Push JSON and render on the client.** The usual answer, and it would mean a
  second copy of `views.ts` in the browser, drifting. It also breaks the JS-off
  rule outright rather than degrading.
- **Scope the stream to one page.** 0002 already rejected this, and it was
  right: stale spot counts on the list page are exactly what people open it to
  check.
- **A 503 over the cap.** The obvious answer, and wrong — see above. It reads
  as correct and fails invisibly.

## Consequences

- **The machine stays awake while anyone has a visible tab.** `fly.toml` runs
  `auto_stop_machines = "stop"` with `min_machines_running = 0`, and
  [0001](0001-stack.md) leans on that for "cents, not dollars". An open stream
  is an active connection, so that saving now holds only when nobody is looking.
  The client closes its stream ~30s after a tab is hidden, and stops reconnecting
  after a long idle stretch, which is what keeps this from meaning "awake
  always" — but a forgotten open tab does cost money in a way crit 8 didn't.
- **Open: Fly's per-machine concurrency limit is unverified.** Long-lived
  streams count against it for their whole life, and with one machine and no HA
  there is nowhere to overflow — past the limit the proxy fails *page loads*,
  not just streams. The app's own cap is set to 60 to stay well clear, but the
  real limit should be checked and set explicitly in `fly.toml` before this is
  deployed under any real load.
- **A shut-down is now graceful.** Killed outright, every stream is a severed
  socket and every client reconnects within seconds, waking the machine back up
  — the stop undone by the thing it just killed. SIGTERM now closes streams with
  a retry delay first.
- **Every write publishes, so writes now fan out to renders.** One join on a
  busy interest page asks every watcher to re-render it, and `node:sqlite` is
  synchronous on a shared vCPU. Re-fetches are jittered to spread the herd. The
  N+1 in the interest-page query (`db.isGoing` per meetup) is unchanged and is
  the first thing to fix if this ever feels slow.
- **Clock-driven text would otherwise go stale while claiming to be live.**
  Nothing is published when a meetup simply starts, so "in 5 min" would sit
  there lying. A slow visible-only tick re-fetches on its own, which also heals
  anything missed while the machine was asleep.
- **`src/events.ts` holds no state that matters.** Losing the registry on
  restart costs a reconnect, not data, so CLAUDE.md's "nothing that matters
  lives in memory" still holds.
