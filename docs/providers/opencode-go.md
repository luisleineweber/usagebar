# OpenCode

> Uses OpenCode's official Go usage API for account-wide quota windows.

OpenCode has two similarly named products, and UsageBar surfaces them in one provider:

- `OpenCode Go`: subscription model access with 5-hour, weekly, and monthly quota windows.
- `OpenCode Zen`: pay-as-you-go model access. You add balance and are charged per request.

This page is for the visible OpenCode provider. Go quota windows come from the official usage API.
SQLite and `ccusage` remain local-history sources. Zen balance support still exists as a hidden
compatibility path for older saved cookies or environment-based setups.

## Overview

- **Go quota source:** `https://opencode.ai/zen/go/v1/usage`
- **Auth discovery:** `~/.local/share/opencode/auth.json`
- **Local history:** `~/.local/share/opencode/opencode.db` and `ccusage`
- **Provider ID:** `opencode-go`
- **Usage scope:** local observed assistant spend against Go subscription limits only

## Detection

The plugin enables when either condition is true:

- `~/.local/share/opencode/auth.json` contains an `opencode-go` or current `opencode` entry with a non-empty `key`
- local OpenCode history already contains `opencode-go` or current `opencode` assistant messages with numeric `cost`

If neither signal exists, the plugin stays hidden. When an `opencode-go` key exists, UsageBar calls the
official usage API. The API response, not local history or auth metadata, decides whether Go quota
windows are available.

## Optional Zen Balance Compatibility

OpenCode Zen used to exist as a separate experimental provider. It is now folded into this provider as an optional `Zen balance` line.

The visible Settings UI and overview card are intentionally local-history only. If an older setup already has an OpenCode cookie secret saved, or if `OPENCODE_COOKIE_HEADER` is set, UsageBar can still try to show the Zen balance line on the provider detail view. `OPENCODE_WORKSPACE_ID` remains available as an advanced workspace override when auto-discovery chooses the wrong workspace.

This keeps the legacy balance line working without making new OpenCode Go users copy DevTools Cookie headers for the main subscription-limit view.

When the optional Zen balance line is shown, it also adds detail-only provenance lines:

| Line              | Value                                                                                |
| ----------------- | ------------------------------------------------------------------------------------ |
| `Zen source`      | `OpenCode Zen signed-in website billing session`                                     |
| `Zen auth source` | `Stored Cookie header`, `OPENCODE_COOKIE_HEADER`, or `Legacy keychain Cookie header` |
| `Zen endpoint`    | `https://opencode.ai/_server`                                                        |

## Data Source

UsageBar reads local OpenCode history for local history views and Free request counting:

```sql
SELECT
  CAST(COALESCE(json_extract(data, '$.time.created'), time_created) AS INTEGER) AS createdMs,
  CAST(json_extract(data, '$.cost') AS REAL) AS cost
FROM message
WHERE json_valid(data)
  AND json_extract(data, '$.providerID') IN ('opencode-go', 'opencode')
  AND json_extract(data, '$.role') = 'assistant'
  AND json_type(data, '$.cost') IN ('integer', 'real')
```

Assistant messages with numeric `cost` remain local records only. Free-model assistant messages with
`cost: 0` are counted as requests for the Free 5-hour request limit. Missing remote or other-device
usage is not estimated in local history.

UsageBar displays the provider plan as either `GoSubscription` or `Free`. It renders the paid Go `5h`,
`Weekly`, and `Monthly` bars only after the usage API returns valid windows. A 403 `EntitlementError`
means that the key has no Go subscription. Free-mode counting includes free model rows such as
`*-free` and `big-pickle`; paid Go model rows are ignored.

## Limits

The usage API returns the account-wide percentage for each window. UsageBar displays that value with a
provider-owned limit of `100%` and uses the API reset time.

For Free usage, OpenUsage uses the published Free 5-hour request limit:

- `5h`: `200 requests`

Free accounts are not mapped onto the `$12/$30/$60` Go dollar limits. UsageBar defaults to `Free` unless it finds positive `GoSubscription` evidence.

## Window Rules

- `5h`, `Weekly`, and `Monthly`: the `rolling`, `weekly`, and `monthly` windows returned by
  `GET https://opencode.ai/zen/go/v1/usage`
- Each window uses its API-provided `resetsAt` value.

## Failure Behavior

If the usage API fails, UsageBar reports the API error. Local SQLite failures do not remove valid Go
quota windows; they only affect local history output.

## Windows setup

1. Use OpenCode Go on this machine or sign in so `~/.local/share/opencode/auth.json` contains an
   `opencode-go` key.
2. Confirm that `~/.local/share/opencode/opencode.db` exists once local history has been created.
3. Enable the OpenCode Go provider in Settings and refresh.

The API key is sent as `Authorization: Bearer …` to the usage endpoint. No browser cookie is needed for
Go quota windows.
