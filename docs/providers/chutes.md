# Chutes

Chutes reads subscription usage from `api.chutes.ai`.

Save a Chutes API key in Settings. You can also set `CHUTES_API_KEY`.

UsageBar shows the rolling four-hour window and the monthly window. It requests `/quotas` only when subscription data is incomplete.

HTTP 401 and 403 responses show an authentication error.
