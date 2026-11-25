import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"
import { ownCredentials } from "./test-helpers.js"

const document = (owner) => ({
  usagebarCredentialOwner: owner,
  claudeAiOauth: { accessToken: "old", refreshToken: "refresh", expiresAt: 1 },
  unrelated: { keep: true },
})

async function plugin() {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

function usage(ctx) {
  ctx.host.http.request.mockReturnValue({
    status: 200,
    bodyText: JSON.stringify({ five_hour: { utilization: 0 } }),
  })
}

afterEach(() => vi.useRealTimers())

describe("Claude refresh ownership", () => {
  beforeEach(() => {
    vi.resetModules()
    delete globalThis.__openusage_plugin
  })

  it.each(["file", "keychain", "account-file"])(
    "does not rotate or write Claude Code %s credentials",
    async (source) => {
      const ctx = makeCtx()
      const full = JSON.stringify(document("usagebar"))
      if (source === "keychain") ctx.host.keychain.readGenericPassword.mockReturnValue(full)
      else {
        const path = source === "file" ? "~/.claude/.credentials.json" : "~/.claude.json"
        ctx.host.fs.writeText(path, full)
        ctx.host.fs.writeText.mockClear()
      }
      usage(ctx)
      const result = (await plugin()).probe(ctx)
      expect(result.lines.find((line) => line.label === "Session").used).toBe(0)
      expect(
        ctx.host.http.request.mock.calls.every(([req]) => req.url.includes("/api/oauth/usage"))
      ).toBe(true)
      expect(ctx.host.fs.writeText).not.toHaveBeenCalled()
      expect(ctx.host.keychain.writeGenericPassword).not.toHaveBeenCalled()
      expect(ctx.host.providerSecrets.write).not.toHaveBeenCalled()
    }
  )

  it("keeps an imported managed chain owned by Claude Code", async () => {
    const ctx = makeCtx()
    ctx.instanceRef = { providerId: "claude", instanceId: "imported" }
    const full = document(undefined)
    full.claudeAiOauth.expiresAt = Date.now() + 3600000
    ctx.host.providerSecrets.read.mockReturnValue(JSON.stringify(full))
    usage(ctx)
    ;(await plugin()).probe(ctx)
    expect(
      ctx.host.http.request.mock.calls.every(([req]) => req.url.includes("/api/oauth/usage"))
    ).toBe(true)
    expect(ctx.host.providerSecrets.write).not.toHaveBeenCalled()
    expect(ctx.host.fs.readText("~/.claude/.credentials.json")).toBeUndefined()
  })

  it("uses the host transaction for an explicitly owned managed chain", async () => {
    const ctx = makeCtx()
    ctx.instanceRef = { providerId: "claude", instanceId: "owned" }
    ctx.host.providerSecrets.read.mockReturnValue(JSON.stringify(document("usagebar")))
    const updated = document("usagebar")
    updated.claudeAiOauth = {
      accessToken: "new",
      refreshToken: "rotated",
      expiresAt: Date.now() + 3600000,
    }
    ctx.host.providerSecrets.refreshClaudeCredentials = vi.fn(() =>
      JSON.stringify({ credentials: updated, response: null })
    )
    usage(ctx)
    ;(await plugin()).probe(ctx)
    expect(ctx.host.providerSecrets.refreshClaudeCredentials).toHaveBeenCalledOnce()
    expect(ctx.host.http.request).toHaveBeenCalledWith(
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer new" }) })
    )
    expect(ctx.host.providerSecrets.write).not.toHaveBeenCalled()
  })
  it("reloads a token rotated by Claude Code before retrying usage", async () => {
    const ctx = makeCtx()
    const previous = document(undefined)
    previous.claudeAiOauth.expiresAt = Date.now() + 3600000
    const updated = document(undefined)
    updated.claudeAiOauth.expiresAt = Date.now() + 3600000
    updated.claudeAiOauth.accessToken = "cli-rotated"
    ctx.host.keychain.readGenericPassword
      .mockReturnValueOnce(JSON.stringify(previous))
      .mockReturnValue(JSON.stringify(updated))
    ctx.host.http.request.mockImplementation(({ headers }) => ({
      status: headers.Authorization === "Bearer cli-rotated" ? 200 : 401,
      bodyText: JSON.stringify({ five_hour: { utilization: 0 } }),
    }))
    const result = (await plugin()).probe(ctx)
    expect(result.lines.find((line) => line.label === "Session").used).toBe(0)
    expect(ctx.host.http.request).toHaveBeenCalledTimes(2)
    expect(ctx.host.keychain.writeGenericPassword).not.toHaveBeenCalled()
  })

  it("surfaces host storage failures before usage can use an old token", async () => {
    const ctx = makeCtx()
    ctx.instanceRef = { providerId: "claude", instanceId: "owned" }
    ctx.host.providerSecrets.read.mockReturnValue(JSON.stringify(document("usagebar")))
    ctx.host.providerSecrets.refreshClaudeCredentials = () => {
      throw "Could not save refreshed Claude credentials"
    }
    const loaded = await plugin()
    expect(() => loaded.probe(ctx)).toThrow("Could not save refreshed Claude credentials")
    expect(ctx.host.http.request).not.toHaveBeenCalled()
  })
})

it("asks the user to run Claude Code for an expired import", async () => {
  vi.resetModules()
  const ctx = makeCtx()
  ctx.instanceRef = { providerId: "claude", instanceId: "imported" }
  ctx.host.providerSecrets.read.mockReturnValue(JSON.stringify(document("claude-code")))
  ctx.host.http.request.mockReturnValue({ status: 401, bodyText: "{}" })
  const loaded = await plugin()
  expect(() => loaded.probe(ctx)).toThrow("Run Claude Code once, then try again")
  expect(ctx.host.keychain.readGenericPassword).not.toHaveBeenCalled()
})

it.each([
  "invalid_grant",
  "synthetic-private-server-text",
  { detail: "synthetic-private-server-text" },
])("does not log server text in refresh errors: %j", async (error) => {
  vi.resetModules()
  const ctx = makeCtx()
  ctx.host.keychain.readGenericPassword.mockReturnValue(JSON.stringify(document("usagebar")))
  ownCredentials(ctx)
  ctx.host.http.request.mockReturnValue({
    status: 400,
    bodyText: JSON.stringify({ error, error_description: "synthetic-private-description" }),
  })
  const loaded = await plugin()
  expect(() => loaded.probe(ctx)).toThrow()
  const messages = JSON.stringify(ctx.host.log.error.mock.calls)
  expect(messages).not.toContain("synthetic-private")
  expect(messages).not.toContain("[object Object]")
})

it("does not treat error_description as an OAuth error code", async () => {
  vi.resetModules()
  const ctx = makeCtx()
  ctx.host.keychain.readGenericPassword.mockReturnValue(JSON.stringify(document("usagebar")))
  ownCredentials(ctx)
  ctx.host.http.request.mockReturnValue({
    status: 400,
    bodyText: JSON.stringify({ error_description: "invalid_grant" }),
  })
  const loaded = await plugin()
  expect(() => loaded.probe(ctx)).toThrow("Token refresh rejected (HTTP 400)")
  expect(ctx.host.log.error).toHaveBeenCalledWith("refresh failed: status=400 error=none")
})

it.each([1, 120000])(
  "routes native refresh 429 to the refresh hold with token lifetime %s",
  async (lifetime) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-03T13:15:00Z"))
    vi.resetModules()
    const ctx = makeCtx()
    ctx.instanceRef = { providerId: "claude", instanceId: "owned" }
    const full = document("usagebar")
    full.claudeAiOauth.expiresAt = lifetime === 1 ? 1 : Date.now() + lifetime
    ctx.host.providerSecrets.read.mockReturnValue(JSON.stringify(full))
    ctx.host.providerSecrets.refreshClaudeCredentials = vi.fn(() =>
      JSON.stringify({
        credentials: null,
        response: { status: 429, retryAfterSeconds: 600 },
      })
    )
    const loaded = await plugin()
    expect(() => loaded.probe(ctx)).toThrow("HTTP 429")
    expect(ctx.host.fs.exists(ctx.app.pluginDataDir + "/rate-limit-owned.json")).toBe(false)
    expect(
      JSON.parse(ctx.host.fs.readText(ctx.app.pluginDataDir + "/rate-limit-refresh-owned.json"))
    ).toEqual({ retryAt: Date.now() + 600000, streak: 1, recordedAt: Date.now() })
    vi.resetModules()
    vi.advanceTimersByTime(5000)
    usage(ctx)
    const next = await plugin()
    if (lifetime === 1) expect(() => next.probe(ctx)).toThrow("HTTP 429")
    else expect(next.probe(ctx).lines.find((line) => line.label === "Session").used).toBe(0)
    expect(ctx.host.providerSecrets.refreshClaudeCredentials).toHaveBeenCalledOnce()
    expect(ctx.host.http.request).toHaveBeenCalledTimes(lifetime === 1 ? 0 : 1)
    expect(ctx.host.providerSecrets.read).not.toHaveBeenCalledWith("cookieHeader")
  }
)

