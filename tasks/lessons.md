# Lessons

## 2026-08-15

- CI plugin tests depended on an ignored generated bundle that clean checkouts did not create. Fix: bundle plugins as an explicit CI test prerequisite and publish the full RustSec report. Prevention: run tests from a clean checkout path, not from local generated artifacts.
- Managed account identity was Codex-only, so other provider logins could not keep data isolated. Fix: use provider-scoped account profiles and stable instance IDs for auth, cache, history, notifications, and pins. Prevention: test each managed provider with two account instances.
- The update action downloaded and installed in one step, and unsigned prereleases opened GitHub instead of updating. Fix: download first, show a restart action, and use a verified GitHub installer with a hidden Windows restart helper. Prevention: test signed and prerelease update paths through download, ready, install, and relaunch states.
- Progress availability must preserve provider-confirmed zero separately from missing or unsupported values. Fix: carry nullable progress values through the runtime, UI, tray, CLI, HTTP, history, and notifications. Prevention: test zero, unknown, unsupported, retained, and failed states at every output boundary.

## 2026-08-13

- The panel timer paused for every open Settings window, including a window minimized to the taskbar. Fix: publish the native minimized state and resume the panel timer when Settings is minimized. Prevention: test open, minimized, restored, and closed Settings states together.

## 2026-08-07

- The available-update action looked like a glowing status badge instead of a native tray action. Fix: use the shared compact button geometry, the product accent, and a download icon. Prevention: review update states against the shared button system in both themes.

## 2026-08-06

- The first panel paint could leave the sidebar and content column without a shared viewport height, so Settings and the footer moved with provider content. Fix: give the root, panel, content column, and sidebar explicit bounded flex geometry. Prevention: test the first App render for a full-height panel frame and clipped provider list.

## 2026-08-06

- Provider checkbox events could reach the provider row and open its detail view. Fix: ignore child events in row selection and remove automatic provider selection. Prevention: test checkbox toggles separately from explicit row selection.
- Showing an existing Settings window did not restore a minimized window before focusing it. Fix: unminimize before show and focus. Prevention: verify existing-window paths for hidden, minimized, and background states.

## 2026-08-06

- The overview content floor stayed fixed while selected providers increased. Fix: add a small provider-count increment to the home minimum height and use it for both measurement and rendering. Prevention: test shared layout floors with zero, one, and several selected providers.

## 2026-08-05

- Stacked bars show all providers, so first/latest provider selection and its preview label add no value. Fix: hide both when stacked bars is active. Prevention: test tray-style-specific settings and preview content together.
- Tray previews and tray state must describe the active icon style and must not expose an unrelated provider name. Fix: show first-four-provider guidance for stacked bars, keep provider selection only for Compact and Donut, and keep the wide stacked-bars preview compact. Prevention: test all three icon previews, the stacked-bars settings layout, and runtime tray selection.

## 2026-08-05

- Tray provider selection needs an explicit preference and a session-only last-provider state. Fix: persist the first/last mode, start each session with the first provider, and record the provider left before Dashboard or History. Prevention: test startup, provider navigation, Dashboard, History, and settings-window synchronization together.

## 2026-08-05

- Tray icon state must follow the first enabled, supported provider in saved listing order on startup and every app view. Fix: remove active-view and quota-ranking selection from the shared tray-state resolver, and cover Dashboard, provider, and History navigation. Prevention: test the tray icon across all navigation routes whenever its provider-selection rule changes.

## 2026-08-05

- The ccusage version bump helper still targeted `host_api.rs` after the host implementation was extracted into `ccusage_host_api.rs`, so a routine pin update failed before editing anything. Fix: point the helper at the extracted source and verify the bump command during every ccusage upgrade. Prevention: version-maintenance scripts must follow the actual source-of-truth file and run in the upgrade gate.

## 2026-08-05

- Instance-scoped provider migration must update both runtime test helper names and TypeScript `Pick<PluginOutput, ...>` boundaries. Fix: keep the helper and selected fields aligned with the new `instanceRef` contract. Prevention: run Rust library tests and frontend typecheck together after changing identity scope.

