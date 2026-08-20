---
type: regex
target: last_message
pattern: 'retryable'
match: contains
---

Guards against a lucky number. There are only a few plausible answers to "how
many times", so one of them comes up by chance often enough to matter; an answer
that reaches 1 without ever mentioning `retryable` did not follow the chain from
`withRetryIntake` through `errorsValidation`, and got there some other way.
