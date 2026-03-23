# UsageBar

Windows-first tray app for tracking AI coding subscription usage across providers in one place.

UsageBar is a fork of [OpenUsage](https://github.com/robinebers/openusage), redirected toward a Windows-native desktop experience instead of preserving upstream compatibility as the main constraint.

![UsageBar Screenshot](screenshot.png)

## Download

There is **no release yet** for this fork.

For now:
- Build from source (see “Build from source” below).
- Or follow the upstream project releases if you just want something stable: [OpenUsage releases](https://github.com/robinebers/openusage/releases).

## What It Does

UsageBar lives in your Windows tray and shows you how much of your AI coding subscriptions you've used. Progress bars, badges, and clear labels. No dashboard hopping.

- **One glance.** All your AI tools, one panel.
- **Always up-to-date.** Refreshes automatically on a schedule you pick.
- **Global shortcut.** Toggle the panel from anywhere with a customizable keyboard shortcut.
- **Lightweight.** Opens instantly, stays out of your way.
- **Plugin-based.** New providers get added without updating the whole app.

## Providers

Current Windows rollout status comes from each provider's `plugin.json` manifest in this fork.

| Provider | Windows status | Scope |
|---|---|---|
| [**Alibaba Coding Plan**](plugins/alibaba/) | Blocked placeholder | Visible in Settings only; implementation not landed yet |
| [**Amp**](docs/providers/amp.md) | Experimental | Free tier, bonus, credits |
| [**Antigravity**](docs/providers/antigravity.md) | Supported | All models |
| [**Augment**](plugins/augment/) | Blocked placeholder | Visible in Settings only; implementation not landed yet |
| [**Claude**](docs/providers/claude.md) | Supported | Session, weekly, extra usage, local token usage (`ccusage`) |
| [**Codex**](docs/providers/codex.md) | Supported | Session, weekly, reviews, credits |
| [**Copilot**](docs/providers/copilot.md) | Experimental | Premium, chat, completions |
| [**Cursor**](docs/providers/cursor.md) | Supported | Credits, total usage, auto usage, API usage, on-demand, CLI auth |
| [**Factory / Droid**](docs/providers/factory.md) | Experimental | Standard, premium tokens |
| [**Gemini**](docs/providers/gemini.md) | Experimental | Pro, flash, workspace/free/paid tier |
| [**JetBrains AI Assistant**](docs/providers/jetbrains-ai-assistant.md) | Supported | Quota, remaining |
| [**Kilo**](plugins/kilo/) | Blocked placeholder | Visible in Settings only; implementation not landed yet |
| [**Kimi**](docs/providers/kimi.md) | Experimental | Session, weekly |
| [**Kimi K2**](plugins/kimi-k2/) | Blocked placeholder | Visible in Settings only; implementation not landed yet |
| [**Kiro**](plugins/kiro/) | Blocked placeholder | Visible in Settings only; implementation not landed yet |
| [**MiniMax**](docs/providers/minimax.md) | Experimental | Coding plan session, region-aware API-key auth |
| [**Ollama**](docs/providers/ollama.md) | Supported | Plan, session, weekly |
| [**OpenCode**](docs/providers/opencode.md) | Experimental | Session, weekly |
| [**OpenCode Go**](docs/providers/opencode-go.md) | Supported | Local 5h, weekly, monthly CLI spend history |
| [**OpenRouter**](plugins/openrouter/) | Blocked placeholder | Visible in Settings only; implementation not landed yet |
| [**Perplexity**](docs/providers/perplexity.md) | Blocked | Groups, usage analytics, rate limits |
| [**Synthetic**](plugins/synthetic/) | Blocked placeholder | Visible in Settings only; implementation not landed yet |
| [**Vertex AI**](plugins/vertex-ai/) | Blocked placeholder | Visible in Settings only; implementation not landed yet |
| [**Warp**](plugins/warp/) | Blocked placeholder | Visible in Settings only; implementation not landed yet |
| [**Windsurf**](docs/providers/windsurf.md) | Experimental | Daily quota, weekly quota, extra usage balance |
| [**Z.ai**](docs/providers/zai.md) | Experimental | Session, weekly, web searches |

Want a provider that's not listed? [Open an issue.](https://github.com/Loues000/openusage/issues/new)

## Fork Direction

This repository is no longer trying to stay narrowly aligned with upstream pull-request boundaries. The priority here is a clean Windows tray app, a plugin-first provider model, and pragmatic product decisions for this fork.

That means the fork can change UX, provider strategy, release packaging, and architecture when that is the right tradeoff for Windows.

Upstream lineage stays visible and upstream fixes can still be pulled in through `upstream`, but this repository should be read as its own product direction.

## Contributing

- **Add a provider.** Each one is just a plugin. See the [Plugin API](docs/plugins/api.md).
- **Fix a bug.** Keep the change small, focused, and verified.
- **Request a feature.** [Open an issue.](https://github.com/Loues000/openusage/issues/new) Include the provider, auth source, and Windows-specific constraints.

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

</details>