## 2026-08-03

- History is a non-provider view, but tray state treated it as an unselected Home view and borrowed the lowest provider quota; a valid zero from OpenCode Go therefore appeared as the History icon value. Fix: return an explicit non-provider unknown state and cover the tray preview. Prevention: define tray semantics for every navigation route and test non-provider views with a valid zero quota elsewhere.

- CI tests that format local times must not inherit the runner timezone, and integration tests must isolate unrelated mount-time effects such as updater polling. Fix: inject an optional timezone into reset/tray formatting for deterministic fixtures and mock updater state in the About interaction test. Prevention: run time-sensitive tests under UTC and keep cross-feature integration tests’ external hooks mocked.

## 2026-08-02

- A standalone Tauri window can inherit a different Windows taskbar icon even when the main app bundle and title bar use the correct logo. Fix: explicitly assign the shared bundled app icon in each taskbar-visible `WebviewWindowBuilder`. Prevention: verify title-bar and taskbar branding for every native window created outside the static Tauri config.

## 2026-08-01

- The tray panel's inactivity timer continued while the standalone Settings window was visible, so it hid behind an active settings workflow. Fix: publish explicit Settings open/closed lifecycle events and pause/resume the panel timer across backend and frontend hide paths. Prevention: cross-window UI state changes need lifecycle tests for open, native close, inactivity hide, and handoff hide.

- First-run onboarding copy had a complete German surface even though the product language is Simplified Technical English. Fix: translate headings, statuses, actions, errors, accessibility labels, and provider-specific cookie recovery guidance together. Prevention: when onboarding copy changes, scan every rendered string and its accessible name for mixed-language leftovers.

## 2026-07-31

- Extensionless package-runner probes did not discover Windows npm `.cmd` launchers, and the only detected Bun fallback could exceed the 15-second budget, leaving retained provider history stale. Fix: resolve executable Windows launchers from npm app data and `PATH`, keep the ccusage package version pinned in every argument set, and allow a bounded 30-second cold start. Prevention: runner bumps must verify exact production arguments, Windows launcher discovery, a cold invocation, and returned newest-day data together.

- User-facing tray style names outlived a renderer change: `Plugin` described a Windows number glyph, and `Merged` duplicated `Bars`. Fix: use `Compact`, `Stacked bars`, and `Donut`, and migrate persisted `merged` values to `bars`. Prevention: whenever tray rendering semantics change, verify option labels, accessible names, explanatory copy, and persisted-value migration together.

## 2026-07-29

- A successful provider refresh can still omit optional history when its secondary local-history runner fails; replacing the whole settled output then removes a valid chart and overwrites the disk snapshot. Fix: retain the last authoritative provider history when a successful refresh has no replacement history. Prevention: refresh-state and snapshot-cache tests must cover partial success independently from full probe errors.

- Provider incident state was attached only to sidebar navigation, so a legitimate Statuspage dot had no matching explanation in the open provider card and appeared random. In addition, ambiguous `unknown` Statuspage responses were treated as incidents. Fix: carry `providerStatuses[id]` through the shared provider view model and only flag authoritative incident indicators. Prevention: status UI regressions must assert both the indicator surface and the provider detail/dashboard surface, including unknown input.

## 2026-07-28

- Static History navigation was always rendered and the panel minimum-height calculation undercounted it. Fix: persist an explicit History visibility preference, hide the nav item with a Home fallback, and count Home, optional History, and Settings separately. Prevention: when adding fixed navigation items, test both visibility states and their geometry.

## 2026-07-27

- Release metadata can be aligned while release documentation still points at an older alpha, causing preflight or operator commands to target the wrong version. Prevention: update the current version label, changelog section, README command, and release-gate references together and run the tagged preflight.

- Masked provider logos must not use rounded wrapper elements: the CSS radius clips artwork that reaches the icon bounds. Fix: keep the mask as a plain, fixed-size element and use a separate status dot when needed. Prevention: Settings icon regressions should assert the masked element has no clipping radius.

