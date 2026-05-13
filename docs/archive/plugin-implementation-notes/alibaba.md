# Alibaba Coding Plan Windows Implementation

Current status: implemented as a Windows-experimental API-key provider.

Windows path:

- reads a stored provider secret `apiKey` or `ALIBABA_API_KEY`
- reads `ALIBABA_REGION` for endpoint selection; default is `cn-beijing`
- calls the Coding Plan quota endpoint and renders 5-hour, weekly, and monthly request-count progress bars
- uses documented Pro/Lite Coding Plan limits only as fallback when the provider response identifies the plan but omits limits

Remaining gap:

- real signed-in Windows validation with a live Coding Plan API key
