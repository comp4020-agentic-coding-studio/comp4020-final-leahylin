# Buddy Up

**Find someone to do something with today.**

An activity buddy is someone you know who's up for the same thing. Choose running, badminton, coffee or your own activity, then join or start a meetup with your circle or friends: *Tuesday, 6 pm · Black Mountain · 4 people · Easy pace*.

## How to test

Use two Chrome profiles:

1. **Accounts:** register one account per profile.
2. **Multi-user:** in A, create a circle and share its join code; join it in B. Or add each other as friends by username.
3. **Meetup:** in A, create a meetup for the circle or friends. In B, open it and join.
4. **Real-time:** keep it open side by side. Leave and rejoin in B and watch A update live.
5. **Persistence:** refresh both. Everything should remain.

## What good means here

A good buddy app closes the gap between *I'd like a running buddy* and *I'm at the start line*, with people you're glad to see. What matters is meetups happening, not sign-ups.

1. **Concrete:** every meetup has an activity, time, place and head count.
2. **Near:** on or around ANU, within seven days.
3. **Easy:** join or leave in one action, without approval.
4. **Accurate:** head counts stay correct; badminton is doubles.
5. **Trusted:** meetups are visible only to one circle (max 25) or the host's friends.

## Who it's for

ANU students who know people but rarely make plans: classmates, hallmates and club members.

## What I chose not to build

- **Public meetups or friends of friends:** brings strangers back.
- **Email or password reset:** lost password means a new account.
- **Direct messages:** notes belong to the meetup.
- **Profiles, followers, likes or ratings:** no popularity contest.
- **Search, maps or recommendations:** a time-ordered list is enough.
- **Public activity or friend lists:** activities surface through meetups ([decision 5](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/blob/main/docs/decisions/0005-custom-activities.md)); friend lists stay private.

At Crit 8, I'd excluded accounts and friends to keep joining lightweight. A pod member pointed out someone could end up alone with a stranger, so I added accounts, circles and friends ([decision 4](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/blob/main/docs/decisions/0004-accounts-circles-friends.md)).

## What persists and what doesn't

- **Accounts** stay; **circles and friends** remain until removed.
- **Meetups and attendance** persist; finished meetups log briefly.
- **Notes and replies** disappear two hours after the start.
- **Leaving** removes attendance without recording who backed out.

## How good is checked

Automated tests in `spec/` check that:

- Outsiders cannot see meetups, updates or activity names.
- Circles reject a 26th member; ten wrong codes cause lockout.
- Display names are unique and fixed; passwords are hashed.
- Past, over-a-week-out or vague meetups are rejected.
- Joining is one request; capacity holds even in a race.
- Edits identify what changed.
- Pages update live and work without JavaScript.
- Notes are for attendees; check-ins reveal only a count.

Some questions need people, not tests ([results](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/blob/main/spec/README.md#judged-readmes-questions-for-people-and-what-came-of-them)):

- *Is joining quick?* Most finished within 60 seconds.
- *Does it feel lightweight?* Rated 1 (very easy) in the retest.
- *Do meetups happen?* Not tested in real life.
- *Are actions observable?* Logs showed actions and denials in rehearsal ([decision 6](https://github.com/comp4020-agentic-coding-studio/comp4020-final-leahylin/blob/main/docs/decisions/0006-action-logging.md)).

## What I read and looked at

- Robin Sloan, [*An app can be a home-cooked meal*](https://www.robinsloan.com/notes/home-cooked-app/) (2020): software for a few people has its own standards.
- Clay Shirky, [*Situated Software*](https://gwern.net/doc/technology/2004-03-30-shirky-situatedsoftware.html) (2004): software can lean on a group's context.
- Darius Kazemi, [*Run your own social*](https://runyourown.social/) (2019): small social spaces are a choice, not a failure.

The trade-off: make meeting up easy without turning a small, trusted community into a public network.
