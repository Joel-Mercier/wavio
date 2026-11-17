# Writing the release notes

Before writing, read the previous notes (`tmp/RELEASE-*.md`, newest first) and the last published release (`gh release view PREV --json body --jq .body`). Match their tone, structure and level of detail.

## Gather

```bash
REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
OWNER=$(gh repo view --json owner --jq .owner.login)
SINCE=$(git log -1 --format=%cI PREV)

git log --no-merges --format='%h %s%n%b' PREV..HEAD
gh pr list --state merged --search "merged:>=$SINCE" --limit 200 --json number,title,author,url
```

- **Issues:** collect every `#NNN` mentioned in the commits and PRs. Run `gh issue view NNN --json title,author,url` on each one to get its title and who opened it.
- **Contributors:**
  - External PR authors, i.e. anyone other than `$OWNER` and bots (`*[bot]`, `app/*`, Crowdin, Dependabot, Renovate). They are credited first.
  - The people who opened the issues this release fixes or implements. Group each person's issues on one line.
  - The Crowdin translators, credited as a group. List the languages from `apps/mobile/i18n/*.json`.

Skip noise:
- chore commits (Crowdin badge refreshes, lockfile churn)
- reverts that cancel each other out
- internal refactors with no user-visible effect, unless they produce a measurable gain (performance, size). In that case, describe the gain.

## Write

Write for **users**, not developers. Say what changed for them and why it matters. Don't name files, functions or stores. Put the feature name in **bold** in each bullet. Link issues and PRs as `[#NNN](https://github.com/$REPO/issues/NNN)` (or `/pull/NNN`). Expand `$REPO` to the real value: the file must contain literal URLs.

Nest related bullets under a short heading bullet (for example "Smart playlists:" or "Local, SMB and WebDAV libraries:"), as the previous notes do.

## Format

```markdown
## What's changed

### Features
- ...

### Improvements
- ...

### Fixes
- Fixed ...

## Contributors

Thanks to **@external-pr-author** for ... ([#NNN](...)) — and to everyone whose issues shaped this release:

- @handle — what their issues led to ([#NNN](...), [#MMM](...))
- The [Crowdin](https://crowdin.com/project/wavio) translators, for keeping <languages> up to date across the app and the website

Want to help? Translations are open on [Crowdin](https://crowdin.com/project/wavio), and the development setup is documented in the [README](https://github.com/$REPO#development).

## Install

<Copy this section from the previous notes. Change only the version in the filenames, and list exactly the three APKs this release attaches: arm64-v8a (64-bit phones; the one to try first), armeabi-v7a (32-bit), and x86_64 (Chromebooks, FydeOS, Android-x86 tablets). Keep the Play Store recommendation, the Sentry notice and the README link.>
```

Leave out any section that would be empty. If there were no external PRs, drop the "Thanks to …" sentence and start the contributors section with the issue reporters.
