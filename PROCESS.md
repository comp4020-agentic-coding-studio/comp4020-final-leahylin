# Process overview

## Crit 8: from the brief to a live first version

### Choosing what to build

I started from a list of directions the agent suggested for a "small, good"
multi-user app: a slow shared canvas, a classroom question wall, a corridor
note wall, a shared sequencer. I picked none of them. I wanted something I'd
actually use, and that was **an activity buddy**: someone for running,
badminton or coffee. Most of the students around me find one through
Xiaohongshu posts or giant group chats. Both work badly for "tonight, near
here".

The agent's first warning was that "a buddy app" is exactly the median answer:
a mini Meetup. So the early work was narrowing it, and I made these calls:

- **One campus, near-term only.** A meetup starts within 7 days. That turned
  "what persists vs. expires" from an open question into a rule.
- **No accounts, DMs, profiles or ratings.** README "What I chose not to
  build" has the reasons.
- **What happens after people agree to meet.** I asked "so
  they've agreed, then what?" That's where most meetup apps go quiet. Of the
  options we discussed, I chose *meeting-point info plus an in-meetup notice
  board* (to actually find each other; this is also where real-time matters),
  and *check-in plus an activity log* (so the trace means something, and "did
  meetups happen" becomes countable). I chose against "people you ran with"
  lists because they pull the app toward being a social network.
- **Crit 8 scope:** host, join, leave, and it's still there when you come
  back. Nothing more.

### Good before code

The first commit after the template is the README and CLAUDE.md, with no app
code: [`b56f0c3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/b56f0c3). The four commitments in the README
(concrete, near, one-action join/leave, a real head count) became CLAUDE.md
rules and then tests in `spec/buddyup.test.ts`
([`fd8fab9`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/fd8fab9)), so each claim is either enforced by a test
or listed as judged.

### Stack

The decision record is [docs/decisions/0001-stack.md](docs/decisions/0001-stack.md):
Node 24 running TypeScript directly, built-in `node:sqlite` on the `/data`
volume, and server-rendered forms with no framework. In short, it fits 256 MB,
has one runtime dependency, and gives a real transaction for the head count.
The core loop is [`2b2ed75`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/2b2ed75).

### Directing, grounding, correcting

- **Directed:** I set the topic, the scope (one campus, 7 days), and the
  post-meetup direction. The agent proposed options and I chose among them.
- **Grounded:** constraints came from `fly.toml` (256 MB, one volume) and
  `spec/`, read before any code. The tests run against the actual running
  app, including a restart to check the data survives.
- **Corrected:** one of my tests was wrong at first. It asserted that the
  page never contains the word "left", which fails on "1 spot left". I
  narrowed it to wording that would record a person leaving.
  Running tests with the app's real output caught it.

### Next (crit 9)

Real-time updates over server-sent events (spots filling while you watch),
the meeting-point detail and in-meetup notice board, and check-in.
