# Staying up to date

Nothing updates itself here, and two separate things go stale. The marketplace catalog is refreshed only when you ask - `claude plugin marketplace update model-routing` - and your installed copy stays at its version until `claude plugin update model-routing` (or `/plugin update` in the terminal UI), which reinstalls from whatever the catalog currently holds. Run them in that order: `plugin update` against a stale catalog reinstalls the version you already have and looks like a no-op.

Because that is easy to forget, the plugin checks for a newer version at most once a day when a session starts fresh - a resumed or cleared session does not re-run the check - and shows a one-line notice when you are behind, carrying your version, the published one, both commands, and a link to the release notes. The check is a single fetch of the published manifest, fails silently offline, and never installs anything - updating stays your call.
