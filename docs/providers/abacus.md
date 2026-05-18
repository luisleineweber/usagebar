# Abacus AI

Abacus AI usage is fetched from the signed-in web session.

## API-key spike

UsageBar checked the official Abacus API/Python SDK path before adding API-key setup. The public docs expose a `ComputePointInfo` return class with current-month available/used compute-point fields, and the current `abacusai` Python package includes that class. The current SDK does not expose a generated client method that returns it, and no documented `/api/v0/` action for organization compute points was found.

Decision: do not expose Abacus API-key setup until a real account or official docs validate a callable compute-points API. The current credit balance remains a signed-in web-session source.

## Setup

1. Open https://apps.abacus.ai/chatllm/admin/compute-points-usage while signed in.
2. In browser DevTools, copy the full `Cookie` request header from an Abacus API request.
3. Paste that cookie header into Abacus AI provider settings. `ABACUS_COOKIE_HEADER` and `ABACUS_COOKIE` remain fallback options.

UsageBar calls `_getOrganizationComputePoints` for the credit balance and `_getBillingInfo` for optional plan and reset metadata.

When Abacus reports a non-zero `totalComputePoints`, UsageBar renders `Credits` as used/max progress. If the total is zero, it renders `0 credits` as text instead of creating a fake progress maximum.

Successful output also includes detail-only provenance lines:

| Line | Value |
| --- | --- |
| `Source` | `Abacus dashboard compute-points session` |
| `Auth source` | `Stored Cookie header`, `ABACUS_COOKIE_HEADER`, or `ABACUS_COOKIE` |
| `Endpoint` | `https://apps.abacus.ai/api/_getOrganizationComputePoints` |

The optional billing-info request can fail without hiding the compute-points result. In that case UsageBar keeps the credit output and logs the billing metadata failure.
