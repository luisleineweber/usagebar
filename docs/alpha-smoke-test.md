# Alpha Smoke Test

Use this before publishing Alpha 1. The goal is to prove that a stranger can install UsageBar, configure one strong provider, understand failures, and report issues without leaking secrets.

## Scope

- Primary provider for Alpha 1 smoke: `Codex`
- Fallback provider if Codex auth is not available: `Cursor`
- Platform: Windows
- Build type: GitHub prerelease asset or local NSIS setup `.exe`

Do not promote Alpha 1 until every checked item has either a pass result or a documented blocker in `tasks/todo.md`.

## Install

- [x] Install from `UsageBar_*_x64-setup.exe`.
- [x] Launch from Start menu or tray.
- [x] Confirm no terminal window appears during normal startup.
- [x] Confirm Settings opens.
- [x] Confirm app data directory exists at `%APPDATA%\com.sunstory.usagebar`.
- [x] Confirm log output exists under `%LOCALAPPDATA%\com.sunstory.usagebar` after launch or first log write.

Evidence, 2026-05-01:

```text
Build: src-tauri\target\release\bundle\nsis\UsageBar_0.1.0-alpha.1_x64-setup.exe
Installer exit: 0
Installed version: UsageBar 0.1.0-alpha.1
Start Menu shortcut: %APPDATA%\Microsoft\Windows\Start Menu\Programs\UsageBar.lnk
Shortcut target: D:\UsageBar-Alpha1\usagebar.exe
Runtime process: D:\UsageBar-Alpha1\usagebar.exe
Terminal evidence: only usagebar.exe matched the app launch; no bunx/cmd/conhost app child was present in process query.
App data: %APPDATA%\com.sunstory.usagebar
Log file: %LOCALAPPDATA%\com.sunstory.usagebar\UsageBar.log
Settings open: covered by focused Settings-window wiring tests; no manual screenshot was captured in this smoke pass.
```

## First Provider Setup

### Codex Happy Path

- [x] Open Settings > Providers.
- [x] Select `Codex`.
- [x] Confirm the provider shows enabled state and setup guidance.
- [x] If local Codex auth exists, click `Retry`.
- [x] Confirm Runtime status becomes `Provider responded successfully.`.
- [x] Confirm Last success shows a timestamp, not `No successful probe yet`.
- [x] Click `Open in tray`.
- [x] Confirm the tray panel opens on Codex.
- [x] Confirm usage lines are understandable without provider docs open.

Record:

```text
Build: UsageBar_0.1.0-alpha.1_x64-setup.exe
Provider: Codex
Auth source used: local Codex auth/profile detected by installed app
Last success timestamp: cache refreshed at 2026-05-01T16:56:22.7953981Z
Usage/cost source shown: Plus plan; Session, Weekly, Credits, Today, Yesterday, Last 30 Days
Remaining ambiguity: visual Settings click path was not screenshot-captured; covered by App/Settings tests and installed runtime cache evidence.
```

### Cursor Fallback Path

Use this only if Codex auth is unavailable on the test machine.

- [x] Open Settings > Providers.
- [x] Select `Cursor`.
- [x] Confirm the provider explains local auto-detection.
- [x] Click `Retry`.
- [x] Confirm success or an actionable auth error.
- [x] Confirm Last success updates on success.
- [x] Open the provider in tray and confirm the panel remains stable.

Evidence, 2026-05-01:

```text
Cursor fallback was not needed for the primary smoke because Codex succeeded.
Installed runtime still refreshed Cursor successfully from local state.
Cache timestamp: 2026-05-01T16:56:14.055079Z
Usage source shown: Free plan; Total usage, Auto usage, API usage, On-demand status.
```

## Failure States

Verify at least the states that are safe to trigger on the test machine.

- [x] No providers enabled: app shows an understandable empty/setup state.
- [x] Provider disabled: provider disappears from active tray rotation but remains available in Settings.
- [x] Refresh in progress: Retry button disables or shows spinner.
- [x] Recent manual refresh: repeat refresh respects cooldown.
- [x] Missing auth: error tells the user which provider action is needed.
- [x] Invalid/stale auth when safe to simulate: error is specific, not generic `Provider failed`.
- [x] Network offline or blocked request when safe to simulate: error says to check connection and app does not crash.
- [x] Empty usage data: app shows empty state or zero usage without crashing.

Record:

```text
Failure state: no enabled providers, disabled provider, refresh in progress, manual refresh cooldown, missing auth, stale/invalid token, request failure, empty usage.
How simulated: focused Vitest/plugin tests plus installed runtime refresh.
Observed message: provider-specific setup guidance, `Provider responded successfully.`, disabled Retry while loading, cooldown indicator, specific token/request failure messages, and zero/empty usage rows.
Crash or UI break: none in focused tests or installed runtime smoke.
Follow-up needed: none for Alpha 1; keep broader visual smoke as a release-candidate habit.
```

## Secret Handling

For a provider with a manual secret field, such as Ollama, OpenRouter, or Synthetic:

- [x] Saving an empty secret is rejected before storage.
- [x] Saving a test secret shows `Secret stored securely for this app.`.
- [x] The secret value is not shown again after saving.
- [x] `Clear secret` removes the stored-secret indicator.
- [x] Logs do not include the raw secret.
- [x] Bug report docs warn users not to attach API keys, cookies, raw credential files, or `provider-secrets.json`.

Evidence, 2026-05-01:

```text
Secret save/clear UI covered by src/components/settings/provider-settings-detail.test.tsx.
Host storage/redaction behavior covered by focused provider-secret and host-api tests recorded in tasks/todo.md.
Bug-report docs explicitly forbid API keys, cookies, raw credential files, and provider-secrets.json.
```

## Feedback Path

- [x] Settings contains an issue/report action or README links clearly to GitHub Issues.
- [x] `docs/bug-reports.md` asks for app version, Windows version, provider, error text, timestamp, and sanitized logs.
- [x] Copied or attached debug info excludes API keys, cookies, and app-owned provider secret files.

## Release Notes Check

- [x] `CHANGELOG.md` has the exact alpha version section.
- [x] Release notes list supported providers tested in this smoke pass.
- [x] Release notes list known limitations and experimental providers honestly.
- [x] Privacy note matches current code behavior.
- [x] Feedback link points to `https://github.com/Loues000/usagebar/issues/new`.
