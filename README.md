# UsageBar

Windows-first tray app for tracking AI coding subscription usage across providers in one place.

![UsageBar Screenshot](docs/assets/screenshot.png)

## Download

Windows alpha/beta builds are published as GitHub prereleases. Download the latest Windows NSIS installer from [UsageBar releases](https://github.com/luisleineweber/usagebar/releases). Release process and preflight checks live in [docs/releasing.md](docs/releasing.md).

## Install

1. Download and run `UsageBar_*_x64-setup.exe`.
2. Open UsageBar from the Start menu or tray.
3. In Settings, enable a provider and follow its setup instructions.

## Providers

Current Windows rollout status comes from each provider's `plugin.json` manifest in this fork.

Status meanings:

- **Supported:** intended to work on Windows from the documented setup path.
- **Experimental:** visible and testable on Windows, but setup, API shape, or live-account validation can still change.
- **Scope:** names the usage source. Provider-reported means the provider API or local provider database supplies the number directly. Estimated or telemetry-based means UsageBar derives it from local logs, quota counters, known pools, or manually supplied sessions. Each provider page contains the exact source and limitations.

| Provider                                                               | Windows status | Scope                                                                                                                                                                           |
| ---------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [**Abacus AI**](docs/providers/abacus.md)                              | Experimental   | API-key usage and credit details                                                                                                                                                |
| [**Alibaba**](docs/providers/alibaba.md)                               | Experimental   | Coding Plan request quotas and Bailian Token Plan credits                                                                                                                       |
| [**Amp**](docs/providers/amp.md)                                       | Experimental   | Free tier, bonus, credits                                                                                                                                                       |
| [**Antigravity**](docs/providers/antigravity.md)                       | Supported      | All models                                                                                                                                                                      |
| [**Augment**](docs/providers/augment.md)                               | Experimental   | Credits via signed-in Augment web Cookie header                                                                                                                                 |
| [**Claude**](docs/providers/claude.md)                                 | Supported      | Session, weekly, extra usage, local token usage (`ccusage`)                                                                                                                     |
| [**Codebuff**](docs/providers/codebuff.md)                             | Experimental   | Credit balance and weekly rate limit via API token or `codebuff login` credentials                                                                                              |
| [**Codex**](docs/providers/codex.md)                                   | Supported      | Session, weekly, reviews, credits, managed multi-account selection                                                                                                              |
| [**Copilot**](docs/providers/copilot.md)                               | Experimental   | AI Credits, legacy premium requests, chat, completions                                                                                                                          |
| [**Cursor**](docs/providers/cursor.md)                                 | Supported      | Credits, total usage, auto usage, API usage, on-demand, CLI auth                                                                                                                |
| [**Chutes**](docs/providers/chutes.md)                                 | Experimental   | Rolling 4-hour and monthly subscription quota                                                                                                                                   |
| [**DeepSeek**](docs/providers/deepseek.md)                             | Experimental   | API balance with paid and granted credit breakdown                                                                                                                              |
| [**Devin**](docs/providers/devin.md)                                   | Experimental   | Daily and weekly organization quota                                                                                                                                             |
| [**Doubao**](docs/providers/doubao.md)                                 | Experimental   | Volcengine Ark request-limit headers from a minimal probe                                                                                                                       |
| [**Factory / Droid**](docs/providers/factory.md)                       | Experimental   | Standard and premium usage buckets                                                                                                                                              |
| [**Gemini**](docs/providers/gemini.md)                                 | Experimental   | Gemini quota buckets and reported Code Assist tier                                                                                                                              |
| [**Grok**](docs/providers/grok.md)                                     | Experimental   | CLI-authenticated billing credits and pay-as-you-go cap                                                                                                                         |
| [**JetBrains AI Assistant**](docs/providers/jetbrains-ai-assistant.md) | Supported      | Quota, remaining                                                                                                                                                                |
| [**Kilo**](docs/providers/kilo.md)                                     | Experimental   | Direct API-key usage endpoint                                                                                                                                                   |
| [**Kimi Code (Moonshot)**](docs/providers/kimi.md)                     | Experimental   | Kimi CLI, kimi.com membership, session and weekly quota from local `kimi login` OAuth; optional official Moonshot API balance via `https://api.moonshot.ai/v1/users/me/balance` |
| [**Kiro**](docs/providers/kiro.md)                                     | Experimental   | Credits, bonus credits, overages tracking                                                                                                                                       |
| [**MiniMax**](docs/providers/minimax.md)                               | Experimental   | Coding Plan session usage, explicit reported plan when available                                                                                                                |
| [**Mistral**](docs/providers/mistral.md)                               | Experimental   | La Plateforme usage and billing details via official Admin API key, with session-cookie fallback                                                                                |
| [**Ollama**](docs/providers/ollama.md)                                 | Supported      | Plan, session, weekly                                                                                                                                                           |
| [**OpenCode**](docs/providers/opencode-go.md)                          | Supported      | OpenCode Go account-wide 5h, weekly, and monthly quota from the official usage API; local history and optional OpenCode Zen balance                              |
| [**OpenAI API**](docs/providers/openai-api.md)                         | Experimental   | Organization API spend windows, completions tokens, requests, and top model from the OpenAI Admin API                                                                           |
| [**OpenRouter**](docs/providers/openrouter.md)                         | Experimental   | Credits, balance, request-rate detail                                                                                                                                           |
| [**Perplexity**](docs/providers/perplexity.md)                         | Experimental   | Recurring, purchased, and bonus credit pools via manual cookie/env auth                                                                                                         |
| [**Qwen Code**](docs/providers/qwen.md)                                | Experimental   | Local Qwen Code token usage and estimated cost history via `ccusage`                                                                                                            |
| [**Qoder**](docs/providers/qoder.md)                                   | Experimental   | Big Model credits from the international or China dashboard                                                                                                                     |
| [**StepFun**](docs/providers/stepfun.md)                               | Experimental   | Step Plan 5-hour and weekly quota                                                                                                                                               |
| [**Synthetic**](docs/providers/synthetic.md)                           | Experimental   | Direct API-key quota endpoint                                                                                                                                                   |
| [**Vertex AI**](docs/providers/vertex-ai.md)                           | Experimental   | gcloud ADC OAuth plus Cloud Monitoring quota usage                                                                                                                              |
| [**Warp**](docs/providers/warp.md)                                     | Experimental   | Request limits and plan badge from an undocumented app GraphQL operation                                                                                                        |
| [**Windsurf**](docs/providers/windsurf.md)                             | Experimental   | Daily quota, weekly quota, extra usage balance                                                                                                                                  |
| [**Zed**](docs/providers/zed.md)                                       | Experimental   | Dashboard token spend via browser-backed cookie replay, with local telemetry fallback                                                                                           |
| [**Z.ai**](docs/providers/zai.md)                                      | Experimental   | Session, weekly, web searches from undocumented subscription/quota endpoints                                                                                                    |

Want a provider that's not listed? [Open an issue.](https://github.com/luisleineweber/usagebar/issues/new)

## What It Does

UsageBar sits in your Windows tray and gives you one quick view of your AI coding usage across providers. It refreshes automatically, supports a global shortcut, and keeps provider integrations modular.

You can also read cached usage locally through the [HTTP API](docs/local-http-api.md) or [CLI](docs/cli.md), review supported history/reporting, manage credentials, and configure quota notifications.

## Release Status And Current Limitations

UsageBar v0.0.1 is a Windows-first public release. The installer is unsigned; Authenticode signing is deferred.

- Windows is the primary tested platform for this fork. macOS and Linux remain secondary until the Windows release path is boring.
- Provider coverage is uneven: `Supported` means the Windows path is intended to work; `Experimental` means setup, API shape, or live-account validation may still change.
- Some providers report usage directly; others estimate from local history, known quota pools, telemetry logs, or manually supplied session cookies. Provider docs describe the source per integration.
- Signed updater metadata is the primary update path. UsageBar verifies the published asset digest, downloads the Windows installer, then restarts after the app exits.
- Authenticode-signed Windows artifacts, live Edge-account validation, and full crash-recovery expectations remain future work.

## Architecture

UsageBar is a Tauri v2 desktop app with a Rust host and a React/TypeScript frontend. Provider integrations live as JavaScript plugins under `plugins/` and are copied into the Tauri resource bundle for desktop execution.

- **Rust host:** tray/window lifecycle, local HTTP API, updater, credential storage, SQLite access, and guarded plugin host APIs.
- **React frontend:** tray panel, Settings window, provider setup, usage views, preferences, and update prompts.
- **Plugin manifests:** provider identity, platform support, icons, docs links, and capability declarations.
- **Bundled plugins:** generated by `bun run bundle:plugins` before dev/build so desktop resources match source plugins.

## Uninstall, Data, Privacy And Security

Uninstall UsageBar in Windows Settings > Apps > Installed apps > UsageBar > Uninstall. If a local test build was installed manually, rerun its installer and choose uninstall if Windows does not list it yet.

UsageBar is local-first. App settings, provider order, display preferences, and app-owned provider secrets live under `%APPDATA%\com.sunstory.usagebar`; Windows secrets are encrypted with DPAPI. Some providers also read their own local CLI, IDE, browser, or cloud SDK files, documented on each provider page. Legacy beta installs may still use `%APPDATA%\com.sunstory.openusage`; do not delete it until migration is verified.

- Secrets stay on the machine unless a provider plugin must call that provider's API to read usage.
- UsageBar does not send provider credentials, raw usage payloads, API keys, cookies, or app-owned provider secret files to UsageBar-owned services.
- Plugin host APIs are allowlisted and capability-gated for sensitive operations such as write-capable SQLite access.
- The WebView uses a restrictive starter content security policy.
- The opt-in local HTTP API binds to `127.0.0.1:6736` and requires a bearer token when enabled.
- Telemetry uses the app's analytics integration only for product diagnostics; provider usage payloads and credentials are not telemetry data.
- Crash logs are local support artifacts under `%LOCALAPPDATA%\com.sunstory.usagebar` unless a user explicitly attaches sanitized logs to a report. Automatic crash upload is not part of the Alpha 1 promise.

## Contributing

- **Experimental providers.** Since they are in an experimental phase, we welcome feedback on your experience.
- **Add a provider.** Each one is just a plugin. See the [Plugin API](docs/plugins/api.md).
- **Read usage locally.** See the [Local HTTP API](docs/local-http-api.md).
- **Use terminal output.** See the [UsageBar CLI](docs/cli.md).
- **Fix a bug.** Keep the change small, focused, and verified.
- **Request a feature or report a bug.** [Open an issue.](https://github.com/luisleineweber/usagebar/issues/new) Include the provider, auth source, Windows-specific constraints, app version, and sanitized logs. See [bug report notes](docs/bug-reports.md).
- **Share diagnostics safely.** Include exact error text and timestamps, but do not attach API keys, cookies, raw credential files, or `provider-secrets.json`.

Keep it simple. No feature creep, no AI-generated commit messages, test your changes.

## Lineage

UsageBar started from the [OpenUsage](https://github.com/robinebers/openusage) codebase. This fork also borrows practical Windows ideas from [CodexBar](https://github.com/steipete/CodexBar) and provider reference patterns from [ccusage](https://github.com/ryoppippi/ccusage) where they fit.

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

### Local quality checks

```bash
bun run check
bun run test -- --run
```

`bun run check` is the default local quality gate for frontend and Rust formatting, ESLint, TypeScript typechecking, and Clippy. The narrower `bun run check:frontend` and `bun run check:rust` scripts are available when working on only one side of the application.

### Local release build

For a Windows release build on this machine:

```bash
bun run release:check -- --release-tag v0.0.1
bun run build:release -- --bundles nsis
```

If `TAURI_SIGNING_PRIVATE_KEY` is unset, the helper automatically adds `--no-sign` so the local build can skip Tauri updater signatures. Set `USAGEBAR_ALLOW_UNSIGNED_WINDOWS_INSTALLER=1` for local builds without an Authenticode certificate. The helper signs the final setup executable when Windows signing material exists. The setup executable lands under `src-tauri/target/release/bundle/nsis/`.

GitHub publishes unsigned Windows installers until the project gets an Authenticode certificate. These installers can show `Unknown publisher` and trigger Windows SmartScreen's "unrecognized app" warning. Stable releases still require signed Tauri updater metadata; see [docs/releasing.md](docs/releasing.md).

Before pushing a release tag, run the same preflight with `--require-clean` so the tag is cut from a clean worktree.

</details>
