# Kiro Provider

Status: implemented as a Windows-experimental local desktop-data provider.

## Current Strategy

- Require Kiro desktop auth state before showing usage, so stale cache/log data is not treated as an active account after logout.
- Prefer local normalized usage cache from `state.vscdb`.
- Enrich plan and overage metadata from `q-client.log` when available.
- Use the reverse-engineered live Kiro/AWS usage API only when local data is missing or stale.
- Keep stale local data when the live fallback fails.
- Fall back to local Kiro CLI session metering when desktop auth/cache state is absent.

## Platform Paths

- Auth token:
  - macOS/Linux: `~/.aws/sso/cache/kiro-auth-token.json`
  - Windows: `~/.aws/sso/cache/kiro-auth-token.json`
- State DB:
  - macOS: `~/Library/Application Support/Kiro/User/globalStorage/state.vscdb`
  - Windows: `~/AppData/Roaming/Kiro/User/globalStorage/state.vscdb`
  - Linux: `~/.config/Kiro/User/globalStorage/state.vscdb`
- Profile fallback:
  - macOS: `~/Library/Application Support/Kiro/User/globalStorage/kiro.kiroagent/profile.json`
  - Windows: `~/AppData/Roaming/Kiro/User/globalStorage/kiro.kiroagent/profile.json`
  - Linux: `~/.config/Kiro/User/globalStorage/kiro.kiroagent/profile.json`
- Logs:
  - macOS: `~/Library/Application Support/Kiro/logs/*/window*/exthost/kiro.kiroAgent/q-client.log`
  - Windows: `~/AppData/Roaming/Kiro/logs/*/window*/exthost/kiro.kiroAgent/q-client.log`
  - Linux: currently follows the macOS default in the plugin and should be hardened before Linux promotion.
- CLI sessions:
  - macOS/Linux: `~/.kiro/sessions/cli/*.json`
  - Windows: `~/.kiro/sessions/cli/*.json`

## CLI Fallback

CodexBar/Win-CodexBar use `kiro-cli` / `kiro` commands (`whoami`, then `chat --no-interactive "/usage"`). UsageBar currently avoids subprocess execution from plugins and instead reads the Kiro CLI's local session JSON. This fixes CLI-only Windows installs where `kiro-cli whoami` works but desktop auth/cache/log files are absent.

The file-based fallback is lower fidelity than desktop state:

- sums current-month `metering_usage` values from `~/.kiro/sessions/cli/*.json`
- reports a text line instead of an authoritative progress limit
- does not expose bonus credits, overage state, or live plan limits
- stays below verified desktop cache/log/live data in source priority