it.each([
  "Could not save refreshed Claude credentials. Recovery will run before another refresh. Retry the probe.",
  "Refreshed Claude credentials are unsaved. Recovery and main storage both failed. Keep UsageBar open and retry.",
])(
  "keeps the native save error when a refresh hold arrives during the transaction: %s",
  async (message) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-03T13:15:00Z"))
    vi.resetModules()
    const ctx = makeCtx()
    ctx.instanceRef = { providerId: "claude", instanceId: "owned" }
    ctx.host.providerSecrets.read.mockReturnValue(JSON.stringify(document("usagebar")))
    ctx.host.providerSecrets.refreshClaudeCredentials = vi.fn(() => {
      ctx.host.fs.writeText(
        ctx.app.pluginDataDir + "/rate-limit-refresh-owned.json",
        JSON.stringify({ retryAt: Date.now() + 600000 })
      )
      throw message
    })
    const loaded = await plugin()
    expect(() => loaded.probe(ctx)).toThrow(message)
    expect(ctx.host.providerSecrets.refreshClaudeCredentials).toHaveBeenCalledOnce()
    expect(ctx.host.http.request).not.toHaveBeenCalled()
    expect(ctx.host.providerSecrets.read).not.toHaveBeenCalledWith("cookieHeader")
  }
)

