# Kilo Windows Placeholder

Status: visible in Settings, blocked from probing on Windows.

Planned implementation:
- Look for Kilo config or CLI-auth artifacts on disk first.
- Reuse direct API usage if the local auth source exposes a stable token.
- Add a manual API-key fallback only if the local route is not sufficient.