## 2026-07-24

- Ein optionales Tray-`fraction` kann unbekannte Daten, aktuelle Fehler und retained Data nicht sicher unterscheiden. Fix: semantischen Tray-State vor dem Renderer einführen und genau einen nativen Tray-Schreiber behalten. Prevention: Status-, Auswahl- und Rasterlogik an einer expliziten Zustandsgrenze testen.

- Eine kompakte Windows-Standardglyphe darf bestehende Tray-Stile und Pin-Konfigurationen nicht aus der Settings-Oberfläche entfernen. Fix: `provider` rendert die Zahl, `bars`/`merged`/`donut` bleiben auswählbar und Pin-Vorschauen werden über `providerId:metricLabel` geprüft. Prevention: jede Anzeigeoption und zwei gespeicherte Metriken als Settings-Regression testen.

## 2026-07-24

- A local quality command can claim frontend coverage while Rust gates remain separate and CI can silently downgrade global coverage to reporting. Fix: make `bun run check` aggregate frontend and Rust format/lint checks, name CI coverage as a changed-file ratchet, and expose Rust formatting as a CI step. Prevention: every documented quality gate needs an executable local aggregate and a visibly named CI call site.

- Localhost is not an authentication boundary, and CORS is not access control. Fix: make the local API opt-in, require a bearer token, and allow only explicitly configured browser origins. Prevention: security review must test default startup and direct loopback clients separately.

- Platform-specific secure storage must not report success when no implementation exists. Fix: return an explicit unsupported-platform error for non-Windows provider secrets. Prevention: test the contract on each target or gate platform-specific tests and verify the fallback branch in cross-target CI.

## 2026-07-24

- Large plugin host files hide platform-specific behavior and make lint policy harder to assess. Fix: extract language-server discovery into a sibling module, keep the host API facade stable, and enforce unused caught-error checks with explicit `_error` names. Prevention: split host capabilities by responsibility before adding more orchestration or broad lint exceptions.

## 2026-07-24

- Async probe workers moved plugin data into `spawn_blocking` while the outer task still needed it for join/capacity errors and completion events. Fix: give worker, panic, join, and capacity paths explicit owned clones. Prevention: map ownership per closure before adding async/blocking boundaries.

## 2026-07-24

- Legacy-Executable-Namen im Dev-Wrapper verlängern die Diagnosepfade und können fremde Prozesse adressieren. Fix: Prozessnamen ausschließlich aus der aktuellen Tauri-Konfiguration ableiten und bei fehlender Konfiguration nichts erraten. Prevention: Wrapper-Fallbacks auf historische Produktnamen mit einem Test gegen die aktuelle Produktidentität absichern.

- Long provider hints made onboarding harder to scan, especially when local sign-in and browser-cookie recovery were mixed together. Fix: model recovery as short ordered variants, with Ollama's local `ollama signin` path first and the browser path second. Prevention: onboarding copy should use task steps and variants instead of rendering settings prose verbatim.

## 2026-07-24

- A missing cookie in onboarding only pointed users to later Provider Settings, even though the provider definition already had the secret field and source hint. Fix: render a generic Cookie-header recovery field for every `cookieHeader` definition, save through the existing vault path, and retry immediately. Prevention: when an onboarding failure has an existing editable credential definition, expose the minimal recovery action at the failure point.

## 2026-07-23

- Onboarding ran inside a desktop WebView but still exposed browser context actions, and panel handoff used the cursor when no tray anchor existed. Fix: suppress native context menus at the app entry and use the monitor work area's bottom-right edge for the handoff. Prevention: treat every WebView as a desktop surface and test first-run handoff without a prior tray click.
- Provider onboarding re-ran already successful checks after returning from selection. Fix: cache successful provider IDs for the current onboarding session and only probe new or unresolved selections. Prevention: preserve successful state across navigation within multi-step setup flows.

## 2026-07-23

