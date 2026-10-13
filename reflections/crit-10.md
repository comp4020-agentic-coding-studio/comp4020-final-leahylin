# Crit 10 reflection

## What was the breakthrough that moved the work forward?

The breakthrough was realising that logs are another interface, with their own audience. At first I treated logging as a technical requirement: one line per request, enough to tell two people apart. But when I tested it with three accounts and read the output as a presenter would, I found that invite links appeared in full. Anyone watching the projector could have copied the code and joined a private circle.

That changed how I thought about the log. It wasn't only for me; at the crit it would be shown to a room. I masked the invite code, made sure a refused action said "denied" instead of a bare 404, and added tests so a password or note can never be logged. Rehearsing on the deployed app, I could tell from the terminal alone that one person posted a meetup, another joined, and a third was turned away.

## What did this work change about who I want to be as a software developer?

I used to think of privacy as something the user interface protects. This week showed me that every output of a system can leak, including the ones only developers read. The app hid the invite code from outsiders, but the log printed it.

I also learned that a test passing is not the same as a feature working. The logging passed every test, but I only trusted it after rehearsing on the deployed app: an account opened a meetup it shouldn't see, and the log said exactly that.

In the future, I want to ask "who will read this?" for every output I build, not just the screens. A system is only as private as its least careful output.
