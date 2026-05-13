# OpenRouter Windows Notes

Status: implemented as a Windows-experimental provider.

Current implementation:
- Reads an OpenRouter management key from the app-owned provider secret store first.
- Falls back to `OPENROUTER_API_KEY`.
- Uses `OPENROUTER_API_URL` only as an optional base-URL override.
- Calls `/credits` for account totals and `/key` for optional key-rate enrichment.

Remaining gap:
- Real signed-in Windows validation with a live OpenRouter management key.
