# How memory works

## Facts
1. **Save**: every message is stored; images get a short description incl. what they're used for.
2. **Bundle**: once a channel is quiet (~2 s), the new messages of one conversation are grouped.
3. **Context**: add the earlier conversation, replied-to messages (with author) and the reactions after.
4. **Extract**: a cheap AI writes down lasting facts about people, each with an exact quote.
5. **Check**: the code drops jokes, plans, temporary stuff, low-confidence facts and anything without a real quote.
6. **Store**: the fact is saved with a link to its message. Newer statements replace older ones; facts never expire.

## Profiles
1. A person gets a new fact → their profile is marked for an update.
2. Every few minutes, marked profiles are rewritten (max. once per 30 min per person).
3. Input: their facts, last 150 messages (incl. images) and the old profile.
4. Output: 150–250 words on who they are, personality, how they talk, interests and reputation.

## Replying
- The target's profile is added as background.
- Roasts get up to 2 facts about the target; other replies only get facts that match the topic.
- The bot can look up more facts, old messages or a fact's source itself.
