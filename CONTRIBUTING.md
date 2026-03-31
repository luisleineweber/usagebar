# Contributing to UsageBar

UsageBar accepts contributions, but the bar is intentionally high. Read this document before opening a PR.

## Philosophy

UsageBar is highly opinionated. It focuses on a fast Windows tray experience for AI coding subscription usage tracking. Contributions that expand the scope, add avoidable complexity, or compromise the UX will be closed.

If you're unsure whether your idea fits, open an issue first.

## Ground Rules

- No feature creep. If it's not about usage tracking, it doesn't belong here.
- No AI-generated commit messages. Write your own.
- Test your changes. If it touches UI, include before/after screenshots.
- Keep it simple. Don't over-engineer.
- One PR per concern. Don't bundle unrelated changes.
- Match the existing design language. UsageBar has a specific look and feel.

## License Agreement

By submitting a pull request, you agree that your contribution is licensed under the [MIT License](LICENSE) that covers this project.

## How to Contribute

### Fork and PR workflow

1. Fork the repo
2. Create a branch (`feat/my-change`, `fix/some-bug`, etc.)
3. Make your changes
4. Run `bun run build` and `bun run test` to verify nothing is broken
5. Run `bun run release:check` if you touched release-facing metadata, packaging, or updater paths
6. Open a PR against `main`

### Add a provider plugin

Each provider is a plugin. See the [Plugin API docs](docs/plugins/api.md) for the full spec.

1. Create a new folder under `plugins/` with your provider name
2. Add `plugin.json` (metadata) and `plugin.js` (implementation)
3. Add documentation in `docs/providers/`
4. Test it locally with `bun tauri dev`
5. Open a PR with screenshots showing it working

You can also [open an issue](https://github.com/Loues000/usagebar/issues/new?template=new_provider.yml) to request a provider without building it yourself.

### Fix a bug

1. Reference the issue number in your PR
2. Describe the root cause and fix
3. Include before/after screenshots for UI bugs
4. Add a regression test if applicable

### Request a feature

Don't open a PR for large features without discussing first. [Open an issue](https://github.com/Loues000/usagebar/issues/new?template=feature_request.yml) and make your case.

## What Gets Accepted

- Bug fixes with clear descriptions
- New provider plugins that follow the Plugin API
- Documentation improvements
- Performance improvements with benchmarks
- Accessibility improvements

## What Gets Rejected

- Features that expand the scope beyond usage tracking
- Changes that compromise speed, simplicity, or the existing UX
- PRs without testing evidence
- Code with no clear purpose or explanation
- Cosmetic-only changes without prior discussion

## Code Standards

- TypeScript for frontend (`src/`)
- Rust for backend (`src-tauri/`)
- Follow existing patterns in the codebase
- No new dependencies without justification

## Releases

- Release tags (`v*`) are maintainer-managed.
- Before creating a release tag, run `bun run release:check -- --release-tag vX.Y.Z --require-clean`.
- If you change packaging, updater, or version metadata, also run `bun run build:release -- --bundles nsis` on Windows.
- The release workflow publishes from `.github/workflows/publish.yml`; the manual steps and expectations are documented in [docs/releasing.md](docs/releasing.md).

## Questions?

Open a [bug report](https://github.com/Loues000/usagebar/issues/new?template=bug_report.yml) or [feature request](https://github.com/Loues000/usagebar/issues/new?template=feature_request.yml) using the issue templates.