it.each([401, 403])(
  "keeps the refresh hold when usage returns HTTP %s before recorded expiry",
  async (status) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-03T13:15:00Z"))
    vi.resetModules()
    const ctx = makeCtx()
    ctx.instanceRef = { providerId: "claude", instanceId: "owned" }
    const full = document("usagebar")
    full.claudeAiOauth.expiresAt = Date.now() + 3600000
    ctx.host.providerSecrets.read.mockReturnValue(JSON.stringify(full))
    ctx.host.providerSecrets.refreshClaudeCredentials = vi.fn()
    ctx.host.fs.writeText(
      ctx.app.pluginDataDir + "/rate-limit-refresh-owned.json",
      JSON.stringify({ retryAt: Date.now() + 600000 })
    )
    ctx.host.http.request.mockReturnValue({ status, bodyText: "{}" })
    const loaded = await plugin()
    expect(() => loaded.probe(ctx)).toThrow(
      "Usage request failed (HTTP 429). Try again after 2026-11-03T13:25:00.000Z."
    )
    expect(ctx.host.http.request).toHaveBeenCalledOnce()
    expect(ctx.host.providerSecrets.refreshClaudeCredentials).not.toHaveBeenCalled()
    expect(ctx.host.providerSecrets.read).not.toHaveBeenCalledWith("cookieHeader")
  }
)

