# Augment Windows Implementation

Status: Windows experimental.

Implementation:
- Reads a manual Augment `Cookie` header from the app provider-secret store.
- Falls back to `AUGMENT_COOKIE_HEADER` when no stored secret exists.
- Calls `https://app.augmentcode.com/api/credits` and optionally `https://app.augmentcode.com/api/subscription`.
- Maps credits to the primary progress line and subscription metadata to detail rows.

Deferred:
- Auggie CLI probing is not implemented because the JS plugin host does not expose a subprocess API.
- Browser-cookie auto import is not implemented for this provider yet.
