import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

function makeDiscovery(overrides) {
  return Object.assign(
    { pid: 12345, csrf: "test-csrf-token", ports: [42001], extensionPort: null },
    overrides
  )
}

function makeUserStatusResponse(overrides) {
  const base = {
    userStatus: {
      planStatus: {
        planInfo: { planName: "Pro" },
      },
      cascadeModelConfigData: {
        clientModelConfigs: [
          {
            label: "Gemini 3.1 Pro (High)",
            modelOrAlias: { model: "MODEL_PLACEHOLDER_M37" },
            quotaInfo: { remainingFraction: 0.8, resetTime: "2026-02-08T09:10:56Z" },
          },
          {
            label: "Gemini 3.1 Pro (Low)",
            modelOrAlias: { model: "MODEL_PLACEHOLDER_M36" },
            quotaInfo: { remainingFraction: 0.8, resetTime: "2026-02-08T09:10:56Z" },
          },
          {
            label: "Claude Sonnet 4.6 (Thinking)",
            modelOrAlias: { model: "MODEL_PLACEHOLDER_M35" },
            quotaInfo: { remainingFraction: 0.6, resetTime: "2026-02-26T15:23:41Z" },
          },
          {
            label: "GPT-OSS 120B (Medium)",
            modelOrAlias: { model: "MODEL_OPENAI_GPT_OSS_120B_MEDIUM" },
            quotaInfo: { remainingFraction: 0.6, resetTime: "2026-02-26T15:23:41Z" },
          },
        ],
        clientModelSorts: [
          {
            groups: [
              {
                modelLabels: [
                  "Gemini 3.1 Pro (High)",
                  "Gemini 3.1 Pro (Low)",
                  "Claude Sonnet 4.6 (Thinking)",
                  "GPT-OSS 120B (Medium)",
                ],
              },
            ],
          },
        ],
      },
    },
  }
  return Object.assign(base, overrides)
}

function makeCloudCodeResponse(overrides) {
  return Object.assign(
    {
      models: {
        "gemini-3-pro-high": {
          displayName: "Gemini 3 Pro (High)",
          model: "MODEL_PLACEHOLDER_M37",
          quotaInfo: { remainingFraction: 0.7, resetTime: "2026-02-08T10:00:00Z" },
        },
        "claude-opus-4-6-thinking": {
          displayName: "Claude Opus 4.6 (Thinking)",
          model: "MODEL_PLACEHOLDER_M26",
          quotaInfo: { remainingFraction: 0.5, resetTime: "2026-02-08T10:00:00Z" },
        },
      },
      agentModelSorts: [
        {
          groups: [
            {
              modelIds: ["gemini-3-pro-high", "claude-opus-4-6-thinking"],
            },
          ],
        },
      ],
    },
    overrides
  )
}

function makeAuthStatusJson(overrides) {
  return JSON.stringify(Object.assign({ apiKey: "test-api-key-123" }, overrides))
}

function setupSqliteMock(ctx, authJson, protoBase64) {
  ctx.host.sqlite.query.mockImplementation((db, sql) => {
    if (sql.includes("agentManagerInitState") && protoBase64) return JSON.stringify([{ value: protoBase64 }])
    if (sql.includes("antigravityAuthStatus") && authJson) return JSON.stringify([{ value: authJson }])
    return "[]"
  })
}

function makeProtobufBase64(ctx, accessToken, refreshToken, expirySeconds) {
  function encodeVarint(n) {
    let bytes = ""
    while (n > 0x7f) {
      bytes += String.fromCharCode((n & 0x7f) | 0x80)
      n = Math.floor(n / 128)
    }
    return bytes + String.fromCharCode(n & 0x7f)
  }
  function encodeField(fieldNum, wireType, data) {
    const tag = encodeVarint(fieldNum * 8 + wireType)
    if (wireType === 2) return tag + encodeVarint(data.length) + data
    if (wireType === 0) return tag + encodeVarint(data)
    return ""
  }
  let inner = ""
  if (accessToken) inner += encodeField(1, 2, accessToken)
  if (refreshToken) inner += encodeField(3, 2, refreshToken)
  if (expirySeconds !== undefined && expirySeconds !== null) inner += encodeField(4, 2, encodeField(1, 0, expirySeconds))
  return ctx.base64.encode(encodeField(6, 2, inner))
}

