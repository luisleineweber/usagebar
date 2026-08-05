# Sibling repository review — 2026-08-04

## Scope and method

Reviewed the Git repositories under `D:\UsageBar`, excluding `usagebar`:

- `ccusage`
- `CodexBar`
- `opencode-usage`
- `openusage`
- `Win-CodexBar`

Ran `git fetch --all --prune` in each sibling repository. No merge, rebase, checkout,
working-tree reset, or source edit was performed. The local worktrees of `opencode-usage`
and `Win-CodexBar` already contain uncommitted changes and were treated as read-only.

## Remote status

| Repository       | Local HEAD | Remote main | Divergence             | Latest relevant remote state                           |
| ---------------- | ---------- | ----------- | ---------------------- | ------------------------------------------------------ |
| `ccusage`        | `88cdfa4`  | `b2ee26c`   | 93 behind              | Pricing snapshots; tags `v20.0.18` and `v20.0.19`      |
| `CodexBar`       | `501e9515` | `a82f509e`  | 1,227 behind           | User-installed JavaScript/TypeScript provider plugins  |
| `opencode-usage` | `64075d6`  | `64075d6`   | current                | No new remote commits; worktree is heavily modified    |
| `openusage`      | `f415ddd`  | `9d2bf09`   | 418 ahead / 499 behind | Account-first multi-account rollout                    |
| `Win-CodexBar`   | `f5833da5` | `814fd135`  | 476 behind             | Port of upstream 0.47.0 plus Windows-specific features |

## Findings by repository

### ccusage

The local UsageBar host pins `ccusage@20.0.18` in
`src-tauri/src/plugin_engine/ccusage_host_api.rs` and `docs/plugins/api.md`.
The upstream `v20.0.19` tag (`caf89e8`, 2026-07-27) adds several fixes worth
evaluating before changing the pin:

- `c462cb5`: follow rewritten Codex replay bursts beyond a second tick.
- `24a3ed0`: stop double-counting reasoning in derived Codex totals.
- `6d53c57`: honor `--since`/`--until` in OpenCode SQLite and JSON loaders.
- `409b4a5`: deduplicate replayed Codex usage.
- `0d968b9`: correct replay and pricing accounting.
- `473019d`: add `--last` for recent-period reports.

The current `origin/main` activity after that release is primarily automated pricing
catalog refreshes. The Antigravity adapter was also reverted in `8028fd4` until its
upstream dependency is ready; this is a useful reminder not to surface a provider
from an incomplete source contract.

**UsageBar implication:** first run the existing ccusage/plugin/history regression
suite against `20.0.19` and inspect Codex replay, reasoning totals, and OpenCode date
boundaries. This is the highest-confidence follow-up because it addresses known
recent UsageBar failure modes without changing the plugin model.

### CodexBar

The recent upstream sequence is a major plugin architecture expansion:

- `036c27f0`: JavaScript provider runtime prototype.
- `00ef23cd`: declarative provider detail sections and JavaScript detail providers.
- `94efcfdf`: cookie capability and host API extensions.
- `15a855a2`: `ProviderInstanceID` identity seam across provider state and caches.
- `698c332a`: retain cached spend while Codex refreshes.
- `8eb867c0`: unify Pi and OMP agent sessions.
- `70125a5e`: compact usage detail rows.
- `e12a824f`: one-shot dashboard snapshot CLI command.
- `a82f509e`: user-installed JavaScript/TypeScript plugins.

The implemented user-plugin contract in `docs/plugins.md` is deliberately narrow:
local files only, explicit endpoint declarations, capability-gated browser cookies,
host-owned authentication headers, bounded responses, no imports or arbitrary local
I/O, approval records invalidated when the authority surface changes, and generic
snapshot rendering. The generic snapshot supports rate windows, costs, identity,
subscription renewal, detail rows, and small charts.

**UsageBar implication:** UsageBar already has a plugin-first model, manifest capability
gates, redaction, and generic metric lines. The most useful incremental design is a
declarative `details`/`sections` contract for provider cards and history summaries,
not a wholesale port of CodexBar’s Swift runtime. A future user-plugin system should
also start with a much narrower capability profile than UsageBar’s current bundled
plugins, because the existing host exposes filesystem, SQLite, browser, credential,
and ccusage capabilities.

The identity seam is also relevant: stable provider-instance IDs avoid attaching a
refresh result, cache entry, history, or notification to the wrong account after an
account swap. This should inform any future generalization of UsageBar’s current
Codex-only account handling.

### openusage

Remote main is in the middle of an explicit account-first rollout:

- `d785f7e`: snapshot the shell environment before account discovery.
- `7723025`: provider account registry, default identity, account-stamped cache, and
  plain-matching CLI/API behavior.
- `842feae`: Claude multi-account discovery from custom config directories.
- `9d2bf09`: one render-time name resolver for account card titles.
- `7364bb0` on `origin/account-first-phase-3`: unify Claude Desktop token-cache pools.

