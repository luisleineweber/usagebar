# Releasing UsageBar

This repo treats a release as a tagged, reproducible build with matching version metadata, current release notes, and a verified artifact path.

## Preflight

Before cutting a tag:

```bash
bun run release:check -- --release-tag v0.1.0-beta.2 --require-clean
```

The preflight currently verifies:

- `package.json`, [src-tauri/tauri.conf.json](../src-tauri/tauri.conf.json), and [src-tauri/Cargo.toml](../src-tauri/Cargo.toml) agree on the same version
- the release tag matches that version
- the Tauri product branding and updater endpoint still point at `UsageBar` and `Loues000/usagebar`
- [CHANGELOG.md](../CHANGELOG.md) contains a section for the version being released
- bundled plugins exist under `src-tauri/resources/bundled_plugins`

## Local Windows Artifact

Build the Windows installer locally before the first publish of a version:

```bash
bun run build:release -- --bundles nsis
```

If `TAURI_SIGNING_PRIVATE_KEY` is unset, the helper automatically adds `--no-sign` so local beta builds can still complete.

## GitHub Publish

The publish workflow lives in [.github/workflows/publish.yml](../.github/workflows/publish.yml).

You can publish in two ways:

1. Push a `v*` tag, for example `v0.1.0-beta.2`
2. Trigger `Publish` manually with `workflow_dispatch` and provide `release_tag`

The workflow runs the same release preflight, builds platform artifacts, and verifies that the GitHub release contains:

- `latest.json`
- updater signature files (`.sig`)
- a Windows setup executable ending in `setup.exe`

## Release Checklist

1. Update version metadata in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`
2. Add or refresh the matching `CHANGELOG.md` section
3. Run `bun run release:check -- --release-tag vX.Y.Z --require-clean`
4. Run `bun run build:release -- --bundles nsis`
5. Push the tag or trigger the publish workflow manually
6. Confirm the GitHub release has the expected assets
