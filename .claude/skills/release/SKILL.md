---
name: release
description: Cut a new Wavio release end to end — bump the version, sync the remote Android versionCode, write the release notes, build the three GitHub APKs, then commit, tag and publish the GitHub release once the user has tested on a device. Use when the user runs /release or asks to create, cut, ship, prepare or publish a new release or version of Wavio.
---

# Release

Cut a Wavio GitHub release. The workflow pauses at **checkpoints** (🛑) for things outside your reach: Crowdin, an interactive EAS prompt, the user's review, and testing on a real phone. At a checkpoint, say exactly what the user has to do, then stop and wait. Never skip one, and never work around one.

Below, `X.Y.Z` is the new version and `PREV` is the latest existing tag (e.g. `v1.4.0`). Run every command from the repo root unless it says otherwise.

## 1. Pick the version

```bash
node -p "require('./apps/mobile/app.json').expo.version"
git fetch --tags --quiet && git tag --sort=-v:refname | head -1
```

Use `AskUserQuestion` for the new version. Offer these choices, computed from the current version: minor bump (**default, recommended**, e.g. `1.4.0` → `1.5.0`), patch bump, and major bump. "Other" lets the user type their own. Reject anything that isn't `MAJOR.MINOR.PATCH`, or that is not higher than `PREV`.

## 2. Preflight

All of these must pass. If one fails, stop and report it. Don't fix it on your own.

```bash
git rev-parse --abbrev-ref HEAD   # must be: main
git status --porcelain            # must be empty (tmp/ is gitignored)
git pull --ff-only
gh auth status
bunx eas-cli@latest whoami
```

Then check whether translations are pending. Crowdin delivers translations as a PR from the `crowdin_translations` branch, titled "New Crowdin updates":

```bash
gh pr list --head crowdin_translations --state open --json number,title,url,updatedAt
LAST=$(git log -1 --format=%H --grep="New Crowdin updates")
git log --oneline "$LAST"..HEAD -- apps/mobile/i18n/en.json apps/landing/src/i18n/en.json
```

- If a Crowdin PR is **open**, warn the user and give them its URL.
- If `en.json` changed **after the last Crowdin merge**, warn that those strings have probably not been translated yet.

🛑 **Checkpoint: translations.** If either warning fired, ask the user to look at Crowdin and merge the PR, then wait. Merging it changes `main`, so pull again after. If the user decides to release without the pending translations, note it and continue.

## 3. Bump the version

Set `X.Y.Z` in exactly two places, and nowhere else (`apps/landing` has its own unrelated version):

- `apps/mobile/app.json` → `expo.version`
- `apps/mobile/package.json` → `version`

In `README.md`, between the `<!-- store-status:start -->` / `<!-- store-status:end -->` markers, set the **GitHub releases** row to `X.Y.Z`. Leave the Play Store row alone: a workflow updates it from the real store.

Then regenerate the native project. This also catches config-plugin errors before the long builds:

```bash
bun run mobile:prebuild:github
```

## 4. Sync the Android versionCode

`eas.json` sets `appVersionSource: "remote"`, so the versionCode lives on EAS. The `production-apk*` profiles don't auto-increment it.

```bash
cd apps/mobile && bunx eas-cli@latest build:version:get --platform android
```

Report the current value and propose current + 1.

🛑 **Checkpoint: versionCode.** `build:version:set` is interactive, so you can't answer its prompt. Ask the user to run this command themselves (in Claude Code, prefix it with `!`) and enter the proposed value:

```bash
cd apps/mobile && bunx eas-cli@latest build:version:set -p android -e production-apk
```

Once they confirm, run `build:version:get` again and check that it returns the new value.

## 5. Write the release notes

Write `tmp/RELEASE-X.Y.Z.md` at the repo root. Follow [RELEASE-NOTES.md](RELEASE-NOTES.md) for how to gather the changes and contributors, and for the format. If the file already exists, read it first. The user may have started a draft: build on it rather than overwriting it.

🛑 **Checkpoint: notes review.** Give the user the path and ask them to review the notes. Apply their edits before going on.

## 6. Build the APKs

The version bump stays **uncommitted** while you build and test. If a build fails or the device test finds a bug, the fix can then land on `main` before the release commit, never after it. The build scripts read the version from the working tree, so building before the commit is safe.

Run the three builds **one after another, never in parallel**: they share `apps/mobile/android/`. Each one is a local EAS build that takes several minutes, so run each in the background with a long timeout, and wait for it to finish before starting the next. Each build runs `prebuild:github` itself.

```bash
bun run mobile:build:android:production-apk          # → tmp/wavio-X.Y.Z-arm64-v8a.apk
bun run mobile:build:android:production-apk-armv7    # → tmp/wavio-X.Y.Z-armeabi-v7a.apk
bun run mobile:build:android:production-apk-x86_64   # → tmp/wavio-X.Y.Z-x86_64.apk
```

If a build fails, stop and show the end of its output. Don't retry with changed flags, and don't edit `android/`.

Once all three are done, check that the three files exist in `tmp/`. If `aapt2` is available (`$ANDROID_HOME/build-tools/*/aapt2`), confirm that each APK's `versionName` is `X.Y.Z` and its `versionCode` matches step 4:

```bash
aapt2 dump badging tmp/wavio-X.Y.Z-arm64-v8a.apk | head -1
```

🛑 **Checkpoint: device test.** Ask the user to install `tmp/wavio-X.Y.Z-arm64-v8a.apk` on a real device and test it. Wait for an explicit go-ahead.

**If a build fails or the test finds a bug**, fix it like this:

1. Commit the fix on its own. Stage only the files the fix touches, and leave the version bump in `app.json`, `package.json` and `README.md` unstaged.
2. If the fix is user-visible, add it to `tmp/RELEASE-X.Y.Z.md`.
3. Rebuild **all three** APKs, then repeat the device test.

The versionCode doesn't change: nothing has been published yet.

## 7. Commit, tag and push

This step is public and hard to undo. Before running it, confirm with the user once more.

```bash
git add apps/mobile/app.json apps/mobile/package.json README.md
git commit -m "release X.Y.Z"
git status --porcelain            # must be empty
git tag -a vX.Y.Z -m "Wavio vX.Y.Z"
git push origin main
git push --tags
```

Stage only those three files. The tag then points at the exact tree the APKs were built from. `git push --tags` alone doesn't move `main`, so push the release commit too.

## 8. Publish the GitHub release

```bash
gh release create vX.Y.Z \
  ./tmp/wavio-X.Y.Z-arm64-v8a.apk \
  ./tmp/wavio-X.Y.Z-armeabi-v7a.apk \
  ./tmp/wavio-X.Y.Z-x86_64.apk \
  --title "Wavio vX.Y.Z" \
  --notes-file tmp/RELEASE-X.Y.Z.md \
  --latest
```

## 9. Verify

```bash
gh release view vX.Y.Z
gh release view vX.Y.Z --json assets --jq '.assets[].name'
```

Check the title, the tag, that the release is not a draft or prerelease, that the notes rendered, and that exactly the three APKs are attached. Report the release URL.

Publishing the release triggers the store-status workflow, which refreshes the README table on its own. Releasing on the Play Store (`mobile:build:android:production`, then submit) is a separate flow, outside this skill.
