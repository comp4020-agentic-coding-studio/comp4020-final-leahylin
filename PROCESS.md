# Process overview

*Crit 8 version. This is a first draft, and it will be rewritten at each crit.*

## From the brief to the harness

The brief asks for a multi-user, real-time app that's good. I chose an
**activity buddy finder** for ANU students: someone to run, play badminton or
get coffee with, today or this week. The agent warned this could easily become
a small Meetup clone, so I narrowed it down before any code was written:

- one campus, and meetups start within 7 days
- no accounts, DMs, profiles or ratings
- crit 8 covers only hosting, joining, leaving and editing a meetup

Then I turned that into the harness, so "good" means the same thing in three
places instead of living only in my head:

- **README.md** says what good means
  ([`9a64a3e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/9a64a3e))
- **CLAUDE.md** turns it into rules for the agent
  ([`7fba852`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/7fba852))
- **spec/** tests the parts that can be checked, against the running app
  ([`ce1f84b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/ce1f84b))

These three are meant to agree: a rule in CLAUDE.md that isn't backed by the
README is just my opinion dressed up as policy, and a README claim with no
test in `spec/` is a promise nobody is actually holding the app to. So each
README commitment — concrete meetups, everything near, one-action join and
leave, a real head count — has both a CLAUDE.md rule that names the mechanism
(a transaction, a server-side check, a deleted row) and at least one `spec/`
test that exercises it against HTTP, not against an internal function.

## Agentic workflow

With the direction and scope agreed, I worked with the agent to build it. The
working pattern that survived the week has three parts: I directed the
decisions, the agent grounded its work in constraints and the running app
rather than assumption, and both of us corrected course when something was
wrong.

**Directed.** I set the topic, the scope (one campus, seven days), and the
direction for what comes after a meetup is agreed. The agent proposed options
and I chose among them, not the other way round. For example, I decided hosts
could edit a meetup, but the app had to say exactly what changed and could
never drop the head count below the number of people already going. I also
decided the home page should show "You're going to" first when someone
already has a plan, instead of the interest list
([`6d7b843`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/6d7b843),
[`1fcb21b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/1fcb21b)).

**Grounded.** Constraints came from `fly.toml` (a 256 MB machine, one volume)
and from `spec/`, both read before any code. The spec tests don't call
internal functions; they run HTTP requests against the actual running server,
the same way a browser would, including checking that a fresh visitor and the
host, coming back later, still see the meetup that was there before
([`ce1f84b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/ce1f84b)).
Grounding in the running app, not just the code, is what caught both
corrections below — neither was visible from reading the source alone.

**Corrected.** One of my own tests was wrong at first. It asserted the page
never contains the word "left", which fails on the harmless "1 spot left". I
narrowed it to the specific wording that would actually record someone
leaving — "flaked", "dropped out", "left the meetup" — and running it against
the real page output is what surfaced the mistake. The agent corrected course
too: early on it wrote the whole app in one commit without asking me. I
stopped it, had it undo the commits, and changed the workflow so it checked
with me before changing anything from then on
([`f38ad35...d5a90d2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/compare/f38ad35...d5a90d2)).
A third correction came out of this same preflight pass: the test for "tells
someone who joined exactly what the host changed afterwards" failed
intermittently, because `joined_at` and the changed-at columns were both
stamped from `Date.now()` — two requests landing in the same millisecond tied,
and a tie reads as "no change" to anyone who'd joined. The fix records those
columns with a monotonic counter instead, so they always reflect the real
order of events, not the clock's resolution
([`c571c50`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/c571c50)).
That bug would not have shown up from reading `src/db.ts` in isolation; it
only appeared once the spec ran enough real requests back to back.

The agent needed correcting too, in the other direction. Asked to just run
the dev server and confirm it was up, it started writing a full headless-
browser driver script to click through hosting a meetup — far more than the
ask, and the kind of dependency CLAUDE.md already rules out for a 256 MB
machine. I stopped it before anything was written and asked what I actually
wanted, which was a single `curl`. The rule that came out of it: for checking
that a running app is up, use the smallest check that proves it, not the most
thorough one you can think of.

## Stack

The stack is Node 24, the built-in SQLite on the Fly volume, and simple
server-rendered pages with no framework. It fits the 256 MB machine, needs
almost no dependencies, and SQLite transactions stop two people from taking
the last spot. A separate database server was the obvious alternative, but it
would need its own process on a machine that barely fits one, and a single
Fly volume already gives one writer the durability a buddy-finder actually
needs. The trade-off is that this stops working the moment there's a second
machine — fine for now, and the reason multi-machine scaling isn't on the
crit 9 list below.

The full decision and trade-offs are in
[docs/decisions/0001-stack.md](docs/decisions/0001-stack.md)
([`d5a90d2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/d5a90d2)).

## Next

Crit 9 will add real-time updates, meeting-point details, an in-meetup notice
board, and check-in.
