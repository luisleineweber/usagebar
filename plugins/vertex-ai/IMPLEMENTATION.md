# Vertex AI Windows Implementation

Status: Windows experimental.

Implementation:
- Reads gcloud application-default credentials from `CLOUDSDK_CONFIG`, `%APPDATA%\gcloud`, or `~/.config/gcloud`.
- Refreshes OAuth user ADC through `https://oauth2.googleapis.com/token` when the access token is missing or near expiry.
- Reads the project from Google Cloud env vars or `configurations/config_default`.
- Queries Cloud Monitoring quota usage and limit time-series for `aiplatform.googleapis.com`.

Deferred:
- Service-account ADC.
- Vertex-tagged local Claude cost enrichment.
