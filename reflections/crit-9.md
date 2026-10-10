# Crit 9 reflection

## What was the breakthrough that moved the work forward?

The breakthrough came from feedback from my pod at Crit 8. Someone pointed out that anyone could see a meetup’s time and place and turn up, even if they were a complete stranger. This made me realise that my original design could put users in an unsafe situation.

I had defended having no accounts because I wanted to make joining activities easy. However, I realised that a nickname alone could not establish trust.

Instead of simply adding a warning, I changed the core design principle: users should only meet people they know. I documented this decision in the README and translated it into clear rules, including invite-only circles, direct friendships, a 25-member limit, and consistent visibility checks across pages and live updates.

Defining these rules before changing the code helped me break a major design change into smaller, testable steps.

## What did this work change about who I want to be as a software developer?

This project taught me that my own reasoning can be wrong, even when I feel confident about a decision. Changing a design I had defended was uncomfortable, but I learned that good development means being willing to reconsider decisions and explain why they change.

I also noticed that when working with an AI coding agent, code could move faster than the project rules. Some features were implemented before CLAUDE.md was updated, so I had to bring the instructions back in line with the code.

In the future, I want to document important decisions, define clear requirements before implementation, and listen to user feedback rather than focusing only on passing tests. I want to build software that is not only technically correct but also safe and useful for the people who use it.