it("keeps the Claude Code action for an unconfirmed 401 on an import", async () => {
  vi.resetModules()
  const ctx = makeCtx()
  ctx.instanceRef = { providerId: "claude", instanceId: "imported" }
  const full = document("claude-code")
  full.claudeAiOauth.expiresAt = Date.now() + 3600000
  ctx.host.providerSecrets.read.mockReturnValue(JSON.stringify(full))
  ctx.host.providerSecrets.refreshClaudeCredentials = vi.fn()
  ctx.host.http.request.mockReturnValue({ status: 401, bodyText: "{}" })
  const loaded = await plugin()
  expect(() => loaded.probe(ctx)).toThrow(
    "Invalid token: Claude rejected the sign-in (HTTP 401). Run Claude Code once, then try again."
  )
  expect(ctx.host.providerSecrets.refreshClaudeCredentials).not.toHaveBeenCalled()
  expect(ctx.host.providerSecrets.read).not.toHaveBeenCalledWith("cookieHeader")
})

it("uses the updated Claude Code import without a refresh request", async () => {
  vi.resetModules()
  const ctx = makeCtx()
  ctx.instanceRef = { providerId: "claude", instanceId: "imported" }
  ctx.host.providerSecrets.read.mockReturnValue(JSON.stringify(document("claude-code")))
  const updated = document("claude-code")
  updated.claudeAiOauth.accessToken = "new-cli"
  updated.claudeAiOauth.expiresAt = Date.now() + 3600000
  ctx.host.providerSecrets.syncClaudeCodeCredentials = vi.fn(() => JSON.stringify(updated))
  ctx.host.providerSecrets.refreshClaudeCredentials = vi.fn()
  usage(ctx)
  const result = (await plugin()).probe(ctx)
  expect(result.lines.find((line) => line.label === "Session").used).toBe(0)
  expect(ctx.host.providerSecrets.syncClaudeCodeCredentials).toHaveBeenCalledOnce()
  expect(ctx.host.providerSecrets.refreshClaudeCredentials).not.toHaveBeenCalled()
  expect(ctx.host.http.request).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer new-cli" }),
    })
  )
})

it("asks the user to run Claude Code when neither imported token nor source is valid", async () => {
  vi.resetModules()
  const ctx = makeCtx()
  ctx.instanceRef = { providerId: "claude", instanceId: "imported" }
  ctx.host.providerSecrets.read.mockReturnValue(JSON.stringify(document("claude-code")))
  ctx.host.providerSecrets.syncClaudeCodeCredentials = vi.fn(() => null)
  ctx.host.providerSecrets.refreshClaudeCredentials = vi.fn()
  const loaded = await plugin()
  expect(() => loaded.probe(ctx)).toThrow("Run Claude Code once, then try again")
  expect(ctx.host.http.request).not.toHaveBeenCalled()
  expect(ctx.host.providerSecrets.refreshClaudeCredentials).not.toHaveBeenCalled()
})

it.each([
  ["a source change", null, true],
  ["a verification hold", { kind: "deferred", retryAfterSeconds: 600 }, false],
  ["a verification connection failure", { kind: "deferred", retryAfterSeconds: null }, false],
])("keeps usage available after %s during proactive import sync", async (_label, first, retry) => {
  vi.resetModules()
  const ctx = makeCtx()
  ctx.instanceRef = { providerId: "claude", instanceId: "imported" }
  const full = document("claude-code")
  full.claudeAiOauth.expiresAt = Date.now() + 60_000
  ctx.host.providerSecrets.read.mockReturnValue(JSON.stringify(full))
  const updated = {
    ...full,
    claudeAiOauth: { accessToken: "new", expiresAt: Date.now() + 3600000 },
  }
  ctx.host.providerSecrets.syncClaudeCodeCredentials = vi
    .fn()
    .mockReturnValueOnce(first === null ? null : JSON.stringify(first))
    .mockReturnValue(JSON.stringify(updated))
  ctx.host.http.request.mockImplementation(({ headers }) => ({
    status: retry && headers.Authorization === "Bearer old" ? 401 : 200,
    bodyText: JSON.stringify({ five_hour: { utilization: 0 } }),
  }))
  const loaded = await plugin()
  expect(loaded.probe(ctx).lines.find((line) => line.label === "Session").used).toBe(0)
  expect(ctx.host.http.request).toHaveBeenCalledTimes(retry ? 2 : 1)
  expect(ctx.host.providerSecrets.syncClaudeCodeCredentials).toHaveBeenCalledTimes(retry ? 2 : 1)
  if (!retry) {
    expect(ctx.host.fs.exists(ctx.app.pluginDataDir + "/rate-limit-verify-imported.json")).toBe(
      first?.retryAfterSeconds === 600
    )
    expect(ctx.host.fs.exists(ctx.app.pluginDataDir + "/rate-limit-imported.json")).toBe(false)
    expect(ctx.host.fs.exists(ctx.app.pluginDataDir + "/rate-limit-web-imported.json")).toBe(false)
    expect(ctx.host.fs.exists(ctx.app.pluginDataDir + "/rate-limit-refresh-imported.json")).toBe(
      false
    )
  }
})

