# Process overview

*Crit 8 version.*

## From the brief to the harness

The brief asks for a multi-user, real-time app that's good. I chose an
**activity buddy finder** for ANU students: someone to run, play badminton or
get coffee with, today or this week. The agent warned this could easily turn
into a small Meetup clone, so before any code was written I narrowed it down:

- one campus, and meetups start within 7 days
- no accounts, DMs, profiles or ratings
- Crit 8 covers only hosting, joining, leaving and editing a meetup

Then I turned that into a harness, so "good" is written down in three places,
not just in my head:

- **README.md** says what good means
  ([`9a64a3e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/9a64a3e))
- **CLAUDE.md** turns it into rules for the agent
  ([`7fba852`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/7fba852))
- **spec/** tests the parts that can be checked against the running app
  ([`ce1f84b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/ce1f84b))

These three are meant to match. Each README commitment — concrete meetups, everything near, one-action join and leave, and a real head count — becomes a rule in `CLAUDE.md` and a test in `spec/`. `CLAUDE.md` tells the agent how the rule should be enforced, while `spec/` checks that it actually works by sending HTTP requests to the running app, just like a browser would.

## Agentic workflow

With the direction and scope agreed, I worked with the agent to build the app. Three things kept happening throughout the work: I directed the decisions, the agent grounded its work in real constraints instead of guessing, and both of us corrected mistakes when we found them.

**Directed.** I chose the scope (one campus, seven days) and what the app should do after people agree to meet. The agent proposed options; I picked between them. For example, I decided hosts could edit a meetup, but the app had to say exactly what changed and could never drop the head count below the number of people already going. I also decided the home page should show "You're going to" first when someone already has a plan, instead of the list of interests
([`6d7b843`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/6d7b843),
[`1fcb21b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/1fcb21b)).

**Grounded.** The agent grounded its work in `fly.toml` (a 256 MB machine and one volume) and `spec/`, which it read before making changes. The spec tests the running app through real HTTP requests, including checking that a fresh visitor and the host, coming back later, still see the same meetup
([`ce1f84b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/ce1f84b)).


**Corrected.** I corrected the process when the agent moved too quickly. Early on, it wrote the whole app in one go and committed it without asking. I stopped it, had it undo the commits, and changed the workflow so it checked with me before making changes
([`f38ad35...d5a90d2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/compare/f38ad35...d5a90d2)).

The tests also caught mistakes in the app itself. When I ran `pnpm check:evidence`, one test for showing post-join changes exposed a timestamp bug: joined_at and the change timestamps could be identical when two actions happened in the same millisecond. The fix uses a monotonic counter so events always follow their actual order
([`c571c50`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/c571c50)).

These corrections changed how I used the agent: it should not guess or overbuild. It should work from the constraints, propose the next step, and let me decide before making the change.

## Stack

The stack is Node 24, the built-in SQLite on the Fly volume, and plain server-rendered pages with no framework. It fits the 256 MB machine, needs almost no dependencies, and SQLite transactions stop two people from taking the last spot at once.

The full decision and trade-offs are in
[docs/decisions/0001-stack.md](docs/decisions/0001-stack.md)
([`d5a90d2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/d5a90d2)).

## Next

Crit 9 will add real-time updates, meeting-point details, an in-meetup notice
board, and check-in. 
