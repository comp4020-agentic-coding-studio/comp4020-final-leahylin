# Process overview

*Final version.*

## From the brief to the harness

The brief asks for a multi-user, real-time app that's good. I chose an **activity buddy finder** for ANU students: someone you know to run, play badminton, get coffee or try something else with this week. The agent warned early that this could easily turn into a small Meetup clone, so for Crit 8 I narrowed it to one campus, meetups within seven days, and no accounts.

Its definition of good came from a question I asked the agent: once people have agreed to meet, what actually gets them from the app to the meetup? Good became shortening the gap between wanting company and turning up: meetups that are concrete and near, one action to join or leave, a real head count, and an edit that says exactly what changed.

I connected that definition to the implementation through three documents. `README.md` is the argument ([`9a64a3e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/9a64a3e)), `CLAUDE.md` turns each commitment into a rule for the agent ([`7fba852`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/7fba852)), and `spec/` tests the rules that can be checked by sending real HTTP requests to the running app ([`ce1f84b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/ce1f84b)). For the final, `spec/README.md` maps each README claim to the tests that enforce it (100, all passing) and records how the judged questions were assessed and what came of them ([`d68b656`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/d68b656)).

## How good changed

**Crit 8 → 9: only people you know.** A pod member pointed out that anyone could see a meetup's time and place and turn up, even if the organiser didn't know them. My assumption that a low-friction app should not require accounts no longer held once I considered who could show up. I changed the harness first, before any code, rather than treating accounts and visibility checks as an unstructured bundle of features ([`095dfdf`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/095dfdf), [decision 4](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/blob/main/docs/decisions/0004-accounts-circles-friends.md)). I then guided the implementation through four tested steps covering accounts, circles capped at 25 members, direct friendships, and meetup visibility. The important change was not just adding login: it was making access rules part of the design and checking them as the app grew.

**Crit 9: using it myself.** Live updates use a simple “something changed” signal, with each page re-fetching its own data ([decision 3](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/blob/main/docs/decisions/0003-live-updates.md)). I tested the actual user flow rather than relying on passing route tests alone. This exposed two problems: friend requests didn't appear live ([`fbeff10`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/fbeff10)), and circles were difficult to reach on a phone ([`aa946c6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/aa946c6)). I directed the agent to trace the friend-request update flow and improve mobile navigation to circles, then tested the changes through the actual user flow.

**Crit 10: readable from the outside.** A presenter had to narrate the app using only `flyctl logs`, but Buddy Up had just one startup line. I directed the agent to make requests observable, resulting in one `key=value` log line per request that records who did what and how it ended ([decision 6](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/blob/main/docs/decisions/0006-action-logging.md)). Reading the logs as a presenter exposed a leak: invite links appeared in full on a screen intended for a projector. I then had them masked ([`7daa380`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/7daa380)).

**Final: people, not tests.** I gave three classmates a URL and a circle's code, then asked them to join its coffee meetup without help. Two finished in 45 and 60 seconds. The third stopped at 90 seconds, unsure what to do after joining the circle. Their ratings for how light it felt (1 = effortless, 5 = a chore) were 3, 4 and 2. The circle page showed invite tools and members but not upcoming activities, so I directed the agent to make the circle's meetups visible first ([`535d421`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/535d421), [`52bb3b4`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/52bb3b4)). A new classmate then completed the full flow in 50 seconds and rated it 1. This suggests the change may have helped, but one retest cannot prove that joining is easy for everyone.

## Agentic workflow

The agent proposes, I decide, it implements and tests, and nothing is committed until I approve it.

**Directed.** I used `CLAUDE.md` to set working rules, and decision records to document important choices. Claude could suggest solutions, but I remained responsible for deciding what to build and approving changes. For example, I decided an outsider sees the same 404 as "doesn't exist", while the log records the refusal.

**Grounded.** I asked Claude to inspect the existing code and constraints before making changes. I also used the test suite and checked the running app rather than relying only on its explanations. Measured on Fly, live updates took up to 1.8 seconds, so I had them cut to under a second ([`5c61df8`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/5c61df8)).

**Corrected.** At Crit 8, Claude built and committed the whole app at once under my name. I had it undo those changes. Since then, it has needed my approval before writing or committing.

## The readings

Robin Sloan's home-cooked app is made for a few people who already share a table. I agree that small software can have its own standard of good, and Buddy Up's is a meetup that happens, not growth. But Sloan's app needs no accounts because his users are his family. Mine began the same way, and Crit 8 showed that once the table holds more than one household, trust has to be built in.

Clay Shirky's situated software is shaped by the group it is made for. Buddy Up is built around ANU students: Canberra time, nearby places, a week-ahead horizon, and circles small enough for people to know each other. I agree with designing for a specific community rather than everyone, but fitting a context does not prove that a product works. Whether meetups actually happen depends on a real group using it over weeks, which a prototype tested in crits cannot establish.

Darius Kazemi argues that a small social space is a choice, not a failure to scale. I agree, and the 25-member cap, with no public meetups and no friends of friends, puts that choice into code. Where I differ is in how the space is kept safe. Kazemi emphasises people moderating their own community. I build safety rules into the code instead, checking visibility on every read and write and logging refusals, because a student project cannot rely on having someone constantly moderating it.

## Stack

Node 24 runs TypeScript directly, `node:sqlite` stores data on a Fly volume, and plain server-rendered forms work without JavaScript ([decision 1](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/blob/main/docs/decisions/0001-stack.md)). This kept the app small and avoided adding a frontend framework or a separate database service for a single-machine student project. Keeping the pages, access checks and live-update mechanism in one application also made the behaviour easier to inspect and test. Every push to `main` deploys.
