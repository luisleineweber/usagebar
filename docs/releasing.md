# Releasing UsageBar

This repo treats a release as a tagged, reproducible build with matching version metadata, current release notes, and a verified artifact path.

Current release:

```text
v0.2.1
```

The published v0.2.0 base is commit `75697e838a2df805fa565d512f4325e4a39c84b6`. The local `v0.2.0` tag points to unrelated upstream history. The local `v0.2.1` tag also points to unrelated upstream history, at `0aff5a36` (`chore: bump version to 0.2.1`), which is not an ancestor of `origin/main`. Do not use, delete, or move either local tag for this release.

## Preflight

Before cutting a tag:

```bash
bun run bundle:plugins
bun run release:check -- --release-tag v0.2.1 --require-clean
```

During metadata preparation, omit `--require-clean`. Run it again with that flag on the final committed candidate. A preflight pass does not prove installer or update behavior. No signing secrets are needed for this check.

The preflight currently verifies:

- `package.json`, [src-tauri/tauri.conf.json](../src-tauri/tauri.conf.json), and [src-tauri/Cargo.toml](../src-tauri/Cargo.toml) agree on the same version
- the release tag matches that version
- the Tauri product branding is `UsageBar`
- the stable build reads the `updater` channel and [src-tauri/tauri.prerelease.conf.json](../src-tauri/tauri.prerelease.conf.json) points prerelease builds at the `updater-prerelease` channel
- the updater public key keeps key ID `1172A2A8FDB20C1F`, which signed every published release
- [CHANGELOG.md](../CHANGELOG.md) contains a section for the version being released
- bundled plugins exist under `src-tauri/resources/bundled_plugins`

## Local Windows Artifact

Build the Windows installer locally before the first publish of a version:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content .\usagebar.key -Raw
$env:USAGEBAR_ALLOW_UNSIGNED_WINDOWS_INSTALLER = "1"
bun run build:release -- --bundles nsis
```

Release builds require `TAURI_SIGNING_PRIVATE_KEY`. Pass `--no-sign` only for an explicit local installer smoke build that will not support in-app updates. Local Windows builds need an explicit unsigned-build opt-in when no Authenticode material exists. GitHub publishes set this option automatically. Unsigned artifacts can show `Unknown publisher` and can trigger Windows SmartScreen's "unrecognized app" warning.

## Windows Code Signing

Windows release artifacts support two separate signatures:

- Tauri updater signatures: `TAURI_SIGNING_PRIVATE_KEY` and optional `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- Windows Authenticode signatures: `WINDOWS_CERTIFICATE_BASE64` plus `WINDOWS_CERTIFICATE_PASSWORD`, or an already-installed certificate selected by `WINDOWS_CERTIFICATE_THUMBPRINT`.

`src-tauri/tauri.conf.json` calls [scripts/sign-windows.ps1](../scripts/sign-windows.ps1) through Tauri's Windows `signCommand`. `scripts/build-release.mjs` also runs the script over generated NSIS/MSI artifacts after local builds when Windows signing material exists. GitHub publishes set `USAGEBAR_ALLOW_UNSIGNED_WINDOWS_INSTALLER=1`. Local unsigned builds must set it explicitly.

Optional GitHub secrets:

- `WINDOWS_CERTIFICATE_BASE64`: base64-encoded `.pfx` code-signing certificate.
- `WINDOWS_CERTIFICATE_PASSWORD`: `.pfx` export password.
- `WINDOWS_TIMESTAMP_URL`: optional timestamp server; defaults to `http://timestamp.digicert.com`.

SmartScreen note: Authenticode signing is necessary but not always sufficient. EV certificates usually get immediate SmartScreen reputation. OV certificates and new certificates can still warn until Microsoft has enough reputation for the certificate or submitted binary.

## Stable Release Gate

Authenticode is not a stable-release gate while the project has no Windows code-signing certificate. Stable releases still require signed Tauri updater metadata.

Create a version-specific installer smoke-test record for the combined final v0.2.1 candidate. Identify the exact installer by SHA-256, signature state, source commit, and release URL when available. Record install, launch, update, CLI, and uninstall results from that artifact. Historical records do not satisfy this gate. Release notes must state that `Unknown publisher` and SmartScreen warnings can occur.

## GitHub Publish

The publish workflow lives in [.github/workflows/publish.yml](../.github/workflows/publish.yml).

Push the verified final commit explicitly to the remote release tag: `git push origin <final-sha>:refs/tags/v0.2.1`. Replace `<final-sha>` with the full verified final commit SHA. Never push the local `v0.2.1` tag.

