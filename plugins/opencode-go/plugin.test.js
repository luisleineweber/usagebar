import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const AUTH_PATH = "~/.local/share/opencode/auth.json"
const GO_USAGE_URL = "https://opencode.ai/zen/go/v1/usage"

function goUsageResponse(usage = {
  rolling: { percent: 12.5, resetsAt: "2026-03-06T14:00:00.000Z" },
  weekly: { percent: 34, resetsAt: "2026-03-09T00:00:00.000Z" },
  monthly: { percent: 56.75, resetsAt: "2026-04-06T00:00:00.000Z" },
}) {
  return response(JSON.stringify({ usage }))
}

function noGoSubscriptionResponse() {
  return response(JSON.stringify({ error: { type: "EntitlementError" } }), 403)
}

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

function setAuth(ctx, value = "go-key", extras = {}) {
  ctx.goUsageResponse = noGoSubscriptionResponse()
  ctx.host.http.request.mockImplementation((request) =>
    request.url === GO_USAGE_URL ? ctx.goUsageResponse : undefined
  )
  ctx.host.fs.writeText(
    AUTH_PATH,
    JSON.stringify({
      "opencode-go": { type: "api-key", key: value, ...extras },
    })
  )
}

function setGoSubscriptionAuth(ctx, value = "go-key") {
  setAuth(ctx, value, { goSubscription: { status: "active" } })
  ctx.goUsageResponse = goUsageResponse()
}

function response(bodyText, status = 200) {
  return { status, bodyText, headers: {} }
}

function setZenConfig(
  ctx,
  cookieHeader = "auth=test; __Host-auth=test2",
  workspaceId = "wrk_01TESTWORKSPACE",
  payload = { billing: { currentBalance: 12.34 }, goSubscription: { status: "active" } }
) {
  ctx.host.providerSecrets.read.mockImplementation((key) =>
    key === "cookieHeader" ? cookieHeader : null
  )
  ctx.host.providerConfig = {
    get: vi.fn((key) => {
      if (key === "source") return "manual"
      if (key === "workspaceId") return workspaceId
      return null
    }),
  }
  const zenResponse = response(JSON.stringify(payload))
  ctx.host.http.request.mockImplementation((request) =>
    request.url === GO_USAGE_URL ? ctx.goUsageResponse || noGoSubscriptionResponse() : zenResponse
  )
  return workspaceId
}

function setHistoryQuery(ctx, rows, options = {}) {
  const list = Array.isArray(rows) ? rows : []
  ctx.host.sqlite.query.mockImplementation((dbPath, sql) => {
    expect(dbPath).toBe("~/.local/share/opencode/opencode.db")

    if (String(sql).includes("SELECT 1 AS present")) {
      if (options.assertFilters !== false) {
        expect(String(sql)).toContain(
          "json_extract(data, '$.providerID') IN ('opencode-go', 'opencode')"
        )
        expect(String(sql)).toContain("json_extract(data, '$.role') = 'assistant'")
        expect(String(sql)).toContain("json_type(data, '$.cost') IN ('integer', 'real')")
      }
      return JSON.stringify(list.length > 0 ? [{ present: 1 }] : [])
    }

    if (options.assertFilters !== false) {
      expect(String(sql)).toContain(
        "json_extract(data, '$.providerID') IN ('opencode-go', 'opencode')"
      )
      expect(String(sql)).toContain("json_extract(data, '$.role') = 'assistant'")
      expect(String(sql)).toContain("json_type(data, '$.cost') IN ('integer', 'real')")
      expect(String(sql)).toContain("COALESCE(json_extract(data, '$.time.created'), time_created)")
    }

    return JSON.stringify(list)
  })
}

