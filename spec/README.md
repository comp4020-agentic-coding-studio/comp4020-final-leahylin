# The spec

The [final project brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/)
and its spec are on the course website, along with the specs for crits 8, 9 and
10, which run in this repo. The brief poses the problem; the spec is the fixed
contract.

## What ships

`invariants.test.ts` checks the two things the course relies on:

- `/` answers with a 200, which is what the deploy and the crit capture read
- `/readme/` publishes `README.md`. Markdown renderers all differ slightly, so
  it checks the README's headings rather than every word: each one has to
  appear, in order, in the HTML the server sends, since no script runs. Render
  it however you like, as long as it's there in full; the marker reads it there.

Both run against the **running** app over HTTP, so they hold whatever it's built
with. In CI that app is the image your `Dockerfile` builds, started with a
throwaway `/data`, and a red run blocks the deploy. Locally, start the app
however you run it and `pnpm check` finds it at `APP_URL` (default
`http://localhost:8080`). Keep them; don't delete them.

## Your checks

Everything else in `spec/` is yours to write. Any `spec/*.test.ts` runs with
`pnpm check`, against the same running app. Some lines of a spec only a person
can judge; those are left to the crit and the marker.

At a crit, a green `check` job is half the shipped mark, but it's never the
judgement of the work: your tutor checks what you deployed against the published
spec.

## Enforced: README's checks, and the tests that hold them

Each line of README's "How good is checked" list, and where it's tested.
All of these run with `pnpm check` against the running app, except the one
marked as a unit test, which tests a module directly.

| README claim | Tested in |
| --- | --- |
| Outsiders cannot see meetups, updates or activity names | `buddyup.test.ts`: "audience", "live", "activities" ("never shows an activity, or its name…") |
| Circles reject a 26th member; ten wrong codes cause lockout | `buddyup.test.ts`: "circles" ("refuses a 26th member, even when several arrive at once", "refuses a wrong code, and locks you out after 10 wrong tries") |
| Display names are unique and fixed; passwords are hashed | `buddyup.test.ts`: "accounts" ("gives each display name to one person only, ignoring case", "never lets a display name change"); `auth.test.ts` (unit test): "stores a salted hash, never the password" |
| Past, over-a-week-out or vague meetups are rejected | `buddyup.test.ts`: "commitment 1", "commitment 2" |
| Joining is one request; capacity holds even in a race | `buddyup.test.ts`: "commitment 3", "commitment 4" ("lets exactly one of five simultaneous joiners take the last spot") |
| Edits identify what changed | `buddyup.test.ts`: "editing", "you're going to" |
| Pages update live and work without JavaScript | `buddyup.test.ts`: "live" ("tells an open meetup page that someone joined", "still works with the script off") |
| Notes are for attendees; check-ins reveal only a count | `buddyup.test.ts`: "notes", "check-in" ("opens at the start for people going, and only ever shows a number") |

The README no longer lists "quick replies are never added up", but the
"replies" tests still check it ("never adds quick replies up into a count").

The action log can't be read over HTTP, so `log.test.ts` (unit test) checks
it directly: an invite code is masked, someone turned away from what they
can't see is logged as denied, and a password or note can never be logged.

## Judged: README's questions for people, and what came of them

| Question | How it's assessed | Result |
| --- | --- | --- |
| Is joining quick? | Three classmates, each using a private window on their own device, were given the URL and a circle's 6-digit code and asked to join its coffee meetup without help. Timing started when they opened the URL and ended at "you're in". | Two of three completed the full flow: 45 s (laptop) and 60 s (phone). The third participant (phone) stopped at 90 s, unsure what to do after joining the circle. After the circle page was updated to list its meetups first ([`535d421`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/535d421)), a new classmate completed the full flow—from opening the URL to clicking "I'm in"—in 50 s on a laptop. This result is more directly comparable with the original full-flow timings, although it is based on only one participant. |
| Does it feel lightweight? | The same three classmates were asked: "On a scale of 1 to 5, how light or heavy did that feel? (1 = effortless, 5 = a chore)", and whether they were ever unsure what to do. | Scores 3, 4 and 2. In their words: "I was confused about what this app was for." "I wasn't sure how to join the circle and the coffee meetup." "I didn't know what to do next." Not yet light: the step after joining a circle is where it stalls. The retest scored 1, and said: "Now it is more visible what I need to do after join the circle." That's one person, so it suggests the step after joining is clearer, not yet that it's light for everyone. |
| Do meetups happen? | Over real use, compare meetups posted with meetups where someone checked in. | Not assessable yet. Buddy Up is a prototype with no real use beyond crits and rehearsals, so check-in counts don't mean anything. The mechanism is built and tested. |
| Are actions observable? | Narrate two or more people's actions from `flyctl logs` alone, without touching the app ([decision 6](../docs/decisions/0006-action-logging.md)). | Yes, in a rehearsal on the deployed app with three accounts: posting, joining, a friend request being accepted and an outsider opening a meetup they couldn't see (`result=denied reason=not_visible`) could all be told apart from the log. |
