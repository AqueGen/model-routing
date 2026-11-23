# Contribute

## Releasing (maintainer notes)

Releases are cut by [release-please](https://github.com/googleapis/release-please): conventional commits land on `main`, the bot keeps a release PR open that accumulates them, and merging that PR tags the release, publishes the GitHub release notes, and bumps `.claude-plugin/plugin.json`. Ground rules:

- `docs:` and `chore:` commits do not trigger a release - README and changelog-only work ships without a version bump, because a version bump asks every user to run a manual update.
- Merge the release PR when the accumulated changes are worth that manual update (a feature or a fix a user would notice), not on every commit.
- Before merging, open the release PR's `CHANGELOG.md` diff and add a one-sentence summary line under the new version header - release bodies that start with a bare bullet list read as truncated.

## License

MIT
