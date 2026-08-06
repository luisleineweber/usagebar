# Doubao

Doubao reads Volcengine Ark request-limit headers.

Save an API key in Settings. You can also set `ARK_API_KEY`, `VOLCENGINE_API_KEY`, or `DOUBAO_API_KEY`.

UsageBar sends one request with `max_tokens: 1`. It reads the request limit, remaining requests, and reset time.

If Ark omits the headers, UsageBar shows the key as active. It does not show an unknown quota as zero.
