# Process overview

*Crit 9 version. This file is rewritten at each crit.*

## From the brief to the harness

The brief asks for a multi-user, real-time app that's good. I chose an
**activity buddy finder** for ANU students: someone to run, play badminton or
get coffee with this week. The agent warned early that this could easily turn
into a small Meetup clone. So for crit 8 I narrowed it to one campus,
meetups within seven days, and no accounts.

I wrote "good" down in three places that are meant to agree:

- **README.md** is the argument: what good means and why ([`9a64a3e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/9a64a3e)).
- **CLAUDE.md** turns each commitment into a rule the agent must follow
  ([`7fba852`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/7fba852)).
- **spec/** tests the rules that can be checked, by sending real HTTP
  requests to the running app ([`ce1f84b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/ce1f84b)).

**Crit 8 changed the argument.** A pod member pointed out that anyone could
see a meetup's time and place and turn up, so you could end up alone at a car
park with a stranger. My crit 8 README said a light connection needs a light
way in, so no accounts. That doesn't hold once the risk is who turns up,
because a nickname tells you nothing about them.

So I changed what good means, and I changed it in the harness first, before
any code ([`095dfdf`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/095dfdf)). The README gained a fifth commitment, "only people
you know". Accounts and friend lists came off "What I chose not to build".
CLAUDE.md swapped "never add accounts" for rules about who may see a meetup,
the circle size and password storage. The reasons and the options I turned
down are in [decision 4](docs/decisions/0004-accounts-circles-friends.md).
Then I built it in four steps, each with its own tests: accounts
([`f99164a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/f99164a)), circles ([`a8e8f24`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/a8e8f24)), friends ([`6138339`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/6138339)), and finally who
can see a meetup ([`3765a4d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/3765a4d)). A meetup now goes to one circle (at most 25
people) or to the host's direct friends, never further.

The rest of crit 9 came from [decision 2](docs/decisions/0002-crit9-scope.md),
where I gave each feature a boundary before building it: a meeting point,
live updates, a notice board for people going, and check-in ([`be29e69`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/be29e69)).

## Agentic workflow

I work with Claude in one long conversation. Its shell runs against the repo
on my machine. Three things happen throughout: I direct, the agent grounds its
work in real constraints, and mistakes get corrected, ideally in the harness.

**Directed.** The agent proposes options with trade-offs, and I choose. Some
calls I made this crit:

- both circles and friends; friends of friends never
- a circle cap of 25
- people who already joined a meetup keep seeing it after leaving the circle,
  so nobody loses the meeting point
- who a meetup is for can't change after posting
- emoji replies show by name and are never counted, because a count would be
  a like
- check-in stays open for one hour after the start

I also chose the look. The agent mocked up three visual directions and I
picked one ([`eef0c24`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/eef0c24)). When pages didn't match it, such as the notes
section or the signed-out home page, I pointed it out and we fixed them
([`f70bcaf`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/f70bcaf)).

**Grounded.** Before proposing anything, the agent reads `fly.toml` (256 MB,
one volume), the ADRs and `spec/`. Every change is checked against the
running app: 68 tests, including races for the last spot and for the 25th
place in a circle. For layout, the agent screenshots the real app at phone,
laptop and wide-screen sizes instead of guessing.

**Corrected.** Some corrections were about how we work:

- At crit 8 the agent built and committed everything at once. I had it undo
  that, and since then it asks before writing or committing
  ([`f38ad35...d5a90d2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/compare/f38ad35...d5a90d2)).
- It numbered the accounts decision 0003 without checking the folder, which
  already had a 0003. I caught it and it was renumbered.
- The notes and check-in code landed before CLAUDE.md had rules for them. I
  had the harness catch up: rules for check-ins ("never who"), notes ("only
  people going") and quick replies ("never counted") ([`89c5d6d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/89c5d6d)).

Others were caught by the tests, and the fix went where the mistake was:

- Joining and editing in the same millisecond hid an edit notice. The app now
  keeps events in order ([`c571c50`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/c571c50)).
- Limiting who can see a meetup made the "only the host can cancel" tests
  return 404 instead of 403. We didn't loosen the rule. We let the other
  person into the circle, so the test still checks "can see it, but isn't
  the host" ([`3765a4d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/3765a4d)).
- A test said a page must never contain "onerror". That failed because the
  page's own live-update script uses the word. The test now looks for the
  note's own marker ([`be29e69`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/be29e69)).

## Stack

Node 24 runs TypeScript directly, with the built-in `node:sqlite` on the Fly
volume and plain server-rendered forms. There's one dependency (`marked`, for
`/readme/`) ([decision 1](docs/decisions/0001-stack.md)). It fits the 256 MB
machine, and SQLite transactions are what make the hard rules hold: the head
count, the 25-person circle, and posting only to a circle you're in.

Crit 9 tested that choice:

- **Live updates** are server-sent events from the same process. The stream
  carries a bare "something changed" signal, and each page re-fetches itself
  under the viewer's own cookie ([decision 3](docs/decisions/0003-live-updates.md),
  [`19ac552`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/19ac552)). That made decision 4 easier, because the stream never holds
  content anyone could leak. Even so, a signal can reveal that a meetup
  exists, so it now only reaches people who can see the meetup.
- **The cost:** an open stream keeps the Fly machine awake, so the
  scale-to-zero saving only holds while nobody is looking.
- **Plain forms** mean every page still works with script off, which is
  tested. The price is that every visibility check is my code to get right.
  That's why decision 4's rule is written once, in one SQL fragment, and used
  by every query.

## Next

Deploy and check it with three real accounts. Then the crit 10 work: whatever
the crit 9 pod finds, the judged questions in the README (is joining quick,
does it feel light), and reading the check-in counts.
