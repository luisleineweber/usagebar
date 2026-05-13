# Abacus AI

Abacus AI usage is fetched from the signed-in web session.

## Setup

1. Open https://apps.abacus.ai/chatllm/admin/compute-points-usage while signed in.
2. In browser DevTools, copy the full `Cookie` request header from an Abacus API request.
3. Paste that cookie header into Abacus AI provider settings. `ABACUS_COOKIE_HEADER` and `ABACUS_COOKIE` remain fallback options.

UsageBar calls `_getOrganizationComputePoints` for the credit balance and `_getBillingInfo` for optional plan and reset metadata.

When Abacus reports a non-zero `totalComputePoints`, UsageBar renders `Credits` as used/max progress. If the total is zero, it renders `0 credits` as text instead of creating a fake progress maximum.
