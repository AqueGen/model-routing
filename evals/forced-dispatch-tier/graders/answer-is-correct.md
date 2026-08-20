---
type: regex
target: last_message
pattern: 'intake[\s\S]*validation[\s\S]*pricing[\s\S]*discount[\s\S]*tax[\s\S]*deposit[\s\S]*payment[\s\S]*tips[\s\S]*fiscal[\s\S]*receipt[\s\S]*export[\s\S]*archive'
flags: 'i'
match: contains
---

All twelve stages in the right order, same as the unforced case. It matters more
here: the main session never reads a file, so this scores whether the subagent's
tier is capable of the work, not just whether it is cheap. A tier that saves
money and gets the order wrong has saved nothing.
