# Changelog

## Unreleased

- Release automation: pushing a `v*` tag creates the GitHub release with
  notes from the matching CHANGELOG section.
- CI badge in README.

## 0.2.0 - 2026-07-07

- SessionStart hook: the routing anchor is now auto-injected into every
  session - zero config, no CLAUDE.md snippet required.
- New `scout` agent (sonnet): read-only codebase exploration; conclusions
  and file:line refs return, file dumps stay out of the main session.
- CI: GitHub Actions workflow validating JSON manifests and agent/skill
  frontmatter on every push.

## 0.1.0 - 2026-07-07

- Initial release: `test-runner` (haiku), `e2e-runner` (sonnet),
  `implementer` (opus), `reviewer` (opus) agents + the `model-routing`
  skill with the tier routing table.
