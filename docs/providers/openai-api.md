# OpenAI API

The OpenAI API provider reads organization-level API spend and completions usage from OpenAI's Admin API.

## Setup

1. Create an OpenAI Admin API key with organization usage/cost permissions.
2. Save it in UsageBar provider settings as `Admin API key`.
3. Alternative: set `OPENAI_ADMIN_API_KEY`. `OPENAI_API_KEY` is accepted as a fallback only when it has the required admin permissions.

## Displayed Lines

- `Today`: current UTC-day API spend.
- `7 days`: spend over the current UTC day plus the previous six UTC days.
- `30 days`: spend over the current UTC day plus the previous 29 UTC days.
- `Tokens`: total input/output tokens from the completions usage endpoint.
- `Requests`: model request count from the completions usage endpoint.
- `Top model`: model with the highest token total in the 30-day window.

## Notes

- This provider does not read ChatGPT/Codex subscription quota. Use the `Codex` provider for ChatGPT/Codex subscription usage.
- Only aggregate usage/cost data is exposed in UsageBar and the local HTTP API. API keys are not returned by plugin output.
