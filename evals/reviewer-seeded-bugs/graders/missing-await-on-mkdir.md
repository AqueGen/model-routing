---
type: regex
target: last_message
pattern: '(store\.js|saveSnapshot)[\s\S]{0,500}(await|unhandled|rejection|race|floating|not awaited|un-?awaited)|(await|unhandled|rejection|floating|not awaited|un-?awaited)[\s\S]{0,500}(store\.js|saveSnapshot|mkdir)'
flags: 'i'
match: contains
---

Seeded defect: `saveSnapshot` calls `mkdir` without `await`. `writeFile` can run before the directory exists, and a failing `mkdir` becomes an unhandled rejection.
