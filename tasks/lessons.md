# Lessons

Full historical lesson log is archived locally at:

- `tasks/archive/lessons-history-2026-05-18.md`

Keep this file short. Retain only recent or frequently relevant prevention rules. Search the archive only when working near older behavior.

## Current Prevention Rules

- History availability: provider history is optional. When no selected provider exposes entries, omit the history section instead of rendering unsupported-provider copy.
- OpenCode SQLite history: distinguish the Zen-only balance/cost-window query from the all-provider activity-history query; their similar shapes make context-free edits unsafe.

- History metric provenance: absence of a provider request count is unknown, not zero. Hide the request trend selector and render an unavailable total until an authoritative count exists.

- Credential source boundaries: native keychain absence may be returned as an exception. Classify stable missing-entry variants before treating a read exception as vault unavailability; preserve usable tokens and surface companion-token failures only when that credential is required.
- Complete module mocks: when production code imports a new constant or function, update every full-module test mock in the same slice; focused tests that partially mock the module will not expose the missing export.
- Filtered metric previews: join saved configuration to live values by stable provider/metric identity, never by array index; disabled or unavailable providers can remove intermediate results.

- Tauri production-only modules: when `cfg(test)` replaces a module with a stub, move pure security logic into a shared compiled module before claiming unit coverage; tests inside the production-only file never run.

- Provider auth screenshots: identify the selected provider explicitly before patching provider-specific logic. Prefer `/v1/usage/<provider>` evidence over visually similar setup fields.
- CLI quota providers: do not treat local session transcripts as account quota ledgers. Prefer authenticated quota endpoints or cached quota snapshots when a CLI exposes authoritative usage.
- Release notes: before publishing or editing a release body, fetch the previous release with `gh release view <previous-tag> --json body`; mirror section order and use a GitHub compare URL for `Full Changelog`.
- Rust unit tests: pure backend tests must not link desktop WebView/tray runtime code. Keep Tauri app wiring behind `#[cfg(not(test))]` unless the test explicitly needs it.
- Provider readiness reports: distinguish visibility/provenance fixes from source-maturity blockers. Mark only the fixed layer resolved.
- Ranked reports: if a report has an explicit tackle ranking, pick the next task from that ranking unless the user approves a different priority.
- Dev launchers: clean up only binaries owned by the current workspace/debug path. Do not stop installed/release app instances unless the user asks.
- Plugin manifests: only progress lines should declare `primaryOrder`; text fallback rows must not.
- Cookie login providers: app-vault credentials take precedence over environment fallbacks so stale env vars cannot shadow fresh Settings login.
- Progress bars: require a real positive provider-owned max. Do not manufacture limits from used values, balances, unlimited states, or zero totals.
- Provider max values: preserve real provider limits even when `used > limit`; the UI clamps visual fill only.
- Windows parsing: do not depend on English-only OS command tokens. Prefer locale-stable columns, flags, structured output, or path/process evidence.
- HTML encoding checks on Windows: read files explicitly as UTF-8 and verify character code points before diagnosing mojibake; default shell display output can corrupt valid punctuation.
- Copilot paid Chat: do not label `quota_snapshots.chat` as messages. GitHub's current paid Copilot usage limits are session/weekly usage-token limits, so display provider-reported counts as quota units unless GitHub returns an explicit prompt/message counter.
- Copilot token-based quotas: a disabled `premium_interactions` snapshot does not mean legacy billing. When `token_based_billing` is true, render provider-marked Chat and Completions snapshots before falling back to AI-credit fields.
- OpenCode Go: local SQLite spend history is not enough to prove an active paid Go subscription. Default to `Free` and suppress paid Go quota bars unless local auth/account data or signed-in billing data positively proves `GoSubscription`. In Free mode, count only free-model rows (`*-free`, `big-pickle`, etc.), not every `opencode-go`/`opencode` row.
- OpenCode Go subscription detection: never infer subscription from unstructured billing text or marketing copy. Require structured `goSubscription`/Go plan evidence with active/trialing/subscribed state; otherwise default to `Free`.
- OpenCode Go entitlement: an API key and paid/non-free local history prove past access, not a current subscription. Show `GoSubscription` only from structured active/trialing/subscribed auth or signed-in billing evidence; otherwise show `Free`.
- Settings store selectors: select only values actually read by the component. For cross-window preference propagation, action setters can be selected without also selecting display values already read by child/store-connected components.
- Vitest module mocks: values referenced by a `vi.mock` factory must be created with `vi.hoisted`; top-level `const` mocks are still uninitialized when the factory runs.
- Alpha Windows prerelease builds: do not use Tauri `--bundles all` with semver prerelease versions. MSI/WiX rejects non-numeric prerelease identifiers like `alpha.3`; build prerelease installers with `--bundles nsis` unless the MSI versioning scheme is changed.
- Provider order persistence: startup normalization must preserve any valid saved provider order. Apply default prefix/alphabetical ordering only when no saved order exists; append newly discovered providers after the saved order.
- Constrained sidebar actions: never leave a critical bottom action in a vertically shrinking flex stack. Keep controls `shrink-0`; make only the variable-length item list scroll.
- SVG chart interactions: scale a nested point group after translating an outer group; CSS `transform` on the translated group can replace its SVG position transform. Keep the translation and hover scale in separate layers.
- Native storage boundaries: notification and reporting settings helpers must short-circuit when `isTauri()` is false so browser previews and Vitest never instantiate Tauri `LazyStore` or invoke native IPC.
- NSIS environment hooks: do not round-trip a potentially long user `PATH` through NSIS `ReadRegStr`/`WriteRegExpandStr`; use a full-width Windows registry API path (PowerShell here) or the installer truncates the user's PATH at the NSIS string limit.
- Copilot plan metadata: `access_type_sku: free_limited_copilot` can coexist with authoritative token-based `quota_snapshots`; select available current snapshots before free-tier classification, and fixture both fields together.