The account plan in `docs/research/account-first-plan.md` treats every visible card as
an account with a stable record ID; filesystem homes, config directories, and other
locations are sources attached to that account. Cache entries carry the producing
account identity so a swapped account cannot inherit stale values.

The `6a2d74d` local-log cache work is also notable. It stores per-source-file metadata
(size and mtime), persists parsed records separately from a manifest, merges writes
under a lock, publishes the manifest last, and shares a bounded parse-permit pool.
`JSONLScanCacheCoordination.swift` also exposes an explicit flush for one-shot CLI
processes.

**UsageBar implication:** do not start with full Claude/Codex multi-account discovery.
First consider adding a stable optional account identity to `PluginOutput`, history
cache keys, retained snapshots, and notification event IDs. Separately, the Windows
equivalent of the parsed-log cache is a candidate for ccusage snapshot/runner results;
UsageBar already has runner-resolution caching, probe backpressure, and retained
history, so this should be an incremental performance audit rather than a duplicate
cache layer.

### Win-CodexBar

Remote main recently ported upstream 0.47.0 (`0d929578`) and added/retained several
Windows-oriented ideas:

- `30242407`: per-notification custom sounds, with bundled event-specific audio and
  settings/bridge plumbing.
- `4622c89f`: DPI-aware FloatBar content sizing.
- `98125ebd`: Russian localization.
- `8ca7b07e`: MiniMax coding-plan parsing and OpenCode Go percentage scaling fixes.
- `b167e328`: split large desktop UI modules and extract pure helpers with focused
  tests.

There are also fetched but not-main branches for global HTTP proxy settings
(`origin/feat/http-proxy-settings`), adaptive/local-first refresh
(`origin/port/045-deferred-local`), and single-flight refresh correctness
(`origin/finesssee-refresh-correctness`).

**UsageBar implication:** per-event sounds are a plausible later enhancement because
UsageBar already persists quota, reset, incident, and recovery events but currently
only sends generic Windows notifications. DPI work is only relevant if UsageBar adds
a floating/secondary surface. The proxy branch is worth revisiting for enterprise
networks, but it is branch-only evidence rather than a merged upstream baseline.

### opencode-usage

After fetch, `origin/main` still equals local `64075d6` (2026-03-17), so there is no
new committed upstream content to import. The worktree has extensive uncommitted
changes across the Commander UI, services, tests, and agent guidance; those changes
were not inspected as authoritative upstream history and were not modified.

## Recommendations for UsageBar

1. **Evaluate and likely bump ccusage to 20.0.19.** Add fixture coverage for replay
   bursts, reasoning-token totals, and OpenCode `since/until` behavior before changing
   the pin. Keep the current fallback policy and verify the real Windows runner.
2. **Define an account identity seam.** Add an optional stable account/instance ID to
   plugin output, history/cache identity, and notification deduplication before
   broadening beyond Codex managed accounts.
3. **Add declarative provider detail sections.** Support bounded text rows, extra
   windows, identity/cost metadata, and small charts in the plugin contract so new
   providers do not require provider-specific React components.
4. **Audit stale-while-revalidate semantics by metric.** UsageBar already retains
   settled provider data and history after partial failures; compare the CodexBar
   cached-spend behavior and ensure cost/overview data carries an explicit freshness
   state rather than looking current during refresh.
5. **Defer user-installed plugins.** Revisit after the detail contract and capability
   boundary are stable. Require explicit approval, origin/secret declarations,
   bounded execution, and deletion of settings/cache on uninstall; do not reuse the
   current bundled-plugin host permissions unchanged.
6. **Keep Windows polish as optional follow-up.** Per-event notification sounds and
   configurable proxy support are useful, but they rank below the ccusage correctness
   and account/cache seams.

## Source index

All sources below are local fetched Git refs; commit IDs are included for reproducibility.

- `D:\UsageBar\ccusage`: tags `v20.0.18`, `v20.0.19`; commits listed above.
- `D:\UsageBar\CodexBar\docs\plugins.md` at `origin/main`; commits `036c27f0`,
  `00ef23cd`, `94efcfdf`, `15a855a2`, `698c332a`, `a82f509e`.
- `D:\UsageBar\openusage\docs\research\account-first-plan.md` at `origin/main`;
  commits `7723025`, `842feae`, `9d2bf09`, `6a2d74d`.
- `D:\UsageBar\Win-CodexBar\rust\assets\sounds\README.md` and relevant source at
  `origin/main`; commits `0d929578`, `30242407`, `4622c89f`, `8ca7b07e`.
- UsageBar contracts: `src/lib/plugin-types.ts`,
  `src-tauri/src/plugin_engine/manifest.rs`,
  `src-tauri/src/plugin_engine/ccusage_host_api.rs`, and
  `src/lib/notification-events.ts`.
