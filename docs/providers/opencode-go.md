# OpenCode

> Uses local OpenCode history from SQLite to track observed OpenCode Go subscription-limit usage on this machine.

OpenCode has two similarly named products, and UsageBar surfaces them in one provider:

- `OpenCode Go`: subscription model access with 5-hour, weekly, and monthly dollar-value limits.
- `OpenCode Zen`: pay-as-you-go model access. You add balance and are charged per request.

This page is for the visible OpenCode provider. Go usage is local-history based; Zen balance is optional and uses a signed-in `opencode.ai` billing session when configured.

## Overview

- **Source of truth:** `~/.local/share/opencode/opencode.db`
- **Auth discovery:** `~/.local/share/opencode/auth.json`
- **Provider ID:** `opencode-go`
- **Usage scope:** local observed assistant spend against Go subscription limits only

## Detection

The plugin enables when either condition is true:

- `~/.local/share/opencode/auth.json` contains an `opencode-go` or current `opencode` entry with a non-empty `key`
- local OpenCode history already contains `opencode-go` or current `opencode` assistant messages with numeric `cost`

If neither signal exists, the plugin stays hidden. If auth exists but no local Go usage history exists yet, UsageBar shows a neutral status instead of zero-filled allowance bars because the same local auth file can exist for Zen without proving an active Go subscription.

## Optional Zen Balance

OpenCode Zen used to exist as a separate experimental provider. It is now folded into this provider as an optional `Zen balance` line.

To show Zen balance, paste a signed-in `opencode.ai` billing Cookie header in Settings and set a workspace ID only when auto-discovery chooses the wrong workspace.

## Data Source

OpenUsage reads the local OpenCode SQLite database directly:

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

Only assistant messages with numeric `cost` count for paid Go usage. Free-model assistant messages with `cost: 0` are counted as requests for the Free 5-hour request limit. Missing remote or other-device usage is not estimated.

## Limits

OpenUsage uses the current published OpenCode Go subscription limits from the official docs:

- `5h`: `$12`
- `Weekly`: `$30`
- `Monthly`: `$60`

Bars show observed local spend as a percentage of those fixed limits and clamp at `100%`.

For Free usage, OpenUsage uses the published Free 5-hour request limit:

- `5h`: `200 requests`

Free models have zero local dollar cost, so they are not mapped onto the `$12/$30/$60` Go dollar limits.

## Window Rules

- `5h`: rolling last 5 hours from now
- `Weekly`: UTC Monday `00:00` through the next UTC Monday `00:00`
- `Monthly`: inferred subscription-style monthly window using the earliest local OpenCode Go usage timestamp as the anchor

Monthly usage is inferred from local history, not read from OpenCode's account API. OpenUsage reuses the earliest observed local OpenCode Go usage timestamp as the monthly anchor. If no local history exists yet, it falls back to UTC calendar month boundaries until the first Go usage is recorded.

## Failure Behavior

If prior history already indicates OpenCode Go is in use, but SQLite becomes unreadable or malformed, the provider stays visible and shows a grey `Status: No Go usage data` badge instead of failing hard.

## Windows setup

1. Use OpenCode Go on this machine or sign in so `~/.local/share/opencode/auth.json` exists.
2. Confirm that `~/.local/share/opencode/opencode.db` exists once local history has been created.
3. Enable the OpenCode Go provider in Settings and refresh.

Current local evidence on this machine: both files exist and the current auth file uses the newer `opencode` entry name rather than only `opencode-go`. UsageBar only shows the `5h`, `Weekly`, and `Monthly` allowance bars when local Go usage history exists.

## Future Compatibility

The public provider identity stays `opencode-go`. If OpenCode later exposes account-truth usage by API key, OpenUsage can swap the backend without changing the provider ID or UI contract.
