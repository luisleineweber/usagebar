# Releasing UsageBar

This repo treats a release as a tagged, reproducible build with matching version metadata, current release notes, and a verified artifact path.

The next stranger-facing milestone should be an alpha, not a full release, unless the installer, updater, provider setup, privacy/telemetry copy, error states, docs, feedback path, and recovery behavior have all been verified end to end.

Current alpha label:

```text
v0.1.0-alpha.2
```

If the repo stays on the existing beta line instead, document the reason in `CHANGELOG.md` and release notes before tagging.

## Preflight

Before cutting a tag:

```bash
bun run release:check -- --release-tag v0.1.0-alpha.2 --require-clean
```

The preflight currently verifies:

- `package.json`, [src-tauri/tauri.conf.json](../src-tauri/tauri.conf.json), and [src-tauri/Cargo.toml](../src-tauri/Cargo.toml) agree on the same version
- the release tag matches that version
- the Tauri product branding and updater endpoint still point at `UsageBar` and `luisleineweber/usagebar`
- [CHANGELOG.md](../CHANGELOG.md) contains a section for the version being released
- bundled plugins exist under `src-tauri/resources/bundled_plugins`

## Local Windows Artifact

Build the Windows installer locally before the first publish of a version:

```bash
bun run build:release -- --bundles nsis
```

If `TAURI_SIGNING_PRIVATE_KEY` is unset, the helper automatically adds `--no-sign` so local builds can still complete without Tauri updater signatures. Windows installer builds require Authenticode material by default. When that material is configured, the helper signs the final NSIS/MSI artifact after the build so the setup executable has a real publisher.

For disposable local smoke builds only, set `USAGEBAR_ALLOW_UNSIGNED_WINDOWS_INSTALLER=1`. Local artifacts without Windows Authenticode material can show `Unknown publisher`, can trigger Windows SmartScreen's "unrecognized app" warning, and should not be treated as public release candidates.

## Windows Code Signing

Windows release artifacts need two separate signatures:

- Tauri updater signatures: `TAURI_SIGNING_PRIVATE_KEY` and optional `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- Windows Authenticode signatures: `WINDOWS_CERTIFICATE_BASE64` plus `WINDOWS_CERTIFICATE_PASSWORD`, or an already-installed certificate selected by `WINDOWS_CERTIFICATE_THUMBPRINT`.

`src-tauri/tauri.conf.json` calls [scripts/sign-windows.ps1](../scripts/sign-windows.ps1) through Tauri's Windows `signCommand`. `scripts/build-release.mjs` also runs the same script over generated NSIS/MSI artifacts after local builds when Windows signing material exists. In CI, the script fails if no Authenticode signing material is configured. Locally, `build-release.mjs` blocks Windows installer builds without certificate material unless `USAGEBAR_ALLOW_UNSIGNED_WINDOWS_INSTALLER=1` is set.

Recommended GitHub secrets:

- `WINDOWS_CERTIFICATE_BASE64`: base64-encoded `.pfx` code-signing certificate.
- `WINDOWS_CERTIFICATE_PASSWORD`: `.pfx` export password.
- `WINDOWS_TIMESTAMP_URL`: optional timestamp server; defaults to `http://timestamp.digicert.com`.

SmartScreen note: Authenticode signing is necessary but not always sufficient. EV certificates usually get immediate SmartScreen reputation. OV certificates and new certificates can still warn until Microsoft has enough reputation for the certificate or submitted binary.

## GitHub Publish

The publish workflow lives in [.github/workflows/publish.yml](../.github/workflows/publish.yml).

You can publish in two ways:

1. Push a `v*` tag, for example `v0.1.0-alpha.2`
2. Trigger `Publish` manually with `workflow_dispatch` and provide `release_tag`

The workflow runs the same release preflight, builds platform artifacts, and verifies that the GitHub release contains:

- `latest.json`
- updater signature files (`.sig`)
- a Windows setup executable ending in `setup.exe`

The Windows job also fails before packaging if updater signing or Authenticode signing secrets are missing.

Current updater channel note:

- GitHub's `releases/latest` alias only resolves stable releases, not prereleases.
- UsageBar currently keeps updater checks disabled for prerelease app versions like `0.1.0-alpha.1` and `0.1.0-beta.7`.
- Re-enable prerelease auto-updates only after moving off the stable-only alias or after shipping a stable release channel.

## Alpha Gate

Before publishing Alpha 1, verify and record:

- Windows installer exists as a GitHub release asset or local NSIS artifact.
- Install, uninstall, config/data location, and first-run provider setup are documented.
- At least one supported provider works from a fresh setup path.
- Invalid credentials, offline/network failure, provider API failure, empty data, and refresh-in-progress states do not crash the app.
- README and release notes state privacy, telemetry, crash-log behavior, known limitations, and feedback/debug-info path.
- `CHANGELOG.md` includes the exact release version with supported features and known limitations.

Use the Alpha Gate bullets above for the final local artifact or GitHub release candidate before tagging. Historical Alpha 1 smoke evidence is archived at [alpha-smoke-test-0.1.0-alpha.1.md](archive/release/alpha-smoke-test-0.1.0-alpha.1.md).

Suggested Alpha 1 release-note shape:

```md
## UsageBar Alpha 1

This is a public alpha for Windows users who want to test UsageBar before a full release.

### Supported
- Windows NSIS installer
- Provider setup for ...
- Manual refresh
- Local settings storage

### Known limitations
- Some providers are experimental and may need manual cookie/API-key setup
- Some costs or usage buckets may be estimated or partial
- Prerelease updates may open GitHub Releases instead of installing in-app
- UI polish, crash recovery, and signed-build coverage are not final

### Privacy
UsageBar stores app settings and app-owned provider secrets locally under `%APPDATA%\com.sunstory.usagebar` on Windows. Provider secrets saved by UsageBar are encrypted with Windows DPAPI. Provider credentials and usage payloads are not intentionally sent to UsageBar-owned services.

### Feedback
Report bugs at https://github.com/luisleineweber/usagebar/issues/new and include app version, Windows version, provider, error text, timestamp, and sanitized logs. Do not include API keys, cookies, or raw credential files.
```

## Windows Data Locations

Use these paths in alpha support docs and bug reports:

- App data: `%APPDATA%\com.sunstory.usagebar`
- Logs: `%LOCALAPPDATA%\com.sunstory.usagebar\UsageBar.log` and rotated files under `%LOCALAPPDATA%\com.sunstory.usagebar\logs`
- Settings store: `%APPDATA%\com.sunstory.usagebar\settings.json` or `%APPDATA%\com.sunstory.usagebar\.store\settings.json`
- App-owned provider secrets: `%APPDATA%\com.sunstory.usagebar\provider-secrets.json`
- Legacy migration source: `%APPDATA%\com.sunstory.openusage`

Provider-specific local files such as CLI auth, IDE SQLite databases, browser cookies, or cloud SDK credentials must stay documented in the matching `docs/providers/*.md` page.

## Release Checklist

1. Update version metadata in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`
2. Add or refresh the matching `CHANGELOG.md` section
3. Run `bun run release:check -- --release-tag vX.Y.Z --require-clean`
4. Run `bun run build:release -- --bundles nsis`
5. Push the tag or trigger the publish workflow manually
6. Confirm the GitHub release has the expected assets
