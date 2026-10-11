# Crit 9 reflection

## What was the breakthrough that moved the work forward?

The breakthrough came from feedback from my pod at Crit 8. Someone pointed out that anyone could see a meetup’s time and place and turn up, even if they were a complete stranger.

I had defended having no accounts because I wanted to make joining activities easy. However, I realised that a nickname alone could not establish trust.

Instead of simply adding a warning, I changed the core design principle: users should only meet people they know. I documented this decision in the README and translated it into clear rules, including invite-only circles, direct friendships, a 25-member limit, and consistent visibility checks across pages and live updates.

Defining these rules before changing the code helped me turn a major design change into smaller, testable steps.

## What did this work change about who I want to be as a software developer?

This project taught me that my reasoning can be wrong, even when I feel confident about a decision. Changing a design I had defended was uncomfortable, but I learned that good development means being willing to reconsider decisions when new evidence challenges them.

I also realised that using an AI coding agent can make implementation faster without ensuring that the project stays consistent. Some features were implemented before CLAUDE.md was updated, and the README later drifted out of sync with the code. I had to bring the rules back into alignment. Testing the app myself also revealed problems that automated tests had missed, such as friend requests not updating live and circles being difficult to access on a phone.

In the future, I want to define requirements before implementation, keep documentation aligned with the code, and check the user experience rather than relying only on passing tests. I want to become a developer who questions their own assumptions and builds software that is not only technically correct but also safe and useful for its users.