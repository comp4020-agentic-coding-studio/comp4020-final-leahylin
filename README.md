# Buddy Up

Find someone to do the thing with, today.

An activity buddy is someone you know who's up for the same thing. No
planning, no pressure: one run, one game, one coffee. Pick running,
badminton, coffee or something you name, then join or start a meetup for
your circle or friends: *Tuesday 6pm, Black Mountain, 4 people, easy pace*.

## What good means here

A good buddy app shortens the gap between *I'd like a running buddy* and *I'm
at the start line*, with people you're glad to see. Meetups that happen count,
not sign-ups. Five commitments:

1. **Concrete:** an activity, time, place and head count. "Coffee sometime?"
   never happens.
2. **Near:** within seven days, on or around the ANU campus.
3. **One action to join or leave.** No approval, and nothing records
   leaving, so people back out instead of not turning up.
4. **A real head count.** Four never becomes five: badminton is doubles.
5. **Only people you know.** A meetup goes to one circle (at most 25, joined
   by link or 6-digit code) or the host's friends. Never public, never
   friends of friends.

## Who it's for

ANU students who know people but rarely make plans with them: classmates,
hallmates, club members. Also the showcase room, joined as one circle from
a code on screen.

## What I chose not to build

- **Public meetups or friends of friends:** how strangers come back.
- **Email or password reset:** a lost password means a new account.
- **Direct messages:** the point is to meet; notes are per meetup.
- **Profiles, followers, likes, ratings:** no auditions. Names are unique
  and fixed.
- **Search, maps, recommendations:** a list by time is enough.
- **Public lists of activities or friends:** you see an activity only
  through its meetups, and only you see your friends.

Crit 8 also excluded accounts and friend lists, until a pod member noted
that meeting a stranger alone is a real risk
([decision 4](docs/decisions/0004-accounts-circles-friends.md)).

## What persists and what doesn't

- **Accounts, circles and friends** stay until you leave or remove them.
- **Meetups and who joined** stay; finished ones join a short log:
  *3 Oct · Black Mountain · 4 came*.
- **Notes and replies** vanish two hours after the start.
- **Leaving** removes you completely: no "flaked" history.

## How good is checked

Tested in `spec/` against the running app:

- outsiders never see a meetup, its updates, or an activity's name
- a circle refuses a 26th member; ten wrong codes lock you out
- display names are unique, ignoring case, and never change
- passwords are never stored as typed
- a meetup missing time, place or head count, past, or over a week out is
  refused
- join and leave take one request each; a full meetup refuses one more,
  even with simultaneous requests
- an edit says exactly what changed
- changes reach open pages live; every page works without script
- notes are only for people going; quick replies are never counted
- check-ins show only a count, never who

Only judged:

- *Is joining quick?* I'll time my pod.
- *Does it feel light?* The crit will say.
- *Do meetups happen?* Check-ins count it.
- *Can a crit presenter tell two people apart, and see a denied action,
  from the logs alone?* The crit demo answers this directly
  ([decision 6](docs/decisions/0006-action-logging.md)).

## What I read and looked at

- Robin Sloan, [*An app can be a home-cooked meal*](https://www.robinsloan.com/notes/home-cooked-app/)
  (2020): software for a few people has its own standards of good.
- Clay Shirky, [*Situated Software*](https://gwern.net/doc/technology/2004-03-30-shirky-situatedsoftware.html)
  (2004): software for one group can lean on its context.
- Darius Kazemi, [*Run your own social*](https://runyourown.social/) (2019):
  a small social space is a choice, not a failure to scale.
- Meetup, Strava clubs, rednote "buddy" posts: the median answers.

## Status

Built: live meetups for circles and friends, notes, check-in, join codes,
and activities beyond the three
([decision 5](docs/decisions/0005-custom-activities.md)).
