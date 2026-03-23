# Warp Windows Notes

Status: implemented as a Windows-experimental provider.

Current implementation:
- Reads `token` from the app-owned provider secret store first.
- Falls back to `WARP_API_KEY`, then `WARP_TOKEN`.
- Calls Warp's `GetRequestLimitInfo` GraphQL endpoint directly.
- Tracks metered versus unlimited accounts with a simple plan badge plus request-limit progress.

Remaining gap:
- Real signed-in Windows validation with a live Warp token.
