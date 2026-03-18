# Windows

Canonical Windows fork notes for provider rollout + verification.

## What "working on Windows" means

A provider is only **working on Windows** when all of the following are true:

- The provider is surfaced in Settings and can be enabled.
- The provider can complete at least one successful probe on a real Windows machine.
- The provider has a clear setup path in the provider detail view.
- The provider fails with an actionable error when auth/session data is missing or expired.
- The provider has at least one focused automated test for its Windows-specific lookup path or failure mode.
- The provider is included in the backend Windows support list, not just documented.

## Shared workstreams

These unblock multiple providers and should happen before broad provider expansion:

### Replace the hardcoded Windows whitelist (done)

- Windows support + surfacing are driven by `platformSupport.windows` in each `plugin.json`.
- `list_plugins` and Windows probe eligibility both resolve from the same manifest metadata.

Remaining requirement:

- No provider support decision is duplicated between Rust and frontend filtering.

### Standardize Windows auth/session discovery

- Normalize Windows path resolution for `%APPDATA%`, `%LOCALAPPDATA%`, roaming SQLite stores, and user-home paths.
- Document exact Windows auth sources per provider.
- Add regression tests for each Windows-only lookup path.
- Add shared setup/source primitives for recurring modes: `automatic`, `oauth`, `manual cookie`, `api token`.

Done when:

- Every Windows-supported provider has one documented primary auth source and one tested fallback path (if a fallback exists).

### Provider verification harness

Use the checklist below before upgrading any provider from experimental/blocked to working.

## Provider verification checklist

Verify the same four things every time:

1. The provider is surfaced correctly in the UI.
2. The expected Windows auth/session source is discovered.
3. Failure modes are actionable.
4. Logs and regression coverage exist for the Windows-specific path.

### Setup

- Confirm the provider appears in Settings with the expected support label.
- Enable the provider if it is not already enabled.
- Clear any stale provider secret/config entries that could hide the real Windows path being tested.

### Happy path

- Sign in using the provider's intended Windows auth source.
- Trigger a manual refresh.
- Confirm at least one successful probe.
- Capture which Windows path or credential source was actually used.

### Failure path

Test at least one missing-auth case and one stale/expired-auth case when the provider has those states.

- Missing auth should explain what the user needs to do next.
- Expired/stale auth should not collapse into a generic "not found" message.
- Unsupported Windows states should stay disabled instead of probing indefinitely.

### Evidence

- Save the exact provider log snippet (or a short summarized snippet) used to validate the path.
- Add or update one focused automated test for the Windows-specific discovery rule or failure mode.
- Update the provider doc with the Windows path and current support state.

#### Result template

Record these fields in the relevant provider doc or rollout note:

- Windows auth source:
- Windows fallback path:
- Successful probe observed:
- Missing-auth error observed:
- Expired/stale-auth error observed:
- Regression test:
- Remaining gaps:

## Provider matrix (Windows state)

| Provider | Current Windows State | Priority | Main Blocker |
|---|---|---:|---|
| Antigravity | Working but needs more runtime confidence | P0 | real-world validation of grouped quota behavior |
| Claude | Partially working | P0 | Windows auth/session parity incomplete |
| Codex | Working | P0 | broader runtime validation and doc alignment |
| Cursor | Partially working | P0 | account-state variance across free/trial/paid/team/enterprise |
| Ollama | Working v1 | P0 | only manual cookie mode exists |
| OpenCode | Experimental | P1 | browser import + real-world cookie/workspace validation |
| Amp | Experimental | P2 | real signed-in Windows validation |
| Copilot | Experimental | P2 | real free/paid validation plus broader multi-account runtime evidence |
| Gemini | Experimental | P2 | real signed-in Windows validation after CLI-path hardening |
| JetBrains AI Assistant | Working on Windows | P1 | broader IDE/account variance beyond current local XML path coverage |
| Kimi Code | Not started for Windows | P2 | verify Windows credential/file locations |
| MiniMax | Not started for Windows | P2 | verify Windows session source and auth refresh path |
| Factory / Droid | Not started for Windows | P3 | WorkOS auth storage and refresh behavior on Windows |
| Z.ai | Not started for Windows | P3 | Windows credential/session source unknown |
| Windsurf | Experimental | P2 | broader real-account/runtime validation after Windows LS + cloud path port |
| Perplexity | Not started for Windows | P4 | macOS app-cache dependency |

## Recommended rollout order

### Phase 1: stabilize already-supported providers

- Codex
- Cursor
- Claude
- Antigravity
- Ollama

### Phase 2: resolve product/UI contradictions

- OpenCode

### Phase 3: land lower-risk Windows ports

- Copilot
- Gemini
- Amp
- JetBrains AI Assistant
- Windsurf
- Kimi Code
- MiniMax

### Phase 4: land medium-complexity auth providers

- Factory / Droid
- Z.ai

### Phase 5: tackle remaining platform-heavy ports

- Perplexity

## Current Windows TODO (product)

- Panel anchoring is still too mac-like: it behaves top-aligned, but on Windows the taskbar is usually at the bottom. The panel should stay bottom-anchored to the taskbar/tray edge and grow upward as its height changes.
- Antigravity is currently showing `100% left` all the time and needs a Windows-specific fix for real remaining-usage calculation.
- Logged-out or currently unavailable providers should not be auto-removed from the sidebar. Availability state should affect how they are shown/toggled in Settings, not whether they disappear from navigation entirely.

Follow-up:

- Recheck Cursor behavior across free, trial, and paid accounts on Windows.
- Continue improving Claude Windows auth/session detection.
- Finish Windows-specific window polish and tray interaction details.

## Links

- Upstream Windows roadmap: https://github.com/robinebers/openusage/issues/77
- Upstream OAuth API issue: https://github.com/robinebers/openusage/issues/71
- Copilot multi-account issue: https://github.com/robinebers/openusage/issues/280
- `ccusage`: https://github.com/ryoppippi/ccusage
- `CodexBar`: https://github.com/steipete/CodexBar

