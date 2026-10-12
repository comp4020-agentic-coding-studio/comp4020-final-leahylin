# Process overview

*Crit 9 version. This file is rewritten at each crit.*

## From the brief to the harness

The brief asks for a multi-user, real-time app that's good. I chose an
**activity buddy finder** for ANU students: someone to run, play badminton,
get coffee, or try other activities with this week. The agent warned early that this could easily turn
into a small Meetup clone, so for crit 8 I narrowed it to one campus,
meetups within seven days, and no accounts.

I wrote "good" down in three places that are meant to agree:

- **`README.md`** is the argument: what good means and why ([`9a64a3e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/9a64a3e)).
- **`CLAUDE.md`** turns each commitment into a rule the agent must follow
  ([`7fba852`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/7fba852)).
- **`spec/`** tests the rules that can be checked, by sending real HTTP
  requests to the running app ([`ce1f84b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/ce1f84b)).

**The feedback from Crit 8 changed my definition of good in Crit 9.** A pod member pointed out that anyone could see a meetup's time and place and turn up. Someone could end up alone at a car park with a stranger. My `README.md` had argued that a light connection needs a light way in, so I had excluded accounts. But I hadn't accounted for who could turn up. Making it easy to join was not enough if I couldn't control who could see a meetup.

I changed what good meant in the harness before changing the code
([`095dfdf`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/095dfdf)). The `README.md` gained a fifth commitment, "only people
you know"; `CLAUDE.md` replaced "never add accounts" with rules about meetup visibility, circle size and password storage
([decision 4](docs/decisions/0004-accounts-circles-friends.md)). I then implemented the change in four tested steps: accounts ([`f99164a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/f99164a)), circles
([`a8e8f24`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/a8e8f24)), friends ([`6138339`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/6138339)), and meetup visibility ([`3765a4d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/3765a4d)). The remaining scope came from
[decision 2](docs/decisions/0002-crit9-scope.md): meeting points, live
updates, notes for attendees, and check-ins ([`be29e69`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/be29e69)).

## Agentic workflow

I used Claude as my main implementation partner, working in one long-running conversation against the repository. I didn't just describe the app and accept what it produced. I set the direction, gave it constraints to work within, and checked the results against both the code and the experience of using the app.

**Directed.** I made the product decisions; the agent helped implement them. During Crit 9, I used the app myself to identify problems that weren't obvious from reading the code: friend requests didn't update live, sharing long circle invitation links in person was awkward, duplicate names made it hard to tell who was attending, and important features were difficult to access on a phone.

I turned these observations into specific tasks: adding live updates ([`fbeff10`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/fbeff10)); adding join codes and QR codes to make circles easier to join ([`3f86d78`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/3f86d78), [`f631304`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/f631304)); making names unique and fixed ([`be42edd`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/be42edd)); improving access to friends and circles through a People page ([`aa946c6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/aa946c6)); guiding new users from an empty home screen ([`0741a07`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/0741a07)); and allowing users to create activities beyond the three built-in options ([decision 5](docs/decisions/0005-custom-activities.md), [`1cfbcfc`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/1cfbcfc)).

I kept the decisions with the biggest product consequences in my hands: who could see a meetup ([`3765a4d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/3765a4d)), whether friends-of-friends could participate, the 25-member circle limit ([`a8e8f24`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/a8e8f24)), and how shared activities were handled when meetups were cancelled ([`9b7d7ca`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/9b7d7ca)). The agent could suggest solutions and implement them, but I remained responsible for the trade-offs.

**Grounded.** I gave the agent repository-level guidance through `CLAUDE.md`, the decision records in `docs/decisions/`, and the test suite in `spec/`. Each served a different purpose: `CLAUDE.md` documented working rules, the decision records explained the reasoning behind key choices, and the tests checked observable behaviour through real HTTP requests.

Before making changes, I asked the agent to inspect the existing implementation and relevant constraints. I also checked the app on phone and laptop layouts and used two browsers to verify live updates ([`8a513d0`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/8a513d0)). The test suite covered permissions and edge cases, including competing attempts to take the last meetup spot and to add the 25th member to a full circle. This gave me independent ways to verify the results rather than relying solely on the agent's explanation.

**Corrected.** The workflow itself needed correction. At Crit 8, the agent implemented and committed everything in one go. I had it undo those changes ([`f38ad35...d5a90d2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/compare/f38ad35...d5a90d2)); since then, it has needed my approval before writing or committing changes.

I also found cases where the implementation got ahead of the specification ([`89c5d6d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/89c5d6d)), and where a change worked in isolation but broke the experience elsewhere. For example, cancelling a meetup initially returned the user to a page where the meetup card had disappeared, instead of showing the cancellation in context. I corrected this so the user stays on the page and the cancelled meetup appears struck through ([`b9e9daf`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/b9e9daf)). A permission test also exposed a 404-versus-403 mismatch. Rather than weakening the visibility rule, I corrected the test setup so the other user first joined the circle ([`3765a4d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/3765a4d)).

The main lesson was that a successful build wasn't enough. I needed to keep the requirements, tests, implementation, and actual user experience aligned—and correct the agent's workflow when it moved too quickly or made assumptions I hadn't approved.

## Stack

Node 24 runs TypeScript directly, with the built-in `node:sqlite` storing data on a Fly volume and plain server-rendered forms ([decision 1](docs/decisions/0001-stack.md)). The app fits within the 256 MB machine, and SQLite transactions enforce the hard rules: meetup headcounts, the 25-member circle limit, and posting only in places where you have permission. There are only two dependencies: `marked` for `/readme/` and `qrcode-generator`, because implementing QR error correction by hand is easy to get subtly wrong.

Crit 9 put these choices to the test:

- **Live updates.** Server-sent events run in the same process. The stream sends only a bare "something changed" signal, and each page re-fetches its content using the viewer's cookie ([decision 3](docs/decisions/0003-live-updates.md), [`19ac552`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/commit/19ac552)). This simplified the design in decision 4 because the stream itself carries no content. However, even a signal can reveal that something exists, so each topic is filtered according to what the viewer is authorised to know.
- **The cost.** An open stream keeps the Fly machine awake, limiting the savings from scale-to-zero to periods when nobody is connected.
- **Plain forms.** Every page remains usable with JavaScript disabled, and this is covered by tests. The trade-off is that visibility checks must be enforced consistently in my own code. To reduce the risk of missing a check, decision 4 uses a shared SQL fragment across queries and menus.

