# 4. Accounts, circles and friends: only meet people you know

Date: 2026-10-09 · Status: proposed (crit 9, not yet built)

## Context

At crit 8 a pod member raised a safety problem. Buddy Up let anyone on the
internet see a meetup and join it, and the place and time were right there.
Turning up to meet a complete stranger, alone, at a car park on Black
Mountain, is a real risk. The app's whole point is getting people to
actually turn up, so it was making that risk easier, not harder.

The crit 8 README ruled out accounts and friend lists, arguing that a light
connection needs a light way in, and that friend lists push toward a social
network. The first argument doesn't survive the safety problem: a nickname
and a cookie can't tell you anything about who is coming. So this record
reverses both exclusions, and narrows who you can meet instead of who can
sign up.

## Decision

- **Accounts: username and password.** A display name, a unique username,
  and a password hashed with Node's built-in `scrypt` and a per-user salt.
  The session is a random token in an HttpOnly cookie, as now. No email and
  no password reset: within a course project that's an acceptable cost, and
  README says so. Repeated failed logins for a username are slowed down.
- **Circles, joined by invite.** Anyone can start a circle ("COMP4020",
  "Bruce Hall 3F"). It has an invite link with a random code; opening it while
  signed in joins you. The creator can reset the code, which kills old links.
  **A circle holds at most 25 people**: beyond that, members stop knowing
  each other, which is the problem this solves. Anyone can leave a circle.
- **Friends, both ways.** Find someone by exact username, send a request,
  and they accept. Either can remove the other. Your friend list is visible
  only to you: no counts, no public list.
- **Every meetup has an audience: one circle, or the host's friends.**
  - Posted to a circle: only that circle's members can see it or join.
  - Posted to "my friends": only the host's direct friends can. Friends of
    friends can't. That would bring strangers back.
  - There is no public option.
  - Every check runs on the server, on every read and every write. The same
    rule covers the live-update stream: it only signals topics you can see.
- **Signed out, you see nothing but what Buddy Up is and how to sign in.**
- **Existing data is cleared.** Crit 8 data is nicknames with no passwords,
  in no circle, plus test rows. There is nothing to migrate it into.

## Alternatives considered

- **Friends only.** If A is friends with B and C, B and C can still be
  strangers at A's meetup. Adding friends one by one is also slow in a full
  showcase room.
- **Circles only.** Closest to "an app for twelve people". But it leaves no
  way to ask two specific friends who aren't in a shared circle.
- **Keep nicknames, add a safety notice.** It's cheap, but it puts the risk
  on the person turning up instead of reducing it.
- **Friends of friends can see "my friends" meetups.** More meetups would
  fill up, but it brings back the exact stranger problem.
- **Email verification with an ANU address.** It proves someone is a
  student, not that anyone knows them. It also needs a mail service, which
  is outside the Fly setup.

## Consequences

- README changes: a new commitment ("you only meet people you know"), and
  accounts and friend lists come off "What I chose not to build". CLAUDE.md's
  "never add accounts… friends" rule has to change to match before any code
  is written.
- New tables: users with password hashes, sessions, circles, circle members,
  friendships, and an `audience` on each meetup. The meetup table gets an
  additive column. The crit 8 data is dropped, once, on deploy.
- Every query that lists or loads a meetup now takes the viewer. A missed
  check means a stranger sees a meetup. That's the most important thing for
  `spec/` to test.
- Joining is no longer open to the whole showcase room at once. For the
  showcase, a circle's invite code goes up on the screen.
- A lost password means a new account. README says so.