Verify the remote tag target with `git ls-remote --tags origin v0.2.1`. It must match the verified final commit SHA. If the remote tag already points elsewhere, stop and resolve the conflict before publishing. Do not force-push a release tag.

The workflow runs the same release preflight, builds platform artifacts, and verifies that the GitHub release contains:

- a Windows setup executable ending in `setup.exe`

All published releases require `TAURI_SIGNING_PRIVATE_KEY`, `latest.json`, and updater signature assets. All releases allow an unsigned Windows installer while Authenticode signing remains unavailable.

The release workflow copies the signed `latest.json` from each versioned release to fixed channel releases. The app reads its channel, downloads first, and installs only after you select `Restart to update`.

Current updater channel:

- GitHub's `releases/latest` alias does not resolve prereleases.
- Stable releases update both the `updater` and `updater-prerelease` channels.
- Prereleases update only the `updater-prerelease` channel, so stable installs never receive a prerelease.
- Prerelease builds use `--config src-tauri/tauri.prerelease.conf.json`; [scripts/updater-channel.mjs](../scripts/updater-channel.mjs) selects the channel from the release tag.
- Both channel releases stay GitHub prereleases so `releases/latest` still resolves to the newest stable release. v0.1.1 installs read that alias.
- Do not rotate the updater key. Installed builds reject updates signed with another key.

## Release Gate

Before publishing v0.2.1, verify and record on the combined final candidate:

- Windows installer exists as a GitHub release asset or local NSIS artifact.
- If the installer is unsigned, release notes must say `Unknown publisher` / SmartScreen warnings are expected for this technical preview.
- Install, uninstall, config/data location, and first-run provider setup are documented.
- At least one supported provider works from a fresh setup path.
- Invalid credentials, offline/network failure, provider API failure, empty data, and refresh-in-progress states do not crash the app.
- README and release notes state privacy, telemetry, crash-log behavior, known limitations, and feedback/debug-info path.
- `CHANGELOG.md` includes the exact release version with supported features and known limitations.

Use the release gate above for the final local artifact or GitHub release candidate before tagging. Also complete these pending checks; do not record a pass until the check has run:

- Install, launch, CLI, and uninstall checks in a disposable Windows test environment.
- Signed in-app update from the actual published v0.2.0 build to the exact final candidate, with settings and provider data preserved.
- SQLite runtime checks for provider reads and usage history, including existing data, after the rusqlite upgrade.
- Claude checks on the combined final candidate: usage holds keep HTTP 429 visible; refresh holds skip token refresh but allow OAuth usage with a valid access token; expired or missing tokens keep a refresh hold visible as HTTP 429. Both OAuth holds block shared web cookie reads and web requests. Check separate usage, refresh, and web deadlines, managed profile selection, credential source isolation, escaped organization IDs, and an unknown (`null`) web subscription plan.
- Required CI and dependency audits on the combined final source.

The v0.2.1 change set includes all PRs merged to main from #26 through #45.

Metadata preparation does not complete these checks. Do not install or uninstall apps, or change user data, as part of metadata preparation.

Historical Alpha 1 smoke evidence is archived at [alpha-smoke-test-0.1.0-alpha.1.md](archive/release/alpha-smoke-test-0.1.0-alpha.1.md).

## Windows Data Locations

Use these paths in support docs and bug reports:

- App data: `%APPDATA%\com.sunstory.usagebar`
- Logs: `%LOCALAPPDATA%\com.sunstory.usagebar\UsageBar.log` and rotated files under `%LOCALAPPDATA%\com.sunstory.usagebar\logs`
- Settings store: `%APPDATA%\com.sunstory.usagebar\settings.json` or `%APPDATA%\com.sunstory.usagebar\.store\settings.json`
- App-owned provider secrets: `%APPDATA%\com.sunstory.usagebar\provider-secrets.json`
- Legacy migration source: `%APPDATA%\com.sunstory.openusage`

Provider-specific local files such as CLI auth, IDE SQLite databases, browser cookies, or cloud SDK credentials must stay documented in the matching `docs/providers/*.md` page.

## Release Checklist

1. Update version metadata in `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and the UsageBar package entry in `src-tauri/Cargo.lock`
2. Add or refresh the matching `CHANGELOG.md` section
3. Run `bun run bundle:plugins`, then `bun run release:check -- --release-tag vX.Y.Z --require-clean`
4. Run `bun run build:release -- --bundles nsis`
5. Push the verified final commit explicitly to the remote tag as described above; verify the remote tag target
6. Confirm the GitHub release has the expected assets
