# Kimi K2 Windows Notes

Status: implemented as a Windows-experimental provider.

Current implementation:
- Reads `apiKey` from the app-owned provider secret store first.
- Falls back to `KIMI_K2_API_KEY`, `KIMI_API_KEY`, then `KIMI_KEY`.
- Calls `GET https://kimi-k2.ai/api/user/credits`.
- Parses consumed and remaining credits plus optional average-token metadata from common response shapes.

Remaining gap:
- Real signed-in Windows validation with a live Kimi K2 API key.
