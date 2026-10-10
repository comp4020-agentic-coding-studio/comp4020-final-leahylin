# 2. Crit 9 scope: real-time, meeting point, notice board, check-in

Date: 2026-10-09 · Status: accepted, built (crit 9)

## Context

README's "Next" line names four things for crit 9: real-time updates,
meeting-point details, an in-meetup notice board, and check-in. Each of
these is broad enough to sprawl the same way the original activity-buddy
idea sprawled toward a Meetup clone before crit 8. Before writing any code,
each one needs a concrete shape and an explicit "not this" boundary.

## Decision

- **Real-time updates are site-wide.** The meetup detail page (headcount,
  roster), each interest's list page (meetups appearing or filling up), and
  the home page's "You're going to" block all update live. Per
  [0001](0001-stack.md), this is server-sent events broadcast from the same
  process after each write — no pub/sub, no second service. With JS off, a
  plain page reload shows the same state; SSE only removes the need to
  reload.

- **`place` splits into an area and a meeting point.** The existing free-text
  `place` stays as the general area ("Black Mountain"); a new column holds
  the specific spot to meet ("car park near the lookout"). Both stay plain
  text — no maps, no geolocation, no pins. README already excludes maps and
  recommendations; this doesn't reopen that.

- **The notice board is scoped to people who have joined.** Only someone
  with a join row for that meetup — including the host — can read or post.
  Leaving removes access immediately, the same moment the join row is
  deleted. This is a group board for one meetup, not a DM: it dies with the
  meetup, same as the roster.

- **Check-in is per person, self-reported, and never leaves the meetup.**
  Each joined person marks their own join row "I came." The only thing read
  back out is the count for that one meetup, which feeds the short log's
  "4 went" line. No view, route or query may read a person's check-ins
  across more than one meetup — that would be the personal attendance
  record CLAUDE.md already rules out.

## Alternatives considered

- **Real-time scoped to just the meetup detail page.** Narrower and safer on
  a 256 MB machine, but it leaves the interest list and home page showing
  stale spot counts, which is the exact "is it full" question people open
  those pages to answer.
- **One `place` field, just encouraged to be more specific.** No schema
  change, but it keeps mixing "which part of campus" and "where exactly to
  stand" in one string, which is what prompted this item in the first place.
- **Notice board open to anyone, or host-only announcements.** Open-read
  would let a stranger watch a group's plans, which sits oddly next to "no
  DMs, no public social feed." Host-only announcements are simpler but stop
  being a *notice board* — it'd be one more broadcast channel, not the group
  note README promised.
- **Check-in by host tally, or automatic once the start time passes.** A
  host tally only needs one tap but makes the host respond for a count they
  may not know. Automatic check-in needs no action at all but can't tell
  "it happened" from "nobody showed" — the one distinction check-in exists
  to make.

## Consequences

- Site-wide SSE means more concurrent open connections on one 256 MB
  machine than the meetup-detail-only option would. Whoever builds this
  needs to size and cap connections (e.g. per visitor, with a timeout) before
  it ships, not after.
- The area/meeting-point split is an additive `ALTER TABLE ADD COLUMN`
  migration, consistent with the existing migration rule in CLAUDE.md.
- The notice board's capacity-style guard (is this person actually joined?)
  reuses the same join-row check as the headcount transaction — no new kind
  of authorization logic.
- Per-person check-in needs a spec test asserting no route or view
  aggregates one person's check-ins across meetups, per CLAUDE.md's "new
  rules get a test in spec/."
