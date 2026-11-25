# model-routing rules

- Every user-visible change to the plugin (a config key, a mode or rule, a refusal text, the band, a hook, an agent, a report) ships with its documentation on the site (`site/`) in the same PR: what it does, how to turn it on or off, defaults, and an example. A PR that changes behaviour without the matching page update is not done.
- Pages that need the update: `site/guides/configuration.md` (every config key and rule table), `site/guides/routing-modes.md` (modes, tags, band, redirect, fallback), and any guide or reference page whose text the change makes wrong. A new feature with no fitting page gets its own page and a sidebar entry in `site/.vitepress/config.mts`.
- Before merging, grep `site/` for the changed names and check every hit still matches the code.