describe("opencode-go plugin", () => {
  beforeEach(() => {
    delete globalThis.__openusage_plugin
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("ships plugin metadata with links and expected line layout", () => {
    const manifest = JSON.parse(readFileSync("plugins/opencode-go/plugin.json", "utf8"))

    expect(manifest.id).toBe("opencode-go")
    expect(manifest.name).toBe("OpenCode")
    expect(manifest.brandColor).toBe("#000000")
    expect(manifest.links).toEqual([
      { label: "Console", url: "https://opencode.ai/auth" },
      { label: "Docs", url: "https://opencode.ai/docs/go/" },
    ])
    expect(manifest.lines).toEqual([
      { type: "progress", label: "5h", scope: "overview", primaryOrder: 1 },
      { type: "progress", label: "Free", scope: "overview", primaryOrder: 1 },
      { type: "text", label: "Zen balance", scope: "detail" },
      { type: "text", label: "Zen source", scope: "detail" },
      { type: "text", label: "Zen auth source", scope: "detail" },
      { type: "text", label: "Zen endpoint", scope: "detail" },
      { type: "progress", label: "Weekly", scope: "detail" },
      { type: "progress", label: "Monthly", scope: "detail" },
    ])
  })

  it("throws when neither auth nor local history is present", async () => {
    const ctx = makeCtx()
    setHistoryQuery(ctx, [])

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow(
      "OpenCode Go not detected. Log in with OpenCode Go or use it locally first."
    )
  })

  it("does not render allowance bars from auth alone", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-06T12:00:00.000Z"))

    const ctx = makeCtx()
    setAuth(ctx, "go-key", { goSubscription: { status: "canceled" } })
    setHistoryQuery(ctx, [])

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Free")
    expect(result.lines).toEqual([
      {
        type: "badge",
        label: "Status",
        text: "No Go subscription usage",
        color: "#a3a3a3",
        subtitle: "Zen auth exists, but no local Go usage was found.",
      },
    ])
  })

  it("enables with history only when auth is absent", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-06T12:00:00.000Z"))

    const ctx = makeCtx()
    setHistoryQuery(ctx, [{ createdMs: Date.parse("2026-03-06T11:00:00.000Z"), cost: 3 }])

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Free")
    expect(result.lines[0]).toMatchObject({
      type: "progress",
      label: "Free",
      used: 0,
      limit: 200,
      format: { kind: "count", suffix: "requests" },
    })
  })

  it("accepts the current opencode auth key entry without assuming subscription usage", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-06T12:00:00.000Z"))

    const ctx = makeCtx()
    ctx.host.fs.writeText(
      AUTH_PATH,
      JSON.stringify({
        opencode: { type: "api-key", key: "current-go-key" },
      })
    )
    ctx.host.http.request.mockReturnValue(noGoSubscriptionResponse())
    setHistoryQuery(ctx, [])

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Free")
    expect(result.lines[0]).toMatchObject({
      type: "badge",
      label: "Status",
      text: "No Go subscription usage",
    })
  })

  it("does not treat stale paid history as a current Go subscription", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-05-26T12:00:00.000Z"))

    const ctx = makeCtx()
    setAuth(ctx, "go-key", { goSubscription: { status: "canceled" } })
    setHistoryQuery(ctx, [
      { createdMs: Date.parse("2026-05-26T10:00:00.000Z"), modelId: "qwen3.6-plus", cost: 1.2 },
    ])

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Free")
    expect(result.lines[0]).toMatchObject({
      type: "progress",
      label: "Free",
      used: 0,
      limit: 200,
      format: { kind: "count", suffix: "requests" },
    })
    expect(result.lines.some((line) => line.label === "5h")).toBe(false)
  })

  it("keeps authenticated free-only OpenCode rows on the Free plan", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-05-26T12:00:00.000Z"))

    const ctx = makeCtx()
    setAuth(ctx)
    setHistoryQuery(ctx, [
      { createdMs: Date.parse("2026-05-26T10:00:00.000Z"), modelId: "qwen3.6-plus-free", cost: 0 },
    ])

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Free")
    expect(result.lines).toEqual([
      {
        type: "progress",
        label: "Free",
        used: 1,
        limit: 200,
        format: { kind: "count", suffix: "requests" },
        resetsAt: "2026-05-26T15:00:00.000Z",
        periodDurationMs: 5 * 60 * 60 * 1000,
      },
    ])
  })

  it("accepts current opencode history rows as detection evidence", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-06T12:00:00.000Z"))

    const ctx = makeCtx()
    setHistoryQuery(ctx, [{ createdMs: Date.parse("2026-03-06T09:30:00.000Z"), cost: 1.2 }])

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Free")
    expect(result.lines[0]).toMatchObject({
      type: "progress",
      label: "Free",
      used: 0,
      limit: 200,
      format: { kind: "count", suffix: "requests" },
    })
  })

  it("tracks free OpenCode usage by 5h request count instead of dollar cost", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-06T12:00:00.000Z"))

    const ctx = makeCtx()
    setHistoryQuery(ctx, [
      { createdMs: Date.parse("2026-03-06T06:30:00.000Z"), modelId: "minimax-m2.5-free", cost: 0 },
      { createdMs: Date.parse("2026-03-06T08:00:00.000Z"), modelId: "minimax-m2.5-free", cost: 0 },
      { createdMs: Date.parse("2026-03-06T10:00:00.000Z"), modelId: "minimax-m2.5-free", cost: 0 },
    ])

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Free")
    expect(result.lines).toEqual([
      {
        type: "progress",
        label: "Free",
        used: 2,
        limit: 200,
        format: { kind: "count", suffix: "requests" },
        resetsAt: "2026-03-06T13:00:00.000Z",
        periodDurationMs: 5 * 60 * 60 * 1000,
      },
    ])
  })

  it("does not count non-free model rows in Free mode", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-05-19T12:00:00.000Z"))

    const ctx = makeCtx()
    setHistoryQuery(ctx, [
      { createdMs: Date.parse("2026-05-19T10:00:00.000Z"), modelId: "qwen3.6-plus-free", cost: 0 },
      { createdMs: Date.parse("2026-05-19T10:05:00.000Z"), modelId: "qwen3.6-plus", cost: 0 },
    ])

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Free")
    expect(result.lines[0]).toMatchObject({
      type: "progress",
      label: "Free",
      used: 1,
      limit: 200,
      format: { kind: "count", suffix: "requests" },
    })
  })

  it("adds the Zen balance to the Go tab when a Zen cookie is configured", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-06T12:00:00.000Z"))

    const ctx = makeCtx()
    setGoSubscriptionAuth(ctx)
    const workspaceId = setZenConfig(ctx)
    setHistoryQuery(ctx, [{ createdMs: Date.parse("2026-03-06T09:30:00.000Z"), cost: 1.2 }])

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(ctx.host.http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Cookie: "auth=test; __Host-auth=test2",
          Referer: `https://opencode.ai/workspace/${workspaceId}/billing`,
        }),
      })
    )
    expect(result.lines).toContainEqual({
      type: "text",
      label: "Zen balance",
      value: "$12.34",
      subtitle: "OpenCode Zen pay-as-you-go balance",
    })
    expect(result.lines).toContainEqual({
      type: "text",
      label: "Zen source",
      value: "OpenCode Zen signed-in website billing session",
    })
    expect(result.lines).toContainEqual({
      type: "text",
      label: "Zen auth source",
      value: "Stored Cookie header",
    })
    expect(result.lines).toContainEqual({
      type: "text",
      label: "Zen endpoint",
      value: "https://opencode.ai/_server",
    })
  })

  it("shows credit-only output when billing has no active Go subscription evidence", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-06T12:00:00.000Z"))

    const ctx = makeCtx()
    setZenConfig(ctx, "auth=stored", "wrk_01TESTWORKSPACE", {
      billing: { currentBalance: 12.34 },
    })
    setHistoryQuery(ctx, [
      { createdMs: Date.parse("2026-03-06T09:30:00.000Z"), modelId: "glm-5.1", cost: 1.2 },
      { createdMs: Date.parse("2026-03-05T09:30:00.000Z"), modelId: "glm-5.1", cost: 2.4 },
    ])

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Free")
    expect(result.lines).toEqual([
      {
        type: "progress",
        label: "Free",
        used: 0,
        limit: 200,
        format: { kind: "count", suffix: "requests" },
        resetsAt: "2026-03-06T14:30:00.000Z",
        periodDurationMs: 5 * 60 * 60 * 1000,
      },
    ])
    expect(result.lines.some((line) => line.label === "5h")).toBe(false)
    expect(result.lines.some((line) => line.label === "Weekly")).toBe(false)
    expect(result.lines.some((line) => line.label === "Monthly")).toBe(false)
  })

  it("does not infer GoSubscription from unstructured billing text", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-05-19T12:00:00.000Z"))

    const ctx = makeCtx()
    setZenConfig(ctx, "auth=stored", "wrk_01TESTWORKSPACE", {
      billing: {
        currentBalance: 12.34,
        banner: "OpenCode Go subscription is available. Activate a plan any time.",
      },
    })
    setHistoryQuery(ctx, [
      { createdMs: Date.parse("2026-05-19T10:00:00.000Z"), modelId: "qwen3.6-plus-free", cost: 0 },
    ])

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Free")
    expect(result.lines).toEqual([
      {
        type: "progress",
        label: "Free",
        used: 1,
        limit: 200,
        format: { kind: "count", suffix: "requests" },
        resetsAt: "2026-05-19T15:00:00.000Z",
        periodDurationMs: 5 * 60 * 60 * 1000,
      },
    ])
  })

  it("uses the stored Zen cookie before OPENCODE_COOKIE_HEADER", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-06T12:00:00.000Z"))

    const ctx = makeCtx()
    setGoSubscriptionAuth(ctx)
    const workspaceId = setZenConfig(ctx, "auth=stored")
    ctx.host.env.get.mockImplementation((key) =>
      key === "OPENCODE_COOKIE_HEADER" ? "auth=stale-env" : null
    )
    setHistoryQuery(ctx, [{ createdMs: Date.parse("2026-03-06T09:30:00.000Z"), cost: 1.2 }])

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(ctx.host.http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Cookie: "auth=stored",
          Referer: `https://opencode.ai/workspace/${workspaceId}/billing`,
        }),
      })
    )
    expect(result.lines).toContainEqual({
      type: "text",
      label: "Zen auth source",
      value: "Stored Cookie header",
    })
  })

  it("keeps Go usage visible when the optional Zen balance read fails", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-06T12:00:00.000Z"))

    const ctx = makeCtx()
    setGoSubscriptionAuth(ctx)
    setZenConfig(ctx)
    ctx.host.http.request.mockImplementation((request) =>
      request.url === GO_USAGE_URL ? ctx.goUsageResponse : response("{}", 500)
    )
    setHistoryQuery(ctx, [{ createdMs: Date.parse("2026-03-06T09:30:00.000Z"), cost: 1.2 }])

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines[0]).toMatchObject({ type: "progress", label: "5h", used: 12.5 })
    expect(result.lines.some((line) => line.label === "Zen balance")).toBe(false)
    expect(ctx.host.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("opencode-go zen balance read failed: OpenCode Zen request failed")
    )
  })

  it("uses account-wide quota windows from the official usage endpoint", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-06T12:00:00.000Z"))

    const ctx = makeCtx()
    setGoSubscriptionAuth(ctx)
    setHistoryQuery(ctx, [{ createdMs: Date.parse("2026-03-06T09:30:00.000Z"), cost: 40 }])

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(ctx.host.http.request).toHaveBeenCalledWith({
      method: "GET",
      url: GO_USAGE_URL,
      headers: {
        Authorization: "Bearer go-key",
        Accept: "application/json",
      },
      timeoutMs: 15000,
    })
    expect(result.lines).toEqual([
      {
        type: "progress",
        label: "5h",
        used: 12.5,
        limit: 100,
        format: { kind: "percent" },
        resetsAt: "2026-03-06T14:00:00.000Z",
        periodDurationMs: 5 * 60 * 60 * 1000,
      },
      {
        type: "progress",
        label: "Weekly",
        used: 34,
        limit: 100,
        format: { kind: "percent" },
        resetsAt: "2026-03-09T00:00:00.000Z",
        periodDurationMs: 7 * 24 * 60 * 60 * 1000,
      },
      {
        type: "progress",
        label: "Monthly",
        used: 56.75,
        limit: 100,
        format: { kind: "percent" },
        resetsAt: "2026-04-06T00:00:00.000Z",
        periodDurationMs: 30 * 24 * 60 * 60 * 1000,
      },
    ])
  })

  it("reports a rejected Go key instead of using local quota math", async () => {
    const ctx = makeCtx()
    setGoSubscriptionAuth(ctx)
    ctx.goUsageResponse = response(JSON.stringify({ error: { type: "AuthError" } }), 401)
    setHistoryQuery(ctx, [{ createdMs: Date.now(), cost: 40 }])

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("OpenCode Go API key invalid")
  })

  it("keeps official meters when sqlite is unreadable", async () => {
    const ctx = makeCtx()
    setGoSubscriptionAuth(ctx)
    ctx.host.sqlite.query.mockImplementation(() => {
      throw new Error("disk I/O error")
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.plan).toBe("GoSubscription")
    expect(result.lines.find((line) => line.label === "5h")).toMatchObject({
      type: "progress",
      used: 12.5,
      limit: 100,
    })
  })

  it("keeps official meters when sqlite returns malformed JSON", async () => {
    const ctx = makeCtx()
    setGoSubscriptionAuth(ctx)
    ctx.host.sqlite.query.mockReturnValue("not-json")

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)
    expect(result.plan).toBe("GoSubscription")
    expect(result.lines.find((line) => line.label === "5h")).toMatchObject({
      type: "progress",
      used: 12.5,
      limit: 100,
    })
  })
})