function getProgressLabels(result) {
  return result.lines.filter((line) => line.type === "progress").map((line) => line.label)
}

function getLine(result, label) {
  return result.lines.find((line) => line.label === label)
}

describe("antigravity plugin", () => {
  beforeEach(() => {
    delete globalThis.__openusage_plugin
    vi.resetModules()
  })

  it("throws when LS is missing and no credentials are available", async () => {
    const ctx = makeCtx()
    ctx.host.ls.discover.mockReturnValue(null)

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Start Antigravity and try again.")
  })

  it("renders grouped-only LS quota lines", async () => {
    const ctx = makeCtx()
    ctx.host.ls.discover.mockReturnValue(makeDiscovery())
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetUnleashData")) return { status: 200, bodyText: "{}" }
      return { status: 200, bodyText: JSON.stringify(makeUserStatusResponse()) }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Pro")
    expect(getProgressLabels(result)).toEqual(["Gemini Pro", "Claude"])
    expect(result.lines).toHaveLength(2)
    expect(getLine(result, "Gemini Pro").used).toBe(20)
    expect(getLine(result, "Claude").used).toBe(40)
  })

  it("falls back to Cloud Code when LS has no usable fractions", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeAuthStatusJson(), makeProtobufBase64(ctx, "ya29.good", "1//refresh", futureExpiry))
    ctx.host.ls.discover.mockReturnValue(makeDiscovery())
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("GetUnleashData")) return { status: 200, bodyText: "{}" }
      if (url.includes("GetUserStatus")) {
        return {
          status: 200,
          bodyText: JSON.stringify(makeUserStatusResponse({
            userStatus: {
              planStatus: { planInfo: { planName: "Pro" } },
              cascadeModelConfigData: {
                clientModelConfigs: [
                  { label: "Gemini 3.1 Pro (High)", modelOrAlias: { model: "MODEL_PLACEHOLDER_M37" }, quotaInfo: { resetTime: "2026-02-08T09:10:56Z" } },
                  { label: "Claude Sonnet 4.6 (Thinking)", modelOrAlias: { model: "MODEL_PLACEHOLDER_M35" }, quotaInfo: { resetTime: "2026-02-26T15:23:41Z" } },
                ],
              },
            },
          })),
        }
      }
      if (url.includes("fetchAvailableModels")) {
        return { status: 200, bodyText: JSON.stringify(makeCloudCodeResponse()) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Pro")
    expect(getProgressLabels(result)).toEqual(["Gemini Pro", "Claude"])
    expect(getLine(result, "Gemini Pro").used).toBe(30)
    expect(getLine(result, "Claude").used).toBe(50)
  })

  it("does not turn missing fractions into 100 percent when LS is partial", async () => {
    const ctx = makeCtx()
    ctx.host.ls.discover.mockReturnValue(makeDiscovery())
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetUnleashData")) return { status: 200, bodyText: "{}" }
      return {
        status: 200,
        bodyText: JSON.stringify(makeUserStatusResponse({
          userStatus: {
            planStatus: { planInfo: { planName: "Pro" } },
            cascadeModelConfigData: {
              clientModelConfigs: [
                { label: "Gemini 3.1 Pro (High)", modelOrAlias: { model: "MODEL_PLACEHOLDER_M37" }, quotaInfo: { remainingFraction: 0.75, resetTime: "2026-02-08T09:10:56Z" } },
                { label: "Gemini 3.1 Pro (Low)", modelOrAlias: { model: "MODEL_PLACEHOLDER_M36" }, quotaInfo: { resetTime: "2026-02-08T09:10:56Z" } },
                { label: "Claude Sonnet 4.6 (Thinking)", modelOrAlias: { model: "MODEL_PLACEHOLDER_M35" }, quotaInfo: { remainingFraction: 0.6, resetTime: "2026-02-26T15:23:41Z" } },
              ],
            },
          },
        })),
      }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(getProgressLabels(result)).toEqual(["Gemini Pro", "Claude"])
    expect(getLine(result, "Gemini Pro").used).toBe(25)
    expect(getLine(result, "Claude").used).toBe(40)
  })

  it("returns quota unavailable when neither LS nor Cloud Code yield usable fractions", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeAuthStatusJson(), makeProtobufBase64(ctx, "ya29.good", "1//refresh", futureExpiry))
    ctx.host.ls.discover.mockReturnValue(makeDiscovery())
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("GetUnleashData")) return { status: 200, bodyText: "{}" }
      if (url.includes("GetUserStatus")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            userStatus: {
              planStatus: { planInfo: { planName: "Pro" } },
              cascadeModelConfigData: {
                clientModelConfigs: [
                  { label: "Gemini 3.1 Pro (High)", modelOrAlias: { model: "MODEL_PLACEHOLDER_M37" }, quotaInfo: { resetTime: "2026-02-08T09:10:56Z" } },
                ],
              },
            },
          }),
        }
      }
      if (url.includes("fetchAvailableModels")) {
        return {
          status: 200,
          bodyText: JSON.stringify({
            models: {
              "gemini-3-pro-high": {
                displayName: "Gemini 3 Pro (High)",
                model: "MODEL_PLACEHOLDER_M37",
                quotaInfo: { resetTime: "2026-02-08T10:00:00Z" },
              },
            },
          }),
        }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Pro")
    expect(result.lines).toEqual([
      { type: "badge", label: "Status", text: "Quota unavailable", color: "#a3a3a3" },
    ])
  })

  it("preserves valid placeholder-backed models when grouping", async () => {
    const ctx = makeCtx()
    ctx.host.ls.discover.mockReturnValue(makeDiscovery())
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetUnleashData")) return { status: 200, bodyText: "{}" }
      return {
        status: 200,
        bodyText: JSON.stringify({
          userStatus: {
            planStatus: { planInfo: { planName: "Pro" } },
            cascadeModelConfigData: {
              clientModelConfigs: [
                { label: "Gemini 3 Pro Image", modelOrAlias: { model: "MODEL_PLACEHOLDER_M9" }, quotaInfo: { remainingFraction: 0.65, resetTime: "2026-02-08T09:10:56Z" } },
                { label: "Claude Opus 4.5 (Thinking)", modelOrAlias: { model: "MODEL_PLACEHOLDER_M12" }, quotaInfo: { remainingFraction: 0.55, resetTime: "2026-02-08T09:10:56Z" } },
              ],
            },
          },
        }),
      }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(getProgressLabels(result)).toEqual(["Gemini Image", "Claude"])
    expect(getLine(result, "Gemini Image").used).toBe(35)
    expect(getLine(result, "Claude").used).toBe(45)
  })

  it("skips truly internal Cloud Code models", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeAuthStatusJson(), makeProtobufBase64(ctx, "ya29.good", "1//refresh", futureExpiry))
    ctx.host.ls.discover.mockReturnValue(null)
    ctx.host.http.request.mockImplementation((opts) => {
      if (!String(opts.url).includes("fetchAvailableModels")) return { status: 500, bodyText: "" }
      return {
        status: 200,
        bodyText: JSON.stringify({
          models: {
            "chat_20706": {
              displayName: "Internal Chat",
              model: "MODEL_CHAT_20706",
              isInternal: true,
              quotaInfo: { remainingFraction: 1, resetTime: "2026-02-08T10:00:00Z" },
            },
            "gemini-3-flash": {
              displayName: "Gemini 3 Flash",
              model: "MODEL_PLACEHOLDER_M18",
              quotaInfo: { remainingFraction: 0.9, resetTime: "2026-02-08T10:00:00Z" },
            },
          },
        }),
      }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(getProgressLabels(result)).toEqual(["Gemini Flash"])
  })

  it("uses agentModelSorts ordering for grouped Cloud Code output", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeAuthStatusJson(), makeProtobufBase64(ctx, "ya29.good", "1//refresh", futureExpiry))
    ctx.host.ls.discover.mockReturnValue(null)
    ctx.host.http.request.mockImplementation((opts) => {
      if (!String(opts.url).includes("fetchAvailableModels")) return { status: 500, bodyText: "" }
      return {
        status: 200,
        bodyText: JSON.stringify({
          models: {
            "claude-opus-4-6-thinking": {
              displayName: "Claude Opus 4.6 (Thinking)",
              model: "MODEL_PLACEHOLDER_M26",
              quotaInfo: { remainingFraction: 0.5, resetTime: "2026-02-08T10:00:00Z" },
            },
            "gemini-3-flash": {
              displayName: "Gemini 3 Flash",
              model: "MODEL_PLACEHOLDER_M18",
              quotaInfo: { remainingFraction: 0.9, resetTime: "2026-02-08T10:00:00Z" },
            },
          },
          agentModelSorts: [
            {
              groups: [
                { modelIds: ["claude-opus-4-6-thinking", "gemini-3-flash"] },
              ],
            },
          ],
        }),
      }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(getProgressLabels(result)).toEqual(["Claude", "Gemini Flash"])
  })

  it("keeps LS priority when LS has usable grouped quota", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeAuthStatusJson(), makeProtobufBase64(ctx, "ya29.good", "1//refresh", futureExpiry))
    ctx.host.ls.discover.mockReturnValue(makeDiscovery())
    const calls = []
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      calls.push(url)
      if (url.includes("GetUnleashData")) return { status: 200, bodyText: "{}" }
      if (url.includes("GetUserStatus")) return { status: 200, bodyText: JSON.stringify(makeUserStatusResponse()) }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Pro")
    expect(calls.some((url) => url.includes("fetchAvailableModels"))).toBe(false)
  })

  it("includes apiKey in LS metadata when available", async () => {
    const ctx = makeCtx()
    setupSqliteMock(ctx, makeAuthStatusJson())
    ctx.host.ls.discover.mockReturnValue(makeDiscovery())
    let metadata = null
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("GetUnleashData")) return { status: 200, bodyText: "{}" }
      if (url.includes("GetUserStatus")) {
        metadata = JSON.parse(opts.bodyText).metadata
        return { status: 200, bodyText: JSON.stringify(makeUserStatusResponse()) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(metadata.apiKey).toBe("test-api-key-123")
  })

  it("decodes protobuf tokens and uses them for Cloud Code", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeAuthStatusJson(), makeProtobufBase64(ctx, "ya29.proto", "1//refresh", futureExpiry))
    ctx.host.ls.discover.mockReturnValue(null)
    let authHeader = null
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("fetchAvailableModels")) {
        authHeader = opts.headers.Authorization
        return { status: 200, bodyText: JSON.stringify(makeCloudCodeResponse()) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(authHeader).toBe("Bearer ya29.proto")
  })

  it("refreshes and caches a token when initial Cloud Code auth fails", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeAuthStatusJson(), makeProtobufBase64(ctx, "ya29.bad", "1//refresh", futureExpiry))
    ctx.host.ls.discover.mockReturnValue(null)

    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("oauth2.googleapis.com")) {
        return { status: 200, bodyText: JSON.stringify({ access_token: "ya29.refreshed", expires_in: 3599 }) }
      }
      if (url.includes("fetchAvailableModels")) {
        if (opts.headers.Authorization === "Bearer ya29.refreshed") {
          return { status: 200, bodyText: JSON.stringify(makeCloudCodeResponse()) }
        }
        return { status: 401, bodyText: '{"error":"unauthorized"}' }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(getProgressLabels(result)).toEqual(["Gemini Pro", "Claude"])
    expect(ctx.host.fs.writeText).toHaveBeenCalledWith(
      ctx.app.pluginDataDir + "/auth.json",
      expect.any(String)
    )
  })

  it("tries the extension port when discovered ports fail probing", async () => {
    const ctx = makeCtx()
    ctx.host.ls.discover.mockReturnValue(makeDiscovery({ ports: [99999], extensionPort: 42010 }))
    let usedPort = null
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("GetUnleashData") && url.includes("99999")) throw new Error("refused")
      if (url.includes("GetUserStatus")) {
        usedPort = Number(url.match(/:(\d+)\//)[1])
        return { status: 200, bodyText: JSON.stringify(makeUserStatusResponse()) }
      }
      return { status: 200, bodyText: "{}" }
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(usedPort).toBe(42010)
  })
})
