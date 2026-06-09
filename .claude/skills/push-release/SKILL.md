---
name: push-release
description: Cut a release of ragmarket end-to-end. Commits any uncommitted feature work first (with an auto-generated conventional-commit message), bumps the app version (auto-detects patch vs minor; user must explicitly request major), updates CHANGELOG.md and README.md, commits the release, pushes to origin/main, and triggers the GitHub Actions release workflow. Invoke when the user says "push release", "release this", "/push-release", or similar. No confirmations — execute every step in order.
argument-hint: "[vX.Y.Z | major | minor | patch]"
allowed-tools: Read, Edit, Write, Bash, Grep, Glob
---

# Push Release

Cut a release. Run every step in order without asking for confirmation. If any step fails, stop and report what went wrong.

## Arguments

The skill accepts one optional argument:

| arg | behavior |
|---|---|
| (none) | Auto-detect bump type. Default is **patch**; bump **minor** if there's a new feature in the unreleased changes (see step 3). |
| `vX.Y.Z` | Use this exact version (also `vX.Y.Z-rcN` for prereleases). Must be strictly greater than the current version. |
| `major` | Force major (X.0.0). Only when the user explicitly says so. |
| `minor` | Force minor (0.X.0). |
| `patch` | Force patch (0.0.X). |

## What gets touched

Files updated in the release commit:
- `package.json` → `"version"` field
- `src-tauri/Cargo.toml` → `version = "..."` line under `[package]`
- `src-tauri/Cargo.lock` → auto-updated by `cargo check`
- `src-tauri/tauri.conf.json` → `"version"` field
- `README.md` → the `ragmarket-v<VERSION>-setup.exe` download link + filename, plus any other inline `v<old>` references in download/install sections
- `CHANGELOG.md` → new dated section + link footer

The release CI (`.github/workflows/release.yml`) verifies `package.json` and `Cargo.toml` match the requested tag, and extracts the GitHub release notes from the `## [<VERSION>]` section of `CHANGELOG.md` — so the version files must agree and that changelog section must exist.

## Steps

### 1. Determine the current version

Read `package.json`'s `.version`. That's the source of truth (the other three version files mirror it).

### 2. Commit any uncommitted work

Run `git status --porcelain`. If empty, skip to step 3.

If dirty, generate a conventional-commit message from the changes and land them in their own commit BEFORE the release commit — keeps history clean (feature work + release as separate commits) and ensures the bump-type detection in step 3 sees a real commit.

Inspect the changes:
- `git status -s` for the file list
- `git diff --stat HEAD` for size signal
- `git diff HEAD` (and any untracked-file contents) to infer the headline change

Choose a **type**: `feat` (new functionality / files), `fix` (only modifications, reads like bug fixes), `refactor` (structural, no behavior change), `docs` (docs/README/comments only).

Write a one-line subject (under 70 chars, imperative voice, no trailing period) followed by a blank line and a 2-4 sentence body explaining the WHY. Match the project's commit style — sample with `git log -5 --pretty=full --no-merges`, skipping `feat: ... (vX.Y.Z)` release commits.

Stage everything (`git add -A` is fine here — the pre-commit captures the full state of the work; the release commit later is the one that stays strict) and commit with the message plus the trailer:

```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

Pass the message via HEREDOC. If a pre-commit hook fails, fix the issue and create a NEW commit — do NOT `--amend` (the failing commit didn't land).

### 3. Determine the new version

If the argument is a valid `vX.Y.Z` (or `vX.Y.Z-rcN`), use it directly (refuse if not strictly greater than current) and skip to step 4.

If the argument is `major` / `minor` / `patch`, apply that bump.

Otherwise auto-detect:
- Find the last release tag: `git describe --tags --abbrev=0`.
- Get commits since then: `git log <tag>..HEAD --pretty=format:'%s'` — this now includes the pre-commit from step 2.
- If any commit subject starts with `feat`, OR `CHANGELOG.md`'s `[Unreleased]` section already has an `### Adicionado` sub-section with content → **minor**.
- Otherwise → **patch**.

### 4. Compute the new version

Standard semver. E.g. `0.6.0` + patch → `0.6.1`; + minor → `0.7.0`; + major → `1.0.0`.

### 5. Bump the four version files

