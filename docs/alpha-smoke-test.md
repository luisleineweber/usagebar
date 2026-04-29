# Alpha Smoke Test

Use this before publishing Alpha 1. The goal is to prove that a stranger can install UsageBar, configure one strong provider, understand failures, and report issues without leaking secrets.

## Scope

- Primary provider for Alpha 1 smoke: `Codex`
- Fallback provider if Codex auth is not available: `Cursor`
- Platform: Windows
- Build type: GitHub prerelease asset or local NSIS setup `.exe`

Do not promote Alpha 1 until every checked item has either a pass result or a documented blocker in `tasks/todo.md`.

## Install

- [ ] Install from `UsageBar_*_x64-setup.exe`.
- [ ] Launch from Start menu or tray.
- [ ] Confirm no terminal window appears during normal startup.
- [ ] Confirm Settings opens.
- [ ] Confirm app data directory exists at `%APPDATA%\com.sunstory.usagebar`.
- [ ] Confirm logs directory exists at `%APPDATA%\com.sunstory.usagebar\logs` after launch or first log write.

## First Provider Setup

### Codex Happy Path

- [ ] Open Settings > Providers.
- [ ] Select `Codex`.
- [ ] Confirm the provider shows enabled state and setup guidance.
- [ ] If local Codex auth exists, click `Retry`.
- [ ] Confirm Runtime status becomes `Provider responded successfully.`.
- [ ] Confirm Last success shows a timestamp, not `No successful probe yet`.
- [ ] Click `Open in tray`.
- [ ] Confirm the tray panel opens on Codex.
- [ ] Confirm usage lines are understandable without provider docs open.

Record:

```text
Build:
Provider:
Auth source used:
Last success timestamp:
Usage/cost source shown:
Remaining ambiguity:
```

### Cursor Fallback Path

Use this only if Codex auth is unavailable on the test machine.

- [ ] Open Settings > Providers.
- [ ] Select `Cursor`.
- [ ] Confirm the provider explains local auto-detection.
- [ ] Click `Retry`.
- [ ] Confirm success or an actionable auth error.
- [ ] Confirm Last success updates on success.
- [ ] Open the provider in tray and confirm the panel remains stable.

## Failure States

Verify at least the states that are safe to trigger on the test machine.

- [ ] No providers enabled: app shows an understandable empty/setup state.
- [ ] Provider disabled: provider disappears from active tray rotation but remains available in Settings.
- [ ] Refresh in progress: Retry button disables or shows spinner.
- [ ] Recent manual refresh: repeat refresh respects cooldown.
- [ ] Missing auth: error tells the user which provider action is needed.
- [ ] Invalid/stale auth when safe to simulate: error is specific, not generic `Provider failed`.
- [ ] Network offline or blocked request when safe to simulate: error says to check connection and app does not crash.
- [ ] Empty usage data: app shows empty state or zero usage without crashing.

Record:

```text
Failure state:
How simulated:
Observed message:
Crash or UI break:
Follow-up needed:
```

## Secret Handling

For a provider with a manual secret field, such as Ollama, OpenRouter, or Synthetic:

- [ ] Saving an empty secret is rejected before storage.
- [ ] Saving a test secret shows `Secret stored securely for this app.`.
- [ ] The secret value is not shown again after saving.
- [ ] `Clear secret` removes the stored-secret indicator.
- [ ] Logs do not include the raw secret.
- [ ] Bug report docs warn users not to attach API keys, cookies, raw credential files, or `provider-secrets.json`.

## Feedback Path

- [ ] Settings contains an issue/report action or README links clearly to GitHub Issues.
- [ ] `docs/bug-reports.md` asks for app version, Windows version, provider, error text, timestamp, and sanitized logs.
- [ ] Copied or attached debug info excludes API keys, cookies, and app-owned provider secret files.

## Release Notes Check

- [ ] `CHANGELOG.md` has the exact alpha version section.
- [ ] Release notes list supported providers tested in this smoke pass.
- [ ] Release notes list known limitations and experimental providers honestly.
- [ ] Privacy note matches current code behavior.
- [ ] Feedback link points to `https://github.com/Loues000/usagebar/issues/new`.
