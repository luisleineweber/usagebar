# Kiro

> Reverse-engineered from Kiro desktop auth, local state, runtime logs, and the shipped Kiro extension API. The live API is not publicly documented and may change without notice.

Kiro tracks AI coding usage as monthly credits, bonus/free-trial credits, plan metadata, and overage state.

## Data Sources

UsageBar prefers authoritative quota snapshots before local transcript/session sums. It resolves usage in this order:

1. **Local cache:** `state.vscdb` under the Kiro desktop global storage directory.
2. **Local logs:** `q-client.log` entries containing `GetUsageLimitsCommand` output. Logs add plan and overage metadata that the cache may not include.
3. **Desktop live fallback:** Kiro/AWS usage API via the desktop refresh token when local data is missing or stale.
4. **CLI live quota:** Kiro CLI auth from `~/AppData/Local/Kiro-Cli/data.sqlite3`, then the same Kiro/AWS usage API.
5. **Degraded CLI session fallback:** Kiro CLI session files under `~/.kiro/sessions/cli` only when no live quota source works.

If the live fallback fails but local cache/log data exists, UsageBar keeps showing the local data instead of failing the provider.

Displayed `Source` values:

| Output state | Source |
| --- | --- |
| Local state DB usage | `Desktop cache` |
| Parsed desktop usage log | `Usage log` |
| Refreshed Kiro/AWS API usage | `Live usage API` |
| Local cache after live API failure | `Desktop cache after live API failure` |
| Usage log after live API failure | `Usage log after live API failure` |
| CLI session fallback | `CLI session files` |

## Platform Paths

Auth token:

- Windows: `~/.aws/sso/cache/kiro-auth-token.json`
- macOS/Linux: `~/.aws/sso/cache/kiro-auth-token.json`

CLI auth:

- Windows: `~/AppData/Local/Kiro-Cli/data.sqlite3`
- Table/key: `auth_kv`, usually `kirocli:social:token`

State DB:

- Windows: `~/AppData/Roaming/Kiro/User/globalStorage/state.vscdb`
- macOS: `~/Library/Application Support/Kiro/User/globalStorage/state.vscdb`
- Linux: `~/.config/Kiro/User/globalStorage/state.vscdb`

Profile fallback:

- Windows: `~/AppData/Roaming/Kiro/User/globalStorage/kiro.kiroagent/profile.json`
- macOS: `~/Library/Application Support/Kiro/User/globalStorage/kiro.kiroagent/profile.json`
- Linux: `~/.config/Kiro/User/globalStorage/kiro.kiroagent/profile.json`

Log metadata:

- Windows: `~/AppData/Roaming/Kiro/logs/*/window*/exthost/kiro.kiroAgent/q-client.log`
- macOS: `~/Library/Application Support/Kiro/logs/*/window*/exthost/kiro.kiroAgent/q-client.log`

Degraded CLI session fallback:

- Windows/macOS/Linux: `~/.kiro/sessions/cli/*.json`

## Tracked Metrics

| Metric | Source | Format |
| --- | --- | --- |
| Credits | cache, log, desktop live API, or CLI-auth live API `usageBreakdowns` | count |
| Bonus Credits | `freeTrialUsage`, `freeTrialInfo`, or `bonuses` | count |
| Plan | log or live API `subscriptionInfo.subscriptionTitle` | badge/detail metadata |
| Overages | log or live API `overageConfiguration.overageStatus` | badge |
| CLI Credits | CLI session `metering_usage` values when no live quota source works | text |

## CLI Sources

UsageBar does not invoke `kiro-cli` from the plugin host. On Windows it first reads the Kiro CLI SQLite auth token from `~/AppData/Local/Kiro-Cli/data.sqlite3`, normalizes the token fields, and fetches the live Kiro/AWS quota snapshot. This is the path that should match Kiro CLI `/usage`, including used credits, limit, percentage, and reset date.

Only if live quota is unavailable does UsageBar read local Kiro CLI session JSON and sum current-month `metering_usage` credit values. That degraded fallback can show CLI credits used this month, but it is not an authoritative account-period quota and cannot show bonus credits, overage state, or plan limits.

## Troubleshooting

### "Open Kiro and sign in, then try again."

- Open Kiro desktop and sign in.
- Confirm `~/.aws/sso/cache/kiro-auth-token.json` exists on Windows.
- If you only use Kiro CLI, confirm `~/AppData/Local/Kiro-Cli/data.sqlite3` exists after login.
- If live CLI quota fails, run at least one CLI prompt so `~/.kiro/sessions/cli/*.json` contains degraded metering data.

### "Kiro session expired."

- Open Kiro and sign in again to refresh the session.
- This can happen when the desktop refresh token is expired or revoked.

### "Kiro usage data unavailable."

- Open the Kiro account dashboard once so Kiro writes usage cache/log data.
- Refresh UsageBar again.
