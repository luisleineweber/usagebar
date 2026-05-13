# Moonshot API Balance Windows Notes

Status: implemented as a Windows-experimental provider.

Current implementation:
- Reads `apiKey` from the app-owned provider secret store first.
- Falls back to `MOONSHOT_API_KEY`, `KIMI_API_KEY`, then `KIMI_KEY`.
- Calls Moonshot's official `GET https://api.moonshot.ai/v1/users/me/balance` endpoint.
- Parses available balance, voucher balance, and cash balance from the documented Kimi Open Platform response shape.

Remaining gap:
- Real signed-in Windows validation with a live Moonshot/Kimi Open Platform API key.