- Quality gates that exist only as local scripts do not protect CI. Fix: add the Rust lint command to CI and enforce a changed-file coverage ratchet while the global baseline is still below target. Prevention: every repository quality script needs one CI call site or an explicit documented reason.

## 2026-07-22

- Provider-Ausblenden muss Navigation und Dashboard getrennt behandeln. Fix: `hidden` wird separat von `disabled` gespeichert; Hide erscheint nur bei eindeutigem Provider-Kontext (Sidebar-Icon oder Provider-Seite), während das gemeinsame Dashboard aktivierte Provider weiterzeigt. Prevention: Kontextmenüs auf implizite Provider-Fallbacks prüfen.

## 2026-07-22

- Settings provider presentation was coupled to the persisted tray order and exposed the same drag interaction; the first decoupling also dropped the established primary-provider prefix, then pinned legacy `opencode` (OpenCode Zen) instead of visible `opencode-go` (OpenCode). Fix: keep Codex, Claude, Cursor, and `opencode-go` first in Settings, alphabetize the remainder, and keep reordering solely in tray navigation. Prevention: distinguish provider display names from stable IDs and regression-test the real manifest IDs for the complete Settings prefix.

- New ccusage adapters copied only totalTokens and cost, so current provider history showed cost with zero detailed token fields. Fix: map every available token dimension consistently across adapters. Prevention: fixture input/output/cache/reasoning fields whenever adding a ccusage-backed provider.

## 2026-07-22

- Neue Settings-Imports müssen in vollständigen Vitest-Modul-Mocks und in partiellen Mocks mit Tauri-Zugriff ergänzt werden. Fix: `DEFAULT_ACCENT_COLOR` und `loadAccentColor` in Bootstrap-/App-Tests mocken. Prevention: nach jedem neuen Settings-Export alle `@/lib/settings`-Mocks prüfen.

## 2026-07-22

- Accent settings must use the actual former product color (`#bfff00`), not a separate historical light-theme variant. Prevention: identify the user-visible source token before defining migration/options.

## 2026-07-16

- Antigravity OAuth: never embed or submit a Google OAuth client secret or a stored refresh token. Read only the current access token; when it expires or is rejected, require the user to sign in again in Antigravity. Historical secret detections must be removed before a standalone GitHub migration.

Full historical lesson log is archived locally at:

- `tasks/archive/lessons-history-2026-05-18.md`

Keep this file short. Retain only recent or frequently relevant prevention rules. Search the archive only when working near older behavior.

## 2026-07-22

- Alpha 6 dev isolation separated the app-data directory from installed Alpha 5 without a migration, so local preferences and provider secrets appeared reset. Fix: perform a one-time, read-only-source migration from the release sibling directory before startup settings access. Prevention: every new app identifier requires an explicit data migration decision and regression test.

## 2026-08-06

- Light-mode provider icons looked faded because inactive navigation icons used `opacity-70`, and the panel used pure white surfaces. Fix: keep provider identity at full opacity and use a soft neutral light surface. Prevention: express selection through background and active indicators, not provider icon opacity.
- The Green accent used a neon value that had almost no contrast on a light surface. Fix: map it to a dark green for light-mode UI and select button text by contrast. Prevention: verify every user-selectable accent against its active and inactive surface in both themes.

## Current Prevention Rules

- Base UI checkboxes: wrapping visible text does not always name the custom checkbox root. Add an explicit accessible name and select it by role and name in tests.
- Parallel UI tests: keep each async test focused on one interaction outcome. Long multi-action sequences can exceed Vitest's timeout only under full coverage load.
- Vitest lifecycle hooks: do not return a mock from `beforeEach`; use a block so Vitest cannot treat the mock as a cleanup callback.
- Numeric provider data: reject `null`, `undefined`, and empty strings before `Number(...)`; they are missing values, not authoritative zero.
- Pricing overrides: require both fields and reject negative values before converting or saving; `Number("")` must not create a zero-price override.

- Provider percentage math: normalize floating-point results before output. Keep authoritative zero distinct from missing data, and never emit a progress line with a zero limit.

