# Process overview

*Crit 8 version. This is a first draft, and it will be rewritten at each crit.*

## From the brief to the harness

The brief asks for a multi-user, real-time app that's good. I chose an
**activity buddy finder** for ANU students: someone to run, play badminton or
get coffee with, today or this week. The agent warned this could easily turn
into a small Meetup clone, so before any code was written I narrowed it down:

- one campus, and meetups start within 7 days
- no accounts, DMs, profiles or ratings
- crit 8 covers only hosting, joining, leaving and editing a meetup

Then I turned that into a harness, so "good" is written down in three places,
not just in my head:

- **README.md** says what good means
  ([`9a64a3e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/9a64a3e))
- **CLAUDE.md** turns it into rules for the agent
  ([`7fba852`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/7fba852))
- **spec/** tests the parts that can be checked, against the running app
  ([`ce1f84b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/ce1f84b))

These three are meant to match. A CLAUDE.md rule with no README behind it is
just my opinion. A README promise with no test in `spec/` is not actually
enforced. So each README commitment — concrete meetups, everything near,
one-action join and leave, a real head count — gets a CLAUDE.md rule that
says how it's enforced (a transaction, a server check, a deleted row), and at
least one `spec/` test that checks it over HTTP, the way a browser would.

## Agentic workflow

With the direction and scope agreed, I worked with the agent to build the
app. Three things kept happening, every week: I directed the decisions, the
agent grounded its work in real constraints instead of guessing, and both of
us corrected mistakes when we found them.

**Directed.** I chose the scope (one campus, seven days) and what the app
does after people agree to meet. The agent proposed options; I picked between
them. For example, I decided hosts could edit a meetup, but the app had to
say exactly what changed, and could never drop the head count below the
number of people already going. I also decided the home page should show
"You're going to" first when someone already has a plan, instead of the list
of interests
([`6d7b843`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/6d7b843),
[`1fcb21b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/1fcb21b)).

**Grounded.** The constraints came from `fly.toml` (a 256 MB machine, one
volume) and from `spec/`, both read before any code. The spec tests don't
call internal functions — they send real HTTP requests to the running
server, the way a browser would, including checking that a fresh visitor and
the host, coming back later, both still see the same meetup
([`ce1f84b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/ce1f84b)).
Testing the running app, not just reading the code, is what caught both
corrections below.

**Corrected.** One of my own tests was wrong at first. It said the page
should never contain the word "left", which fails on the harmless "1 spot
left". I narrowed it to the exact wording that would mean someone's leaving
was recorded — "flaked", "dropped out", "left the meetup" — and running it
against the real page is what caught the mistake. The agent needed
correcting too. Early on, it wrote the whole app in one go and committed it
without asking. I stopped it, had it undo those commits, and from then on it
checked with me before each change
([`f38ad35...d5a90d2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/compare/f38ad35...d5a90d2)).
A second time, asked to just start the dev server and confirm it worked, it
began writing a full browser-automation script instead of a one-line check.
I stopped it and asked what I actually needed, which was much simpler. Both
corrections taught the same lesson: match the effort to the ask. Too little
checking misses real bugs, like the timestamp one below. Too much checking,
on a task that only needed a quick confirmation, wastes time and risks
building something nobody asked for.

A third correction came from this crit's own checks. The test "tells someone
who joined exactly what the host changed afterwards" failed sometimes. The
cause: `joined_at` and the changed-at columns were both stamped with
`Date.now()`, so a join and an edit landing in the same millisecond tied —
and a tie read as "nothing changed" to the person who'd joined. The fix
records those timestamps with a counter that only ever goes up, so they
always match the real order events happened in, not the clock's precision
([`c571c50`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/c571c50)).
This bug would not have shown up just from reading `src/db.ts` — it only
appeared once the spec ran enough real requests, one after another.

## Stack

The stack is Node 24, the built-in SQLite on the Fly volume, and plain
server-rendered pages with no framework. It fits the 256 MB machine, needs
almost no dependencies, and SQLite transactions stop two people taking the
last spot at once. A separate database server was the obvious alternative,
but it would need its own process on a machine that barely fits one. A
single Fly volume already gives one writer all the durability a
buddy-finder needs. The trade-off is that this stops working the moment
there's a second machine — fine for now, and why scaling to more than one
machine isn't on the crit 9 list below.

The full decision and trade-offs are in
[docs/decisions/0001-stack.md](docs/decisions/0001-stack.md)
([`d5a90d2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/d5a90d2)).

## Next

Crit 9 will add real-time updates, meeting-point details, an in-meetup notice
board, and check-in. Each of those is also a test of the same three rules:
I'll direct what they mean, ground the work in the running app, and expect to
be corrected at least once.
