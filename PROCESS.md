# Process overview

*Crit 10 version. This file is rewritten at each crit.*

## From the brief to the harness

Buddy Up is an **activity buddy finder** for ANU students: someone you know
to run, play badminton, get coffee or try something else with this week.
"Good" lives in three places that are meant to agree: `README.md` argues
what good means, `CLAUDE.md` turns it into rules for the agent, and
`spec/` tests what can be tested against the running app. Crit 8 made
accounts, circles and friends part of good
([decision 4](docs/decisions/0004-accounts-circles-friends.md)); crit 9 made
it live and filled the gaps I found using it myself.

**Crit 10 asked for something the app couldn't do at all: be read from the
outside.** A presenter has to narrate what two pod members are doing in
separate browsers using only `flyctl logs`. Buddy Up had one startup line
and one crash handler. Nothing said who did what, or who was turned away.

The other half of the brief was already in place. What each person may see
and change is checked on the server for every read and write, and decision 4
says why: a meetup goes only to one circle or the host's friends, and only
its host can edit or call it off. Crit 10 had to make those checks visible.

The crit 9 session raised no feedback that called for a change, so this
round's work came from the crit 10 brief and from running the app for real
on crit day.

As before, I put the requirement into the harness before treating it as
done ([decision 6](docs/decisions/0006-action-logging.md), [`b44d5e2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/b44d5e2)).
`README.md` gained a judged question: *do the logs show who did what,
including denied actions?* `CLAUDE.md` extended "never log a password" to
note and reply text. Then the logging went in, one area at a time: one line
per request naming the actor ([`17f5f09`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/17f5f09)), then sign-up and login
([`efc706f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/efc706f)), circles and friends ([`baf06d2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/baf06d2)), and meetups
([`09f7c00`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/09f7c00)).

Two choices shaped the line. It is plain `key=value`, not JSON, because a
person reads it off a scrolling terminal mid-demo:
`actor=amy#12 action=join_meetup meetup=7 result=denied reason=full`.
And every outcome is written down, not just the status code, because many
routes always redirect: a friend request accepted and one declined both
answer 303, and the log is the only place that tells them apart.

## Agentic workflow

I kept the same arrangement as crit 9: the agent proposes, I decide, it
implements and tests, and nothing is committed until I say so.

**Directed.** The decisions with consequences were mine: logs a person can
read rather than a machine; stdout rather than a database table, since Fly
already keeps it; and no log line may carry a password, a note or a reply.
That last one is enforced, not promised: `format()` in `src/log.ts`
throws if a call site even names one of those fields. I also chose to keep
the meetup's response to an outsider unchanged (the same 404 as "doesn't
exist") while the log says plainly that they were refused
([`7daa380`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/7daa380)).

**Grounded.** Logging can't be seen over HTTP, so the app-facing tests
couldn't check it. Instead the agent ran a scripted session with three
accounts (a host, a member, an outsider), using a distinctive password,
note, place and circle name, and then searched the log for each one. None
appeared, while every line still named its actor, so the host, the member
and the outsider could be told apart at a glance. `spec/log.test.ts` now tests the pieces that can be tested
directly: masking, refusals, and the forbidden fields. All 97 tests pass.

I then rehearsed the crit on the deployed app with three accounts in
separate windows, reading only `flyctl logs`. The lines told the story on
their own: leah posted meetup 68, a friend request was accepted and the
other person's page refreshed within a third of a second, and anu, who was
in neither leah's circle nor her friends, opened meetup 68's URL and got
`status=404 action=view_meetup meetup=68 result=denied reason=not_visible`.
He saw a page that said nothing exists; the log said he was stopped.

Crit 9's live updates were also measured rather than assumed. Against the
deployed app, a signal arrived in about 17 ms but a page re-fetch took up
to 430 ms, so the delay meant to spread the load made the worst case about
1.8 seconds, over the brief's "about a second". It is now 60–500 ms, worst
case under a second ([`5c61df8`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/5c61df8)).

**Corrected.** Reading that scripted log exposed a leak: invite links
appeared in full (`path=/join/<code>`), and anyone who saw the code could
join the circle. Crit 10 puts the log on a projector. The path is now
`/join/[code]`, and the same commit made an outsider's refused attempt
show as `result=denied reason=not_visible` instead of a bare 404
([`7daa380`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/7daa380)).

Two older assumptions were also wrong. Decision 3 had set the app's stream
cap at 60 "to stay well clear" of Fly's limit without checking it; the
proxy's default was 20 connections, so it would have refused page loads
first. It now counts requests, with limits above the app's own
([`5ef92d0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/5ef92d0)). And the design pass had added Google Fonts without
recording it, a request every visitor's browser makes to a third party.
Writing it down showed that older browsers would send Google the full URL,
which can name a private meetup, so the app now sets a strict referrer
policy ([`307d845`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/307d845)).

## Stack

Node 24 runs TypeScript directly, with `node:sqlite` on a Fly volume and
plain server-rendered forms ([decision 1](docs/decisions/0001-stack.md)).
Crit 10 added no dependency: logging is `console.log` to stdout, which Fly
captures and `flyctl logs` tails live.

- **One process made logging simple.** Every request passes through one
  handler, so a single hook writes one line per request, and each route
  only adds what it decided. A mutating request is still one line.
- **Live updates are the exception.** An SSE stream finishes only when the
  browser disconnects, sometimes minutes later, so its subscribe or decline
  is logged immediately instead.
- **Scale-to-zero has a cost on the day.** For the crit 9 session I held
  one machine awake so the pod wouldn't watch a cold start
  ([`7196fed`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/7196fed)), then let it sleep again ([`294d804`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/294d804)). Every push to
  `main` deploys, so the app the pod sees is always the latest commit.
