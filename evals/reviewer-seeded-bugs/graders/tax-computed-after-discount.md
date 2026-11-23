---
type: regex
target: last_message
pattern: '(totals\.js|computeTotals|taxFor|taxableSubtotal)[\s\S]{0,500}(after (the )?discount|before (the )?discount|pre-?discount|tax base|taxableSubtotal\s*-\s*discount|net of (the )?discount)|(after (the )?discount|before (the )?discount|pre-?discount|tax base|net of (the )?discount)[\s\S]{0,500}(totals\.js|computeTotals|taxFor)'
flags: 'i'
match: contains
---

Seeded defect: `computeTotals` now taxes `taxableSubtotal - discount`. README.md says tax is computed BEFORE the discount, on the full taxable subtotal.