Edit each to the new version. Be precise — use `Edit` with enough surrounding context that the replacement is unambiguous (don't hit other version-looking strings).

- `package.json`: the top-level `"version": "..."` line.
- `src-tauri/Cargo.toml`: the `version = "..."` line under `[package]` (NOT in `[dependencies]`).
- `src-tauri/tauri.conf.json`: the `"version": "..."` field.
- `README.md`: replace every occurrence of the OLD version. There's a download link/filename `ragmarket-v<OLD>-setup.exe` plus inline `v<OLD>` references nearby — replace them all. Grep first: `rg -n "v?\b<OLD>\b" README.md`.

### 6. Update CHANGELOG.md

Format is Keep a Changelog (pt-BR). The file already has `[Unreleased]` and prior version sections.

- Insert a new `## [<NEW>] - <YYYY-MM-DD>` section directly below `[Unreleased]`. Use today's date.
- Move any content from `[Unreleased]` into the new section. Leave `[Unreleased]` as a bare header with no content.
- Group entries into these sections, in this order, omitting empty ones: **Adicionado** (new features), **Alterado** (behavior changes), **Corrigido** (bug fixes), **Performance**, **Robustez** (defensive fixes not user-visible), **Segurança**.
- **If `[Unreleased]` was empty**: generate the content yourself from `git log <last-tag>..HEAD` subjects + the corresponding diffs. Write in pt-BR matching the existing 0.1.0 / 0.2.0 prose — specific, references files/components when relevant, no marketing tone, no emoji unless the section already uses it.
- Update the link footer: point `[Unreleased]` at `v<NEW>...HEAD`, and add a new `[<NEW>]: …/compare/v<prev>...v<NEW>` line above the existing ones.

### 7. Regenerate Cargo.lock

`cd src-tauri && cargo check --message-format=short 2>&1 | tail -5`. If the dev server holds the target binary lock ("file is being used by another process"), fall back to `cargo generate-lockfile`.

### 8. Commit

Stage exactly the touched files (don't `git add -A`):

```
git add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json CHANGELOG.md README.md
```

Commit subject: `feat: <one-line summary> (v<NEW>)` for feature releases, `fix: … (v<NEW>)` for patch releases. Body: 2-4 sentences (or a few bullet highlights) summarizing the headline changes from the changelog. End with the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer. Pass via HEREDOC.

### 9. Push

`git push origin main`.

### 10. Trigger the release workflow

`gh workflow run release.yml -f version=v<NEW>`. Add `-f prerelease=true` only for prerelease versions.

Briefly poll for the run: `gh run list --workflow=release.yml --limit 1 --json databaseId,url` and report the URL.

### 11. Report

Print three things:
- The new version (e.g. `v0.7.0`).
- The commit SHA (`git rev-parse --short HEAD`).
- The release workflow run URL.

Plus a one-line reminder: when CI finishes, `ragmarket-v<NEW>-setup.exe` and `SHA256SUMS.txt` will be on the GitHub release page.

## Don'ts

- Don't ask the user to confirm any step (including the pre-commit message — generate it and commit).
- Don't enter plan mode — this is an execution task.
- Don't run `npm test` or `npm run build` locally — the release CI handles validation. If the user wants tests, they'll ask separately.
- Don't touch files outside the six listed (under "What gets touched") **in the release commit at step 8**. The pre-commit at step 2 stages whatever the user had dirty — that's expected.
- Don't squash the pre-commit and release commits — they're intentionally separate so the history reads as "feature work" + "release".
- Don't push tags — the release workflow creates the tag from the input version.
- Don't change the working branch — releases always go out from `main`.

## Failure handling

- **Pre-commit hook fails on the step-2 feature commit**: fix the underlying issue (read the hook output), re-stage, and create a NEW commit. Do NOT `--amend` — the failing commit didn't land.
- **Version-bump edit ambiguous**: include more surrounding context in the `Edit` call and retry.
- **Cargo.lock regen fails because of file lock**: ask the user to stop `npm run tauri dev`, then retry. If that's not possible, use `cargo generate-lockfile` (skips the build script).
- **`gh workflow run` fails** (auth, not a repo, etc.): the commit+push already landed — print the manual fallback (`gh workflow run release.yml -f version=v<NEW>` or trigger from the GitHub UI).
