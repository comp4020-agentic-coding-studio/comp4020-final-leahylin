# Buddy Up

**Find someone to do something with today.**

An activity buddy is someone you know who's up for the same thing. No big plans, no pressure. Choose running, badminton, coffee, or your own activity, then join or start a meetup with your circle or friends: *Tuesday, 6 pm · Black Mountain · 4 people · Easy pace*.

## What good means here

A good buddy app closes the gap between *I'd like a running buddy* and *I'm
at the start line*, with people you're glad to see. What matters is meetups happening, not sign-ups.

Five commitments:

1. **Concrete:** every meetup has an activity, time, place, head count.
2. **Near:** on or around ANU, within seven days.
3. **Easy to join or leave:** one action, no approval.
4. **Accurate:** head counts stay correct; badminton is doubles.
5. **People you know:** visible only to one circle (max 25) or the host's friends.

## Who it's for

ANU students who know people but rarely make plans with them: classmates, hallmates, club members.

## What I chose not to build

- **Public meetups or friends of friends:** brings strangers back.
- **Email or password reset:** lost password, new account.
- **Direct messages:** the goal is to meet; notes belong to the meetup.
- **Profiles, followers, likes, ratings:** no popularity contest.
- **Search, maps, recommendations:** a time-ordered list is enough.
- **Public activity or friend lists:** activities surface through meetups ([decision 5](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/blob/main/docs/decisions/0005-custom-activities.md)); friend lists stay private.

At Crit 8, I'd excluded accounts and friend lists to keep joining lightweight, until a pod member pointed out someone could end up alone with a stranger. Convenience before safety — so I added accounts, circles and friends ([decision 4](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/blob/main/docs/decisions/0004-accounts-circles-friends.md)).

## What persists and what doesn't

- **Accounts** stay; **circles and friends** remain until removed.
- **Meetups and attendance** persist; finished ones move into a short log: *3 Oct · Black Mountain · 4 came*.
- **Notes and replies** disappear two hours after the start.
- **Leaving** removes you without recording who backed out.

## How good is checked

Tested in `spec/` against the running app:

- Outsiders never see a meetup, its updates, or an activity's name.
- A circle rejects a 26th member; ten wrong codes lock you out.
- Display names are unique and never change.
- Passwords are never stored as typed.
- A vague, past, or over-a-week-out meetup is rejected.
- Join and leave take one request; a full meetup refuses one more, even in a race.
- Edits say exactly what changed.
- Open pages update live; every page works without JavaScript.
- Notes are only for people going; replies are never added up.
- Check-ins show only a count, never who.

Other questions need people, not tests ([what came of them](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/blob/main/spec/README.md#judged-readmes-questions-for-people-and-what-came-of-them)):

- *Is joining quick?* Most finished in 60 seconds or less.
- *Does it feel lightweight?* Rated 1 (very easy) in the retest.
- *Do meetups happen?* Not tested in real life yet.
- *Do logs show who did what, including denied actions?* Yes, tested in rehearsal. ([decision 6](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/blob/main/docs/decisions/0006-action-logging.md))

## What I read and looked at

- Robin Sloan, [*An app can be a home-cooked meal*](https://www.robinsloan.com/notes/home-cooked-app/)
  (2020): software for a few people has its own standards of good.
- Clay Shirky, [*Situated Software*](https://gwern.net/doc/technology/2004-03-30-shirky-situatedsoftware.html)
  (2004): software for one group can lean on its context.
- Darius Kazemi, [*Run your own social*](https://runyourown.social/) (2019):
  a small social space is a choice, not a scaling failure.
- Also compared: Meetup, Strava clubs, Rednote buddy posts.

The trade-off: make meeting up easy without turning a small, trusted community into a public network.