- Stacked tray bars must use the first four primary providers. Do not let legacy metric pins reduce the bar set after the pin controls are removed.
- Stacked-bar tooltips must list provider percentages. Do not reuse the detailed single-provider tooltip for the multi-provider bar style.

- Prerelease updater checks: a missing unsigned `latest.json` makes Tauri `check()` reject before GitHub discovery runs. Catch updater-manifest failures, then query the GitHub release API; only report an error when both sources fail. Add a regression test for the next alpha candidate.

- Update checks must render their transient `checking` and `up-to-date` states; otherwise a successful manual check looks like a no-op. Prevention: add footer assertions for every user-visible `UpdateStatus` variant.
- A nested version-button context-menu handler must stop propagation before the panel's provider menu handler runs. Prevention: test the footer inside a parent `onContextMenu` boundary.

- Frontend About assets: verify every absolute image URL has a tracked Vite `public` asset; a missing favicon silently renders as a broken image in the dialog.

- ccusage source expansion: keep the runner namespace list aligned with the upstream focused commands, and add a first-class local-history plugin when a named source has no provider card; a host mapping alone cannot render a graph.

- External usage runners: a green mocked plugin test does not prove the pinned package is executable. For ccusage bumps, run the exact production package-manager command against a local provider fixture or real local history before release.
- Package-runner fallbacks: exhaust every runner with the authoritative current package before trying a legacy package; one corrupt runner cache must not silently select an older parser with different accounting semantics.

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
- Plugin capabilities: host API defaults are deny-by-default, so every plugin manifest must declare `capabilities` and each required API explicitly. Reject unknown capability names in the manifest contract test.
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
- OpenCode Go quotas: local SQLite spend is machine-local and must not drive account quota windows. Read `rolling`, `weekly`, and `monthly` percentages from `/zen/go/v1/usage` with the local `opencode-go` Bearer key; keep SQLite and `ccusage` for local history.
- Settings store selectors: select only values actually read by the component. For cross-window preference propagation, action setters can be selected without also selecting display values already read by child/store-connected components.
- Vitest module mocks: values referenced by a `vi.mock` factory must be created with `vi.hoisted`; top-level `const` mocks are still uninitialized when the factory runs.
- Alpha Windows prerelease builds: do not use Tauri `--bundles all` with semver prerelease versions. MSI/WiX rejects non-numeric prerelease identifiers like `alpha.3`; build prerelease installers with `--bundles nsis` unless the MSI versioning scheme is changed.
- Provider order persistence: startup normalization must preserve any valid saved provider order. Apply default prefix/alphabetical ordering only when no saved order exists; append newly discovered providers after the saved order.
- Constrained sidebar actions: never leave a critical bottom action in a vertically shrinking flex stack. Keep controls `shrink-0`; make only the variable-length item list scroll.
- SVG chart interactions: scale a nested point group after translating an outer group; CSS `transform` on the translated group can replace its SVG position transform. Keep the translation and hover scale in separate layers.
- Native storage boundaries: notification and reporting settings helpers must short-circuit when `isTauri()` is false so browser previews and Vitest never instantiate Tauri `LazyStore` or invoke native IPC.
- NSIS environment hooks: do not round-trip a potentially long user `PATH` through NSIS `ReadRegStr`/`WriteRegExpandStr`; use a full-width Windows registry API path (PowerShell here) or the installer truncates the user's PATH at the NSIS string limit.
- Copilot plan metadata: `access_type_sku: free_limited_copilot` can coexist with authoritative token-based `quota_snapshots`; select available current snapshots before free-tier classification, and fixture both fields together.
- Settings provider navigation: a provider-row callback reused the tray handoff option, so selecting a row hid Settings instead of opening its detail panel. Keep tray reveal as an explicit detail action and test row selection without options.
- Alpha 5 release verification exposed four stale `App` UI assertions after the tray-footer/settings refinement. Fix: assert the current accessible footer label and explicit tray action. Prevention: whenever a user-visible interaction is renamed or moved, update all integration tests that target its accessible role/name in the same change.
- Plugin bundling: a manifest can require an icon that source control no longer contains, causing the dev wrapper to fail after the bundler entrypoint is restored. Prevention: run the source-to-bundle command from a clean checkout and keep manifest assets in the provider package.
- Vite startup: a healthy dev server can still serve HTTP 404 at the Tauri `devUrl` when the repo has no root `index.html`. Prevention: keep the HTML entrypoint tracked and assert its main-module mount in the startup smoke tests.
- Frontend checkout completeness: a tracked app entry can import production modules that are absent from the checkout without Git reporting deletions. Prevention: run the frontend production build after restoring/merging checkpoint work and treat unresolved-import errors as missing-source inventory findings.
- Dev/release isolation: a local Tauri build sharing the release identifier also shares settings, secrets, cache, WebView data, and logs with the installed app. Prevention: force a tracked dev-only identifier as the final `--config` override and test the config order.
- Provider icon integrity: an existing manifest asset can still be a generated text fallback. Prevention: startup smoke coverage must reject `<text>` placeholder SVGs; provider packages keep the real `currentColor` artwork.
- History calendar days: a provider-local midnight serialized as UTC can fall on the previous UTC date. Group and label history using the history source time zone; never derive a calendar day by slicing an ISO timestamp.
- Alpha 6 line helpers: shared grouping code must preserve the input line type because manifest skeleton rows and runtime metric rows have different contracts. Prevention: type helpers against the smallest shared shape and add a manifest-shaped regression case.
- TypeScript target compatibility: avoid newer built-ins such as `Array.prototype.at` when the configured lib target is ES2020. Prevention: check tsconfig lib/target before using standard-library APIs.
- Local HTTP API CORS: removing the wildcard default breaks existing browser clients even when documented. Preserve the legacy default and make an explicit allowed-origin value the restrictive mode; add tests for both paths.
- Provider order updates: preserve existing drag order, but place newly discovered providers between their sorted neighbors instead of blindly appending them. Add a normalization regression test for the new-provider path.
- Primary provider order: keep the four product-priority providers (`codex`, `claude`, `cursor`, `opencode`) ahead of the alphabetical remainder. Prevention: test the full default prefix whenever its membership changes.
- Legacy provider order: when a provider was persisted by an old append-to-end default, repair only the recognizable generated order; preserve arbitrary user drag order. Prevention: add a regression fixture for persisted orders created before provider-order fixes.
- Used metric labels: progress values in `used` mode had no textual mode label, while `left` values were explicitly labeled. Use one shared display suffix and test every supported format in both modes.
- Provider/account probe identity: stamping an output after reading mutable provider settings is too late; an old in-flight probe can still replace the newly selected account. Capture `ProviderInstanceRef` at batch start, pass it into the plugin context, and reject mismatched results. Add an out-of-order account-switch regression whenever a provider gains account selection.
- Provider icon colors: CSS masks keep only SVG shape alpha and discard provider colors. Declare multicolor artwork in the manifest and render it as an image; keep brand-color masks for monochrome artwork.
- Provider wordmarks: use a black brand color when the logo must be monochrome, then map it to white in dark mode. Prefer a provider-supplied square asset when available; use natural-fit sizing only for providers that require a rectangular wordmark.
- Sidebar scroll ownership: a flex item around the provider list can grow past the panel even when its inner list has `overflow-y-auto`. Put the variable-length list in the flex item and keep bottom actions outside the scroller.
- Sidebar height chain: `min-h-0` does not create a definite cross-axis height. Give the row and sidebar `h-full`, then size the panel from fixed navigation controls only; provider count belongs in the scrollable list.
- Sidebar footer grouping: a fixed action after a scrollable icon list needs its own spacing and separator. Keep Settings in a shrink-resistant footer zone so it does not look like another provider.
- External multicolor SVGs: `currentColor` in an `<img>` does not inherit app text color, and SVG media queries do not follow a forced app theme. Expose a theme-specific icon asset and select it from the app theme state.
- Tray window corners: CSS `border-radius` cannot cut the corners of an opaque native window. Make the tray window transparent and keep the rounded panel as the visible surface; use an opaque background only for standalone Settings. On Windows, native shadow on an undecorated window also adds a 1px white border, so keep it disabled when the panel uses its own border.
- Rust release cache: exclude version-only `Cargo.toml` changes from the key. Share a lockfile-keyed release cache between main CI and release builds.
- Cargo target reuse: `--bin usagebar-cli` already compiles its library dependency. Do not add `--lib`; verify reuse with the next app build because changed Tauri build-script inputs can still compile the package again.
- NSIS stale uninstall entries: deleting the install folder does not delete the Windows uninstall registry key. Before installation, remove the UsageBar key only when its registered uninstaller is missing; never treat app data deletion as an uninstall.
- Panel height jitter: ResizeObserver measurements within 25 px caused native bounds updates and visible shaking. Fix: ignore small decreases, apply every increase, and use five short tween steps for larger changes. Prevention: test both directions at the 25 px boundary.
- Update footer state typing: the footer read a removed `error` field from the `available` update state, so Vitest passed while TypeScript failed. Keep UI branches aligned with the discriminated union and run typecheck after state changes.
- Scroll fade jitter: panel tween steps changed the scroll container height and toggled the bottom fade between measurements. Fix: ignore scroll-state updates during the tween and measure again after it ends. Prevention: test the fade state across a multi-step panel resize.
- Tray panel anchor: tray-icon midpoint and Y position can be unreliable while Windows reserves a bottom taskbar area. Fix: use the work-area bottom as the stable bottom anchor. Prevention: test anchor choice against monitor and work-area geometry.
- History totals: aggregators turned omitted provider metrics into zero, and CLI text called fully unknown rows `0 usage`. Fix: emit nullable complete totals across the frontend, CLI, and HTTP API, and preserve explicit zero. Prevention: test missing and authoritative zero metrics at every output boundary.
- Reduced motion: continuous update-beam and arrange-mode animations bypassed the existing reduced-motion rules. Fix: disable both animations with the shimmer rule. Prevention: audit every new `animation` declaration against `prefers-reduced-motion`.
- Async feedback accessibility: settings and update states rendered visible text without a semantic live-region role, so assistive technology could miss changes. Fix: use `role="status"` for routine updates and `role="alert"` for errors, and test both roles. Prevention: every new async feedback message needs an announcement role in the same change.
- Muted surface contrast: the About version badge used muted text on a muted background and measured below 4.5:1 in both themes. Fix: use the foreground token for badge text. Prevention: remeasure text against its actual rendered surface in light and dark themes.
- Settings control semantics: custom radio-role buttons lacked arrow-key and roving-focus behavior, and provider rows combined selection with a checkbox. Use the Base UI radio group and separate row, checkbox, and show controls. Prevention: test composite keyboard behavior and query each independent control by its accessible name.
- Probe execution limits: a QuickJS loop can keep its blocking worker and shared probe batches active forever. Set runtime memory, stack, and interrupt limits; apply a worker deadline; and complete the coordinator instance on timeout.
- Base UI checkbox labels: keep custom checkbox roles outside `<label>` elements, use an explicit `id`/`htmlFor` pair, and preserve caller naming props so generated `aria-labelledby` cannot override them.
- Usage notifications: native permission or delivery failures must not disappear silently. Keep the Windows toast path, show an accessible in-app fallback, and provide a test notification in Settings.
- Notification test actions: use the production event title and body so manual verification exercises the real warning content.
- Settings copy: remove heading summaries when controls already explain the setting. Keep only risk, credential, and provider-behavior guidance.
- Anti-Slop scope: generic rules flagged valid JavaScript provider guards and loose test mocks. Limit Oxlint Anti-Slop to production TypeScript and keep parser exceptions contract-aware; run ESLint for JavaScript and tests.
