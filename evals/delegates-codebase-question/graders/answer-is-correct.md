---
type: regex
target: last_message
pattern: 'refreshSession'
match: contains
---

Routing to a subagent is worthless if the answer comes back wrong, so the arms
are also scored on getting there. `refreshSession` in `src/auth/session.js` is
the only place the fixture extends a session; naming it is the whole answer.
