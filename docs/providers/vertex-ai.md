# Vertex AI

Windows state: experimental.

## Data source

UsageBar uses official Google auth and monitoring APIs:

1. Reads gcloud application-default credentials from `%APPDATA%\gcloud\application_default_credentials.json`, `CLOUDSDK_CONFIG`, or `~/.config/gcloud`.
2. Refreshes the OAuth access token through `https://oauth2.googleapis.com/token` when needed.
3. Queries Cloud Monitoring time-series metrics for `aiplatform.googleapis.com` quota usage and limits.

The provider reports the highest matched quota usage percentage across current `consumer_quota` series.

## Setup

```powershell
gcloud auth application-default login
gcloud config set project PROJECT_ID
```

Alternatively set `GOOGLE_CLOUD_PROJECT`, `GCLOUD_PROJECT`, or `CLOUDSDK_CORE_PROJECT` before launching UsageBar.

The selected project must allow Cloud Monitoring time-series reads for the signed-in account.

## Windows validation

- Contract coverage: focused plugin tests and the host env allowlist test.
- Entitlement coverage: pending real Windows Google Cloud project validation.
- Current gap: service-account ADC and Vertex-tagged local Claude cost enrichment are not wired into this JS provider yet.
