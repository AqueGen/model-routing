---
type: regex
target: last_message
pattern: '(discount\.js|discountAmount)[\s\S]{0,500}(ceil|round(s|ed|ing)?\s+up|upward|half-up|roundMoney|rounding)|(ceil|round(s|ed|ing)?\s+up|upward)[\s\S]{0,500}(discount\.js|discountAmount)'
flags: 'i'
match: contains
---

Seeded defect: the percent discount went from `roundMoney` (half-up) to `Math.ceil`, which always rounds the discount up and breaks the half-up rule in README.md.
