# Kilo

Status: implemented as a Windows-experimental provider.

Current Windows path:
- Use app-owned API-key storage or `KILO_API_KEY`.
- Query the documented Kilo tRPC batch endpoint at `https://app.kilo.ai/api/trpc`.
- Keep CLI-session fallback deferred until a later slice; this rollout is intentionally API-key only.
