# Process overview

*Crit 9 version. This file is rewritten at each crit.*

## From the brief to the harness

The brief asks for a multi-user, real-time app that's good. I chose an
**activity buddy finder** for ANU students: someone to run, play badminton or
get coffee with this week. The agent warned early that this could easily turn
into a small Meetup clone, so for crit 8 I narrowed it to one campus,
meetups within seven days, and no accounts.

I wrote "good" down in three places that are meant to agree:

- **README.md** is the argument: what good means and why ([`9a64a3e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/9a64a3e)).
- **CLAUDE.md** turns each commitment into a rule the agent must follow
  ([`7fba852`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/7fba852)).
- **spec/** tests the rules that can be checked, by sending real HTTP
  requests to the running app ([`ce1f84b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/ce1f84b)).

**Crit 9 changed the argument.** A pod member in crit 8 pointed out that anyone could
see a meetup's time and place and turn up, so you could end up alone at a car
park with a stranger. My README said a light connection needs a light way in,
so no accounts. That doesn't hold once the risk is who turns up.

So I changed what good means in the harness first, before any code
([`095dfdf`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/095dfdf)). The README gained a fifth commitment, "only people
you know"; CLAUDE.md swapped "never add accounts" for rules about who may see
a meetup, the circle size and password storage
([decision 4](docs/decisions/0004-accounts-circles-friends.md)). Then I built
it in four tested steps: accounts ([`f99164a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/f99164a)), circles
([`a8e8f24`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/a8e8f24)), friends ([`6138339`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/6138339)), and who can
see a meetup ([`3765a4d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/3765a4d)). The rest came from
[decision 2](docs/decisions/0002-crit9-scope.md): a meeting point, live
updates, notes for people going, and check-in ([`be29e69`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/be29e69)).

**Then I used it, and that drove the second half of crit 9.** Each change
came from something that felt wrong in my own hands:

- Friend requests didn't arrive live, so people and circles got their own
  live topics ([`fbeff10`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/fbeff10)).
- A link is awkward to share in a room, so circles also take a 6-digit code
  ([`3f86d78`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/3f86d78)) and show a QR code ([`f631304`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/f631304)).
- Two people called Leah, or a name that changes after you joined, means you
  can't be sure who's coming. Names are now unique and fixed
  ([`be42edd`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/be42edd)).
- On a phone, circles and friends were unreachable. They became one People
  page ([`aa946c6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/aa946c6)), and a new user's home says why they see
  nothing and how to fix it ([`0741a07`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/0741a07)).
- Three activities were too few. Anyone can now name another, but only
  people who can see one of its meetups see its name
  ([decision 5](docs/decisions/0005-custom-activities.md),
  [`1cfbcfc`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/1cfbcfc)).

## Agentic workflow

I work with Claude in one long conversation, its shell running against the
repo on my machine. Three things happen throughout: I direct, the agent
grounds its work in real constraints, and mistakes get corrected, ideally in
the harness.

**Directed.** The agent proposes options with trade-offs, and I choose. Some
calls this crit:

- both circles and friends; friends of friends never; a circle cap of 25
- who a meetup is for can't change after posting
- emoji replies show by name and are never counted, because a count would be
  a like
- join codes never expire; the owner resets them by hand
- no button to delete an activity, since its name is shared; one with only
  called-off meetups drops out of menus at once instead
  ([`9b7d7ca`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/9b7d7ca))

I also chose the look: the agent mocked up three directions and I picked one
([`eef0c24`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/eef0c24)). When a page didn't match, I sent a screenshot and
we fixed it, such as a People page leaving half a laptop screen empty
([`9bd73e1`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/9bd73e1)).

**Grounded.** Before proposing anything, the agent reads `fly.toml`
(256 MB, one volume), the ADRs and `spec/`. Every change is checked against
the running app, now 94 tests, including races for the last spot and the 25th
place in a circle. For layout it screenshots the real app at phone and laptop
sizes; for live updates it drives two browsers at once.

**Corrected.** Some corrections were about how we work:

- At crit 8 the agent built and committed everything at once. I had it undo
  that; since then it asks before writing or committing.
- It told me calling a meetup off already returned you to that card. It
  didn't: the card was gone. I had it check the code, and the fix keeps you
  on the page you were on and leaves the meetup listed, struck through
  ([`b9e9daf`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/b9e9daf)).
- Code ran ahead of the harness twice: notes and check-in before their
  CLAUDE.md rules ([`89c5d6d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/89c5d6d)), and later the README past 600
  words with decision 3 out of date. Both were caught up
  ([`779a43c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/779a43c), [`6f59790`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/6f59790)).

Others were caught by tests, and the fix went where the mistake was:

- Limiting who can see a meetup made "only the host can cancel" return 404
  instead of 403. We didn't loosen the rule; the test's other person joins
  the circle first ([`3765a4d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/3765a4d)).
- A test for a second person reusing an activity's name failed: SQLite 3.51
  dropped rows from a `WHERE EXISTS` query. It's a join now, and that test
  stays ([`1cfbcfc`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/1cfbcfc)).
- A new `.people` class collided with the attendee list and widened meetup
  pages; it was renamed ([`9bd73e1`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/9bd73e1)).

## Stack

Node 24 runs TypeScript directly, with the built-in `node:sqlite` on the Fly
volume and plain server-rendered forms ([decision 1](docs/decisions/0001-stack.md)).
It fits the 256 MB machine, and SQLite transactions are what make the hard
rules hold: the head count, the 25-person circle, posting only where you
belong. There are two dependencies: `marked` for `/readme/`, and
`qrcode-generator` since hand-writing QR error correction is easy to get
subtly wrong.

Crit 9 tested that choice:

- **Live updates** are server-sent events from the same process. The stream
  carries a bare "something changed" signal and each page re-fetches itself
  under the viewer's cookie ([decision 3](docs/decisions/0003-live-updates.md),
  [`19ac552`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/19ac552)). That made decision 4 easier, because the stream
  holds no content. A signal can still reveal that something exists, so every
  topic is filtered by who may know.
- **The cost:** an open stream keeps the Fly machine awake, so scale-to-zero
  only saves money while nobody is looking.
- **Plain forms** keep every page working with script off, which is tested.
  The price is that every visibility check is my code, so decision 4's rule
  is one SQL fragment used by every query, menus included.

## Next

Crit 10: what the pod finds, the judged questions in the README, and reading
the check-in counts.
