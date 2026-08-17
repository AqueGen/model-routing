---
type: regex
target: last_message
pattern: 'intake[\s\S]*validation[\s\S]*pricing[\s\S]*discount[\s\S]*tax[\s\S]*deposit[\s\S]*payment[\s\S]*tips[\s\S]*fiscal[\s\S]*receipt[\s\S]*export[\s\S]*archive'
flags: 'i'
match: contains
---

All twelve stages, in the right order. The order is the answer: the stage names
are guessable from the directory listing alone, so an answer scored on the names
without the sequence would pass without anybody reading anything.

No file states the sequence. Each stage imports the next at the bottom of a few
hundred lines, so the chain has to be walked.
