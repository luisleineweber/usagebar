import { beforeEach, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const USAGE_OK = {
  status: 200,
  bodyText: JSON.stringify({ five_hour: { utilization: 10, resets_at: "2099-01-01T00:00:00Z" } }),
}
// Anthropic answers a token without the user:profile scope with this permission error.
const MISSING_SCOPE = {
  status: 403,
  bodyText: JSON.stringify({
    type: "error",
    error: {
      type: "permission_error",
      message: "OAuth token does not meet scope requirement user:profile",
    },
  }),
}
const EXPIRED_ACCESS = {
  status: 401,
  bodyText: JSON.stringify({
    type: "error",
    error: { type: "authentication_error", message: "OAuth token has expired." },
  }),
}

function makeClaudeCtx({ expiresAt = Date.now() + 3_600_000, refreshToken = "refresh" } = {}) {
  const ctx = makeCtx()
  ctx.host.fs.exists = (path) => !String(path).includes("rate-limit-")
  ctx.host.fs.readText = () =>
    JSON.stringify({ claudeAiOauth: { accessToken: "token", refreshToken, expiresAt } })
  return ctx
}

function routeRequests(ctx, { usage, refresh }) {
  const calls = { usage: 0, refresh: 0 }
  ctx.host.http.request.mockImplementation((opts) => {
    if (String(opts.url).includes("/v1/oauth/token")) {
      calls.refresh += 1
      return typeof refresh === "function" ? refresh(calls.refresh) : refresh
    }
    calls.usage += 1
    return typeof usage === "function" ? usage(calls.usage) : usage
  })
  return calls
}

async function probe(ctx) {
  await import("./plugin.js")
  return () => globalThis.__openusage_plugin.probe(ctx)
}

beforeEach(() => {
  delete globalThis.__openusage_plugin
  vi.resetModules()
})

it("reports a missing OAuth scope without a token refresh", async () => {
  const ctx = makeClaudeCtx()
  const calls = routeRequests(ctx, { usage: MISSING_SCOPE, refresh: USAGE_OK })

  expect(await probe(ctx)).toThrow(
    "Invalid token: Claude login lacks the OAuth scope required for usage."
  )
  expect(calls).toEqual({ usage: 1, refresh: 0 })
})

it("reports other HTTP 403 responses as denied access, not as an expired sign-in", async () => {
  const ctx = makeClaudeCtx()
  const calls = routeRequests(ctx, {
    usage: {
      status: 403,
      bodyText: JSON.stringify({
        type: "error",
        error: { type: "permission_error", message: "Access denied." },
      }),
    },
    refresh: USAGE_OK,
  })

  const run = await probe(ctx)
  expect(run).toThrow("Usage request denied (HTTP 403).")
  expect(run).not.toThrow("Token expired")
  expect(calls.refresh).toBe(0)
})

it("refreshes once after HTTP 401 and reports an expired sign-in when the refreshed token fails", async () => {
  const ctx = makeClaudeCtx()
  const calls = routeRequests(ctx, {
    usage: EXPIRED_ACCESS,
    refresh: { status: 200, bodyText: JSON.stringify({ access_token: "token2" }) },
  })

  expect(await probe(ctx)).toThrow("Token expired. Run `claude` to log in again.")
  expect(calls).toEqual({ usage: 2, refresh: 1 })
})

it.each([
  [
    "a server error",
    { status: 503, bodyText: "" },
    "Token refresh failed (HTTP 503). Try again later.",
  ],
  [
    "a malformed response",
    { status: 200, bodyText: "not-json" },
    "Provider response invalid: Claude token refresh returned no access token.",
  ],
  [
    "a response without an access token",
    { status: 200, bodyText: JSON.stringify({ token_type: "Bearer" }) },
    "Provider response invalid: Claude token refresh returned no access token.",
  ],
])(
  "reports a refresh failed by %s instead of an expired sign-in",
  async (_label, refresh, message) => {
    const ctx = makeClaudeCtx({ expiresAt: Date.now() - 1 })
    const calls = routeRequests(ctx, { usage: EXPIRED_ACCESS, refresh })

    expect(await probe(ctx)).toThrow(message)
    expect(calls).toEqual({ usage: 1, refresh: 1 })
  }
)

it("reports a refresh network failure instead of an expired sign-in", async () => {
  const ctx = makeClaudeCtx()
  routeRequests(ctx, {
    usage: EXPIRED_ACCESS,
    refresh: () => {
      throw new Error("connection reset")
    },
  })

  expect(await probe(ctx)).toThrow("Token refresh failed. Check your connection.")
})

it("reports a refused refresh grant as an expired sign-in", async () => {
  const ctx = makeClaudeCtx()
  routeRequests(ctx, {
    usage: EXPIRED_ACCESS,
    refresh: { status: 400, bodyText: JSON.stringify({ error: "invalid_grant" }) },
  })

  expect(await probe(ctx)).toThrow("Session expired. Run `claude` to log in again.")
})

it("reports a refused refresh scope as an invalid token", async () => {
  const ctx = makeClaudeCtx()
  routeRequests(ctx, {
    usage: EXPIRED_ACCESS,
    refresh: { status: 400, bodyText: JSON.stringify({ error: "invalid_scope" }) },
  })

  expect(await probe(ctx)).toThrow("Invalid token: Claude refused the requested OAuth scopes.")
})

it.each([
  [400, JSON.stringify({ error: "invalid_request" })],
  [401, JSON.stringify({ error: "invalid_client" })],
  [400, "not-json"],
])("reports other refresh rejections (HTTP %s) without claiming expiry", async (status, body) => {
  const ctx = makeClaudeCtx()
  routeRequests(ctx, { usage: EXPIRED_ACCESS, refresh: { status, bodyText: body } })

  const run = await probe(ctx)
  expect(run).toThrow("Token refresh rejected (HTTP " + status + ").")
  expect(run).not.toThrow(/expired/i)
})

it("does not report local failures during the usage request as connection failures", async () => {
  const ctx = makeClaudeCtx()
  routeRequests(ctx, { usage: { status: 429, bodyText: "" }, refresh: USAGE_OK })
  ctx.host.fs.writeText = vi.fn(() => {
    throw new Error("disk full")
  })

  const run = await probe(ctx)
  expect(run).toThrow("disk full")
  expect(run).not.toThrow("Check your connection")
})

it("keeps the connection message for a failed usage request", async () => {
  const ctx = makeClaudeCtx()
  routeRequests(ctx, {
    usage: () => {
      throw new Error("dns lookup failed")
    },
    refresh: USAGE_OK,
  })

  expect(await probe(ctx)).toThrow("Usage request failed. Check your connection.")
})
