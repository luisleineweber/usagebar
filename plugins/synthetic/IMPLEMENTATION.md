# Synthetic

Status: implemented as a Windows-experimental provider.

Current Windows path:
- Use app-owned API-key storage or `SYNTHETIC_API_KEY`.
- Query `https://api.synthetic.new/v2/quotas` directly.
- Keep v1 focused on a simple token-based Windows flow until real account validation is captured.
