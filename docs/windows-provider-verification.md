# Windows Provider Verification

Use this checklist before upgrading any provider from experimental or blocked to "working on Windows".

## Goal

Verify the same four things every time:

1. The provider is surfaced correctly in the UI.
2. The expected Windows auth/session source is discovered.
3. Failure modes are actionable.
4. Logs and regression coverage exist for the Windows-specific path.

## Shared Checklist

### 1. Setup

- Confirm the provider appears in Settings with the expected support label.
- Enable the provider if it is not already enabled.
- Clear any stale provider secret/config entries that could hide the real Windows path being tested.

### 2. Happy Path

- Sign in using the provider's intended Windows auth source.
- Trigger a manual refresh.
- Confirm at least one successful probe.
- Capture which Windows path or credential source was actually used.

### 3. Failure Path

Test at least one missing-auth case and one stale/expired-auth case when the provider has those states.

- Missing auth should explain what the user needs to do next.
- Expired/stale auth should not collapse into a generic "not found" message.
- Unsupported Windows states should stay disabled instead of probing indefinitely.

### 4. Evidence

- Save the exact provider log snippet or summarized log output used to validate the path.
- Add or update one focused automated test for the Windows-specific discovery rule or failure mode.
- Update the provider doc with the Windows path and the current support state.

## Result Template

Record these fields in the relevant provider doc or rollout note:

- Windows auth source:
- Windows fallback path:
- Successful probe observed:
- Missing-auth error observed:
- Expired/stale-auth error observed:
- Regression test:
- Remaining gaps:

## JetBrains AI Assistant

Current Windows validation targets:

- `~/AppData/Roaming/JetBrains/<IDE>/options/AIAssistantQuotaManager2.xml`
- `~/AppData/Roaming/Google/AndroidStudio*/options/AIAssistantQuotaManager2.xml`
- Case-insensitive IDE directory matching
- Missing quota file after sign-in but before first AI Assistant usage

## Gemini

Current Windows validation targets:

- `~/.gemini/settings.json`
- `~/.gemini/oauth_creds.json`
- `~/AppData/Roaming/npm/node_modules/@google/gemini-cli/node_modules/@google/gemini-cli-core/dist/src/code_assist/oauth2.js`
- `~/AppData/Roaming/npm/node_modules/@google/gemini-cli-core/dist/src/code_assist/oauth2.js`
- Expired-token refresh through the Windows CLI install path

## Copilot

Current Windows validation targets:

- `~/AppData/Roaming/GitHub CLI/hosts.yml`
- `gh auth status` and `gh auth switch` active-account alignment
- Account-specific keychain entry `gh:github.com:<login>`
- Free-tier and paid-tier response shapes from `copilot_internal/user`
