# Buddy Up

Find someone to do the thing with, today.

An activity buddy is someone to go running with, grab lunch with, or get a
coffee with. They are not a friend you have to keep up. You share one activity with them, and that's
the whole relationship. This app is for finding one.

You pick an interest (running, badminton or coffee), see what's on, and either
join a meetup or start one: *Tuesday 6pm, Black Mountain summit track, 4
people, easy pace*. Anyone who joins can see who else is coming.

This is version one (crit 8). It covers the core loop and nothing else.

## What good means here

A good buddy app makes the gap between *I'd like to go for a run with someone*
and *I'm at the start line with two people* as short as possible. It doesn't
matter how many people sign up or how long they stay on the page. What matters
is how many meetups actually happen.

That gives four commitments:

1. **Every meetup is concrete.** It has an activity, a time, a place and a
   head count. "Anyone keen for coffee sometime?" can't be posted here,
   because it's the kind of plan that never happens.
2. **Everything is near.** A meetup starts within the next seven days, and it
   happens on or around the ANU campus. A plan a month away isn't a buddy plan.
3. **Joining is one action, and so is leaving.** You don't apply, request,
   wait for approval or message anyone first. Leaving is just as easy, so
   people back out properly instead of silently not turning up. The spot goes
   back to someone else, and nothing records that you left.
4. **The head count is real.** A meetup for four never has five. The host
   picked that number for a reason: badminton is doubles, a coffee table
   seats four.

## Who it's for

ANU students who want company for something they'd do anyway. It's especially
for people who are new to Canberra, or whose friends don't run, or who would
rather not post "anyone?" in a 500-person group chat. The showcase room counts
too: a room full of people who could all be buddies for the next hour.

## What I chose not to build

- **Accounts.** You give a nickname and the app remembers you in this
  browser. An activity buddy is a light connection, so the way in should be light too.
- **Direct messages.** The point is to meet in person. Anything a group needs
  to say before it meets will be said where everyone in the meetup can see it
  (planned for crit 9).
- **Profiles, followers, likes, ratings.** Nobody gets scored. A rating after
  a coffee would turn a casual thing into an audition.
- **Search, maps, recommendations.** There's one campus and a few interests.
  A plain list sorted by start time is enough.
- **Friend lists or "people you ran with".** That would push the app toward
  being a social network, and the pressure that comes with one.

## What persists and what doesn't

- **Your nickname** stays with your browser for a year.
- **Meetups and who joined them** are kept. Upcoming meetups are the main
  page. Ones that have finished move into a short log under each interest,
  like a club's activity book: *3 Oct · Black Mountain · 4 ran*.
- **Leaving a meetup** removes you from it completely. There is no
  "left" or "flaked" history.

## How good is checked

Some of this can be tested, and `spec/` tests it against the running app:

- a meetup without a time, place or head count is refused (commitment 1)
- a meetup in the past, or more than seven days ahead, is refused
  (commitment 2)
- joining and leaving each take a single request, and leaving frees the spot
  (commitment 3)
- a full meetup refuses one more person, even when requests arrive together
  (commitment 4)
- when the host edits a meetup, it says exactly what changed (time changed,
  place changed, head count changed, note changed), and nothing that didn't
- a meetup and its people are still there on a fresh visit (persistence)

Some can only be judged:

- *Is it actually quick to go from opening the app to having joined?* I'm
  judging this by watching people in my pod try it, and timing it.
- *Does the app feel light?* Can you join a coffee with strangers without it
  feeling like a commitment? This one is for the crit to tell me.
- *Do meetups happen?* The app can't know yet. Crit 9 plans to add a check-in
  at the meetup, which turns this into a number I can count.

## What I read and looked at

- Robin Sloan, [*An app can be a home-cooked meal*](https://www.robinsloan.com/notes/home-cooked-app/)
  (2020). Software made for a handful of specific people can be good by
  standards that would make no sense for a product.
- Clay Shirky, [*Situated Software*](https://gwern.net/doc/technology/2004-03-30-shirky-situatedsoftware.html)
  (2004). Software built for one group, in one place, can lean on the social
  context it lives in instead of rebuilding it. Here that context is the
  campus and the fact that everyone is a student.
- Darius Kazemi, [*Run your own social*](https://runyourown.social/) (2019).
  A small, deliberately limited social space is a choice and not a failure to
  scale.
- Meetup, Strava clubs, and "looking for a buddy" posts on Xiaohongshu (RedNote). These
  are the median answers. Meetup is built for organisers planning weeks out.
  Strava is built around your stats. RedNote posts are an open call to the
  whole internet. I wanted the opposite of each: near, numberless, local.

## Status

Crit 8: you can pick an interest, start a meetup, join one, leave one, and
find all of it still there when you come back. Real-time updates, the
in-meetup notice board, the meeting-point detail and check-ins come next.
