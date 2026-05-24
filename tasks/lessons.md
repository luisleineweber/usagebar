# Lessons

Full historical lesson log is archived locally at:

- `tasks/archive/lessons-history-2026-05-18.md`

Keep this file short. Retain only recent or frequently relevant prevention rules. Search the archive only when working near older behavior.

## Current Prevention Rules

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
- Copilot paid Chat: do not label `quota_snapshots.chat` as messages. GitHub's current paid Copilot usage limits are session/weekly usage-token limits, so display provider-reported counts as quota units unless GitHub returns an explicit prompt/message counter.
- OpenCode Go: local SQLite spend history is not enough to prove an active paid Go subscription. Default to `Free` and suppress paid Go quota bars unless local auth/account data or signed-in billing data positively proves `GoSubscription`. In Free mode, count only free-model rows (`*-free`, `big-pickle`, etc.), not every `opencode-go`/`opencode` row.
- OpenCode Go subscription detection: never infer subscription from unstructured billing text or marketing copy. Require structured `goSubscription`/Go plan evidence with active/trialing/subscribed state; otherwise default to `Free`.
- Settings store selectors: select only values actually read by the component. For cross-window preference propagation, action setters can be selected without also selecting display values already read by child/store-connected components.
