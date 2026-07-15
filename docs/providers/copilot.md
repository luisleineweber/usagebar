# GitHub Copilot

Tracks GitHub Copilot usage for usage-based AI-credit plans, legacy annual request-based plans, and free/limited accounts.

## Windows status

- Status: Experimental in this Windows-first fork.
- Shared checklist: use [Windows provider verification](../windows-provider-verification.md) before calling Copilot fully validated on Windows.

## Authentication

The plugin looks for a GitHub token in this order:

1. **OpenUsage Keychain** (`OpenUsage-copilot`) - Token previously cached by the plugin, but only reused when its stored login still matches the active `gh` account
2. **GitHub CLI Active Account** (`hosts.yml` + `gh:github.com:<login>`) - Token for the active `gh` login selected by `gh auth status` / `gh auth switch`
3. **GitHub CLI Legacy Keychain** (`gh:github.com`) - Fallback when no active-account entry can be resolved
4. **GitHub CLI Command** (`gh auth token`) - Fallback when the local `gh` session is healthy but the direct credential-store read still misses
5. **State File** (`auth.json`) - Fallback file-based storage

### Setup

Install and authenticate with the GitHub CLI:

```bash
gh auth login
```

If you use multiple GitHub accounts, switch the intended Copilot account first:

```bash
gh auth status
gh auth switch
```

Once authenticated via gh CLI, the plugin caches the token in the OpenUsage keychain together with the active login so later probes stay aligned with the selected `gh` account.
If Windows Credential Manager lookup misses even though `gh` is already logged in, OpenUsage now falls back to the CLI's own `gh auth token` command before reporting a logged-out state.

## Billing model

GitHub moved Copilot billing to usage-based AI Credits on 2026-06-01. UsageBar now treats Copilot as dual-mode:

- `usage_based` - current paid plans such as Pro, Pro+, Max, Business, and Enterprise. The plugin shows AI-credit terminology and only renders exact credit progress when GitHub returns credit fields in the payload.
- `legacy_request_based` - existing annual Pro/Pro+ accounts that still expose `quota_snapshots.premium_interactions`. The plugin keeps these as legacy request lines.
- `free_limited` - Free/Student/limited quota payloads. Chat and Completions keep the provider-reported counters.

UsageBar does not invent remaining AI-credit values. If GitHub returns plan data without stable credit usage fields, the plugin shows the known included-credit allowance for the plan when available and a clear unavailable state for exact usage.

Current token-based accounts may return `quota_snapshots.chat` and `quota_snapshots.completions` instead of AI-credit fields. When GitHub marks either snapshot as available, UsageBar renders its provider-reported Chat and Completions counters with the shared reset date. A disabled `premium_interactions` snapshot is not treated as legacy premium usage.

`billingScope` is the preferred config key for legacy billing-scope lookups. The older `workspaceId` key still works as an alias.

## API

**Endpoint:** `https://api.github.com/copilot_internal/user`

**Headers:**

```
Authorization: token <token>
Accept: application/json
Editor-Version: vscode/1.96.2
Editor-Plugin-Version: copilot-chat/0.26.7
User-Agent: GitHubCopilotChat/0.26.7
X-Github-Api-Version: 2025-04-01
```

### Response (Legacy request-based tier)

```json
{
  "copilot_plan": "pro",
  "quota_reset_date": "2025-02-15T00:00:00Z",
  "quota_snapshots": {
    "premium_interactions": {
      "percent_remaining": 80,
      "entitlement": 300,
      "remaining": 240,
      "quota_id": "premium"
    },
    "chat": {
      "percent_remaining": 95,
      "entitlement": 1000,
      "remaining": 950,
      "quota_id": "chat"
    }
  }
}
```

### Response (Free or limited tier)

```json
{
  "copilot_plan": "individual",
  "access_type_sku": "free_limited_copilot",
  "limited_user_quotas": {
    "chat": 410,
    "completions": 4000
  },
  "monthly_quotas": {
    "chat": 500,
    "completions": 4000
  },
  "limited_user_reset_date": "2025-02-11"
}
```

## Displayed Lines

| Line                    | Tier               | Description                                                                                                                             |
| ----------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Billing Mode            | All detected modes | `AI-credit usage-based`, `Legacy request-based`, or omitted when no usable data exists                                                  |
| AI Credits              | Usage-based paid   | AI Credits used out of included credits when GitHub returns exact credit usage fields                                                   |
| Included Credits        | Usage-based paid   | Known monthly included credits for Pro, Pro+, Max, Business, or Enterprise when exact remaining usage is unavailable                    |
| Legacy Premium          | Legacy annual paid | Premium requests used out of the provider-reported entitlement or the documented legacy plan allowance                                  |
| Chat                    | Legacy annual paid | Chat quota units used out of provider-reported `entitlement` when available; percent fallback only when GitHub omits the exact chat cap |
| Chat                    | Free               | Chat messages used out of `monthly_quotas.chat`                                                                                         |
| Completions             | Free               | Code completions used out of `monthly_quotas.completions`                                                                               |
| Legacy Premium Requests | Detail             | Legacy GitHub billing API premium-request usage when the token can access billing usage                                                 |

All progress lines include:

- `resetsAt` - ISO timestamp of next quota reset
- `periodDurationMs` - 30-day period (`2592000000ms`)

Current GitHub plan docs list monthly AI-credit allowances as Pro 1,500, Pro+ 7,000, Max 20,000, Business 1,900 per user, and Enterprise 3,900 per user. Legacy request-based fallback limits remain Free 50, Student 300, Pro 300, Pro+ 1,500, Business 300 per user, and Enterprise 1,000 per user. UsageBar uses provider-reported `entitlement` first, then documented fallback limits only when the Copilot payload names a known plan. GitHub's Copilot usage-limit docs describe legacy paid Chat snapshots as usage/token limits, so those snapshots are displayed as quota units rather than user prompt/message counts.

## Errors

| Condition      | Message                                          |
| -------------- | ------------------------------------------------ |
| No token found | "Not logged in. Run `gh auth login` first."      |
| 401/403        | "Token invalid. Run `gh auth login` to re-auth." |
| HTTP error     | "Usage request failed (HTTP {status})..."        |
| Network error  | "Usage request failed. Check your connection."   |
| Invalid JSON   | "Usage response invalid. Try again later."       |
