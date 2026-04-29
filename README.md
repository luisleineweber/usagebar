# UsageBar

Windows-first tray app for tracking AI coding subscription usage across providers in one place.

UsageBar is a fork of [OpenUsage](https://github.com/robinebers/openusage), redirected toward a Windows-native desktop experience instead of preserving upstream compatibility as the main constraint.

![UsageBar Screenshot](screenshot.png)

## Download

Windows beta builds are published as GitHub prereleases.

Release plan:
- Next public milestone: Alpha 1, once the install/setup/privacy/error-state gate is verified
- Windows: GitHub prerelease with a NSIS setup `.exe`
- macOS: still secondary while the Windows fork stabilizes

For published betas:
- Download the latest prerelease from [UsageBar releases](https://github.com/Loues000/usagebar/releases).

To run the current branch before a release is tagged, build from source below. If you want the upstream stable app instead, follow [OpenUsage releases](https://github.com/robinebers/openusage/releases).

Release process and preflight checks live in [docs/releasing.md](docs/releasing.md).

## Alpha Readiness

UsageBar is not a full release yet. The first public alpha should be treated as a testable Windows desktop build for people who accept rough edges and can report provider issues.

Alpha 1 should ship only when:

- A stranger can install the app from a GitHub release asset without cloning the repo.
- At least one supported provider can be configured, refreshed, and removed through the app UI.
- The panel shows usage/cost scope clearly, including date range, source, and last-updated state where the provider supplies enough data.
- Invalid credentials, offline mode, provider API failures, empty data, and active refresh states are visible without crashing the app.
- Privacy, telemetry, config/data storage, limitations, and issue-reporting paths are documented in this README and release notes.

## What It Does

UsageBar lives in your Windows tray and shows you how much of your AI coding subscriptions you've used. Progress bars, badges, and clear labels. No dashboard hopping.

- **One glance.** All your AI tools, one panel.
- **Always up-to-date.** Refreshes automatically on a schedule you pick.
- **Global shortcut.** Toggle the panel from anywhere with a customizable keyboard shortcut.
- **Lightweight.** Opens instantly, stays out of your way.
- **Plugin-based.** New providers get added without updating the whole app.
- **Local HTTP API.** Read cached usage from `127.0.0.1:6736` for local widgets, scripts, and dashboards.
- **Proxy support.** Route requests through SOCKS5/HTTP proxies for restricted networks.
- **Custom OAuth.** Bring your own OAuth credentials for enterprise compliance.

## Providers

Current Windows rollout status comes from each provider's `plugin.json` manifest in this fork.

| Provider | Windows status | Scope |
|---|---|---|
| [**Abacus AI**](docs/providers/abacus.md) | Experimental | API-key usage and credit details |
| [**Alibaba Coding Plan**](docs/providers/alibaba.md) | Experimental | Coding Plan daily/weekly quotas with region-aware auth |
| [**Amp**](docs/providers/amp.md) | Experimental | Free tier, bonus, credits |
| [**Antigravity**](docs/providers/antigravity.md) | Supported | All models |
| [**Augment**](docs/providers/augment.md) | Experimental | Credits via signed-in Augment web Cookie header |
| [**Claude**](docs/providers/claude.md) | Supported | Session, weekly, extra usage, local token usage (`ccusage`) |
| [**Codex**](docs/providers/codex.md) | Supported | Session, weekly, reviews, credits, managed multi-account selection |
| [**Copilot**](docs/providers/copilot.md) | Experimental | Premium, chat, completions |
| [**Cursor**](docs/providers/cursor.md) | Supported | Credits, total usage, auto usage, API usage, on-demand, CLI auth |
| [**Factory / Droid**](docs/providers/factory.md) | Experimental | Standard and premium usage buckets |
| [**Gemini**](docs/providers/gemini.md) | Experimental | Gemini quota buckets and reported Code Assist tier |
| [**JetBrains AI Assistant**](docs/providers/jetbrains-ai-assistant.md) | Supported | Quota, remaining |
| [**Kilo**](docs/providers/kilo.md) | Experimental | Direct API-key usage endpoint |
| [**Kimi**](docs/providers/kimi.md) | Experimental | Session, weekly |
| [**Kimi K2**](docs/providers/kimi-k2.md) | Experimental | Credits, remaining, average tokens |
| [**Kiro**](docs/providers/kiro.md) | Experimental | Credits, bonus credits, overages tracking |
| [**MiniMax**](docs/providers/minimax.md) | Experimental | Coding Plan session usage, explicit reported plan when available |
| [**Mistral**](docs/providers/mistral.md) | Experimental | La Plateforme usage and billing details via signed-in session |
| [**Ollama**](docs/providers/ollama.md) | Supported | Plan, session, weekly |
| [**OpenCode Zen**](docs/providers/opencode.md) | Experimental | Pay-as-you-go billing usage from the signed-in workspace session |
| [**OpenCode Go**](docs/providers/opencode-go.md) | Supported | Subscription 5h, weekly, monthly limit tracking from local CLI history |
| [**OpenRouter**](docs/providers/openrouter.md) | Experimental | Credits, balance, request-rate detail |
| [**Perplexity**](docs/providers/perplexity.md) | Experimental | Recurring, purchased, and bonus credit pools via manual cookie/env auth |
| [**Synthetic**](docs/providers/synthetic.md) | Experimental | Direct API-key quota endpoint |
| [**Vertex AI**](docs/providers/vertex-ai.md) | Experimental | gcloud ADC OAuth plus Cloud Monitoring quota usage |
| [**Warp**](docs/providers/warp.md) | Experimental | Request limits, plan badge |
| [**Windsurf**](docs/providers/windsurf.md) | Experimental | Daily quota, weekly quota, extra usage balance |
| [**Zed**](docs/providers/zed.md) | Experimental | Dashboard token spend via browser-backed cookie replay, with local telemetry fallback |
| [**Z.ai**](docs/providers/zai.md) | Experimental | Session, weekly, web searches |

Want a provider that's not listed? [Open an issue.](https://github.com/Loues000/usagebar/issues/new)

## Current Limitations

- Windows is the primary tested platform for this fork. macOS and Linux remain secondary until the Windows release path is boring.
- Provider coverage is uneven: `Supported` means the Windows path is intended to work; `Experimental` means setup, API shape, or live-account validation may still change.
- Some providers report usage directly; others estimate from local history, known quota pools, telemetry logs, or manually supplied session cookies. Provider docs describe the source per integration.
- Prerelease auto-updates are intentionally conservative because GitHub's `releases/latest` alias does not resolve prereleases. Prerelease builds may open the matching GitHub release page instead of installing in-app.
- Signed release artifacts and full crash-recovery expectations are full-release work, not an alpha promise.

## Architecture

UsageBar is a Tauri v2 desktop app with a Rust host and a React/TypeScript frontend. Provider integrations live as JavaScript plugins under `plugins/` and are copied into the Tauri resource bundle for desktop execution.

- **Rust host:** tray/window lifecycle, local HTTP API, updater, credential storage, SQLite access, and guarded plugin host APIs.
- **React frontend:** tray panel, Settings window, provider setup, usage views, preferences, and update prompts.
- **Plugin manifests:** provider identity, platform support, icons, docs links, and capability declarations.
- **Bundled plugins:** generated by `bun run bundle:plugins` before dev/build so desktop resources match source plugins.

## Privacy And Security

UsageBar is local-first. Provider credentials are read from local app state, environment variables, browser/session cookies you explicitly provide, or OS credential storage depending on the provider.

- Secrets stay on the machine unless a provider plugin must call that provider's API to read usage.
- Plugin host APIs are allowlisted and capability-gated for sensitive operations such as write-capable SQLite access.
- The WebView uses a restrictive starter content security policy.
- The optional local HTTP API binds to `127.0.0.1:6736`.
- Telemetry uses the app's analytics integration only for product diagnostics; provider usage payloads and credentials are not telemetry data.
- Crash-log collection is not presented as a public guarantee yet; release notes must state the exact behavior before Alpha 1 is published.

## Fork Direction

This repository is no longer trying to stay narrowly aligned with upstream pull-request boundaries. The priority here is a clean Windows tray app, a plugin-first provider model, and pragmatic product decisions for this fork.

That means the fork can change UX, provider strategy, release packaging, and architecture when that is the right tradeoff for Windows.

Upstream lineage stays visible and upstream fixes can still be pulled in through `upstream`, but this repository should be read as its own product direction.

## Contributing

- **Add a provider.** Each one is just a plugin. See the [Plugin API](docs/plugins/api.md).
- **Read usage locally.** See the [Local HTTP API](docs/local-http-api.md).
- **Fix a bug.** Keep the change small, focused, and verified.
- **Request a feature.** [Open an issue.](https://github.com/Loues000/usagebar/issues/new) Include the provider, auth source, and Windows-specific constraints.

Keep it simple. No feature creep, no AI-generated commit messages, test your changes.

## Lineage

UsageBar started from the [OpenUsage](https://github.com/robinebers/openusage) codebase. This fork also borrows practical Windows ideas from [CodexBar](https://github.com/steipete/CodexBar) and provider reference patterns from [ccusage](https://github.com/ryoppippi/ccusage) where they fit.

## Credits

Inspired by [CodexBar](https://github.com/steipete/CodexBar) by [@steipete](https://github.com/steipete). Same idea, very different approach.

## License

[MIT](LICENSE)

---

<details>
<summary><strong>Build from source</strong></summary>

> **Warning**: The `main` branch may not be stable. It is merged directly without staging, so users are advised to use tagged versions for stable builds. Tagged versions are fully tested while `main` may contain unreleased features.

### Stack

- Tauri v2
- Rust
- React 19
- TypeScript
- Vite
- Tailwind CSS v4
- Zustand
- Vitest

### Local release build

For a Windows beta-style build on this machine:

```bash
bun run release:check -- --release-tag v0.1.0-beta.7
bun run build:release -- --bundles nsis
```

If `TAURI_SIGNING_PRIVATE_KEY` is unset, the helper automatically adds `--no-sign` for an unsigned local build. The setup executable lands under `src-tauri/target/release/bundle/nsis/`.

Before pushing a release tag, run the same preflight with `--require-clean` so the tag is cut from a clean worktree.

</details>
