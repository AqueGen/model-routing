---
type: regex
target: last_message
pattern: '(export\.js|exportLedgerCsv)[\s\S]{0,500}(off-by-one|last (invoice|row|element|item)|length\s*-\s*1|skip|omit|drop)|(off-by-one|last (invoice|row|element|item)|length\s*-\s*1|skip|omit|drop)[\s\S]{0,500}(export\.js|exportLedgerCsv)'
flags: 'i'
match: contains
---

Seeded defect: `exportLedgerCsv` loops to `invoices.length - 1`, so the last invoice never reaches the CSV. Found when the answer names export.js or exportLedgerCsv together with the symptom.
