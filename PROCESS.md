# Process overview

*Crit 8 version. This is a first draft, and it will be rewritten at each crit.*

## From the brief to the harness

The brief asks for a multi-user, real-time app that's good. I chose an
**activity buddy finder** for ANU students: someone to run, play badminton or
get coffee with, today or this week. The agent warned this could easily become
a small Meetup clone, so I narrowed it down:

- one campus, and meetups start within 7 days
- no accounts, DMs, profiles or ratings
- crit 8 covers only hosting, joining, leaving and editing a meetup

Then I turned that into the harness:

- **README.md** says what good means ([`9a64a3e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/9a64a3e))
- **CLAUDE.md** turns it into rules for the agent ([`7fba852`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/7fba852))
- **spec/** tests the parts that can be checked, against the running app
  ([`ce1f84b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/ce1f84b))

## Agentic workflow

With the direction and scope agreed, I worked with the agent to decide how to build it. At first, the agent wrote everything in one go and committed it without asking me.

I stopped it, had it undo the commits, and changed the workflow. From then on, the agent checked with me before making changes. It suggested options, I chose, and it made the changes and re-ran the tests.

For example, I decided that hosts could edit a meetup, but the app had to say exactly what changed and never reduce the head count below the number of people already going. I also decided to show "You're going to" first when a user already has a plan.

I reviewed the work and committed it myself in small steps
([`f38ad35...d5a90d2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/compare/f38ad35...d5a90d2)).

## Stack

The stack is Node 24, the built-in SQLite on the Fly volume, and simple
server-rendered pages with no framework. It fits the 256 MB machine, needs
almost no dependencies, and SQLite transactions stop two people from taking
the last spot. 

The full decision and trade-offs are in
[docs/decisions/0001-stack.md](docs/decisions/0001-stack.md) ([`d5a90d2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/d5a90d2)).

## Next

Crit 9 will add real-time updates, meeting-point details, an in-meetup notice
board, and check-in.