it("offers the Settings link if an older import is rejected before its recorded expiry", async () => {
  vi.resetModules()
  const ctx = makeCtx()
  ctx.instanceRef = { providerId: "claude", instanceId: "imported" }
  const full = document("claude-code")
  full.claudeAiOauth.expiresAt = Date.now() + 3600000
  ctx.host.providerSecrets.read.mockReturnValue(JSON.stringify(full))
  ctx.host.providerSecrets.syncClaudeCodeCredentials.mockReturnValue(
    JSON.stringify({ kind: "linkRequired" })
  )
  ctx.host.http.request.mockReturnValue({ status: 401, bodyText: "{}" })
  const loaded = await plugin()
  expect(() => loaded.probe(ctx)).toThrow("Link current Claude Code login")
  expect(ctx.host.http.request).toHaveBeenCalledOnce()
})

it("bounds and resets the separate verification streak after a verified replacement", async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-03T13:15:00Z"))
  vi.resetModules()
  const ctx = makeCtx()
  ctx.instanceRef = { providerId: "claude", instanceId: "imported" }
  ctx.host.providerSecrets.read.mockReturnValue(JSON.stringify(document("claude-code")))
  const updated = { ...document("claude-code"), claudeAiOauth: { accessToken: "new" } }
  const sync = ctx.host.providerSecrets.syncClaudeCodeCredentials
  sync
    .mockReturnValueOnce(JSON.stringify({ kind: "deferred", retryAfterSeconds: 7200 }))
    .mockReturnValueOnce(JSON.stringify({ kind: "deferred", retryAfterSeconds: 60 }))
    .mockReturnValueOnce(JSON.stringify(updated))
    .mockReturnValue(JSON.stringify({ kind: "deferred", retryAfterSeconds: 60 }))
  usage(ctx)
  const loaded = await plugin()
  const path = ctx.app.pluginDataDir + "/rate-limit-verify-imported.json"
  for (const [streak, minutes] of [
    [1, 60],
    [2, 10],
  ]) {
    const retryAt = Date.now() + minutes * 60_000
    expect(() => loaded.probe(ctx)).toThrow("Claude account verification failed (HTTP 429)")
    expect(JSON.parse(ctx.host.fs.readText(path))).toEqual({
      retryAt,
      streak,
      recordedAt: Date.now(),
    })
    vi.setSystemTime(new Date(retryAt))
  }
  expect(ctx.host.http.request).not.toHaveBeenCalled()
  loaded.probe(ctx)
  expect(JSON.parse(ctx.host.fs.readText(path))).toEqual({
    retryAt: 0,
    streak: 0,
    recordedAt: Date.now(),
  })
  expect(() => loaded.probe(ctx)).toThrow("Claude account verification failed (HTTP 429)")
  expect(JSON.parse(ctx.host.fs.readText(path))).toEqual({
    retryAt: Date.now() + 300_000,
    streak: 1,
    recordedAt: Date.now(),
  })
  for (const prefix of ["rate-limit-", "rate-limit-web-", "rate-limit-refresh-"]) {
    expect(ctx.host.fs.exists(ctx.app.pluginDataDir + "/" + prefix + "imported.json")).toBe(false)
  }
  expect(ctx.host.http.request).toHaveBeenCalledOnce()
})
