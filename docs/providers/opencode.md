# OpenCode Zen

Tracks OpenCode Zen pay-as-you-go billing usage from the authenticated workspace flow on `opencode.ai`.

OpenCode has two similarly named products, and UsageBar keeps them separate:

- `OpenCode Zen`: pay-as-you-go model access. You add balance and are charged per request.
- `OpenCode Go`: subscription model access with 5-hour, weekly, and monthly dollar-value limits.

This page is for Zen. For the Go subscription provider, see [OpenCode Go](./opencode-go.md).

## Data source

- Authenticated OpenCode website session via a manually stored `Cookie` request header
- `https://opencode.ai/_server` workspace lookup and billing usage calls
- No public quota API is used in this Windows-first slice

## What it shows

- Current OpenCode Zen pay-as-you-go balance for the selected workspace

## Where usage lives

There is a real OpenCode website flow for this, but it is not a public docs page or a stable public API.

UsageBar currently expects the authenticated workspace billing session for OpenCode Zen:

- sign in on `https://opencode.ai`
- open the target workspace billing view at `https://opencode.ai/workspace/wrk_.../billing` once you have a workspace selected
- let OpenUsage call the internal `/_server` endpoints with that same signed-in session

If OpenCode redirects you back to home or sign-in, the session is not ready yet.

## Setup

1. Open the OpenCode Zen provider detail in UsageBar.
2. Leave `Source` on `Manual`.
3. In your browser, sign in at `https://opencode.ai`.
4. Open the workspace billing page for the team you want to track.
5. Open DevTools, then the `Network` tab.
6. Reload the billing page.
7. Click either the page request for `/workspace/.../billing` or an `https://opencode.ai/_server` request made during that load.
8. In `Request Headers`, copy the full `Cookie` header value.
9. Paste that full semicolon-separated value into `OpenCode Zen -> Cookie header`.
10. Save the secret and click `Retry`.

## Cookie header capture details

Copy the request header named exactly `Cookie`.

Do not copy:

- `Set-Cookie` from the response
- a single cookie value by itself
- the browser storage table without converting it into one header string
- `Authorization`

The header should look roughly like:

```text
auth=...; __Host-auth=...; other_cookie=...
```

If the header does not include the signed-in auth cookies, the provider will fail as unauthenticated.

## Workspace override

OpenUsage tries to resolve the workspace automatically from the signed-in session.

Set `Workspace ID` only when:

- the account can access multiple workspaces and auto-discovery picks the wrong one
- workspace discovery fails

Accepted values:

- raw `wrk_...` ID
- any full URL or copied text that contains a `wrk_...` ID

Good places to find it:

- the billing page URL if it already contains `wrk_...`
- an OpenCode `/_server` request or response payload that includes the workspace ID

## Failure modes

- missing cookie: `Set OPENCODE_COOKIE_HEADER to your OpenCode cookie header.`
- expired cookie: `OpenCode session cookie is invalid or expired.`
- missing workspace: `OpenCode workspace not found. Set OPENCODE_WORKSPACE_ID.`
- missing billing usage data: `OpenCode Zen has no billing usage data for this workspace.`
- unexpected billing payload: `OpenCode returned billing data for workspace wrk_..., but it did not include the expected Zen balance field.`

## Notes

- Browser auto-import is not implemented in this Windows build yet.
- The current plugin reads an internal web flow, so this provider is more brittle than CLI/file/API-backed providers.
- OpenCode Go can fall back to Zen balance after Go limits only when that option is enabled in OpenCode; UsageBar still treats Zen and Go as separate providers because they are billed differently.
