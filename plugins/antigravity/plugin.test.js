import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

const OAUTH_TOKEN_KEY = "antigravityUnifiedStateSync.oauthToken"
const OAUTH_TOKEN_SENTINEL = "oauthTokenInfoSentinelKey"

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
    if (sql.includes(OAUTH_TOKEN_KEY) && protoBase64) return JSON.stringify([{ value: protoBase64 }])
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
  const payload = encodeField(1, 2, ctx.base64.encode(inner))
  const wrapper = encodeField(1, 2, OAUTH_TOKEN_SENTINEL) + encodeField(2, 2, payload)
  return ctx.base64.encode(encodeField(1, 2, wrapper))
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

  it("caches live LS quota and reuses it while Antigravity is closed", async () => {
    const ctx = makeCtx()
    ctx.nowIso = "2026-02-02T00:00:00.000Z"
    ctx.host.ls.discover.mockReturnValue(makeDiscovery())
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetUnleashData")) return { status: 200, bodyText: "{}" }
      return { status: 200, bodyText: JSON.stringify(makeUserStatusResponse()) }
    })

    const plugin = await loadPlugin()
    const liveResult = plugin.probe(ctx)

    expect(getProgressLabels(liveResult)).toEqual(["Gemini Pro", "Claude"])
    expect(getLine(liveResult, "Gemini Pro").used).toBe(20)
    expect(getLine(liveResult, "Claude").used).toBe(40)

    ctx.host.ls.discover.mockReturnValue(null)
    ctx.host.http.request.mockClear()

    const cachedResult = plugin.probe(ctx)

    expect(getProgressLabels(cachedResult)).toEqual(["Gemini Pro", "Claude"])
    expect(getLine(cachedResult, "Gemini Pro").used).toBe(20)
    expect(getLine(cachedResult, "Claude").used).toBe(40)
    expect(ctx.host.http.request).not.toHaveBeenCalled()
    expect(ctx.host.log.warn).toHaveBeenCalledWith(
      "using cached live Antigravity usage because the language server is not running"
    )
  })

  it("deletes cached live usage after the stored reset window has passed", async () => {
    const ctx = makeCtx()
    ctx.nowIso = "2026-02-02T00:00:00.000Z"
    ctx.host.ls.discover.mockReturnValue(makeDiscovery())
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetUnleashData")) return { status: 200, bodyText: "{}" }
      return { status: 200, bodyText: JSON.stringify(makeUserStatusResponse({
        userStatus: {
          planStatus: {
            planInfo: { planName: "Pro" },
          },
          cascadeModelConfigData: {
            clientModelConfigs: [
              {
                label: "Gemini 3.1 Pro (High)",
                modelOrAlias: { model: "MODEL_PLACEHOLDER_M37" },
                quotaInfo: { remainingFraction: 0.8, resetTime: "2026-02-02T01:00:00Z" },
              },
              {
                label: "Claude Sonnet 4.6 (Thinking)",
                modelOrAlias: { model: "MODEL_PLACEHOLDER_M35" },
                quotaInfo: { remainingFraction: 0.6, resetTime: "2026-02-02T02:00:00Z" },
              },
            ],
          },
        },
      })) }
    })

    const plugin = await loadPlugin()
    const liveResult = plugin.probe(ctx)

    expect(getProgressLabels(liveResult)).toEqual(["Gemini Pro", "Claude"])

    ctx.nowIso = "2026-02-02T03:00:00.000Z"
    ctx.host.ls.discover.mockReturnValue(null)
    ctx.host.http.request.mockClear()

    expect(() => plugin.probe(ctx)).toThrow("Start Antigravity and try again.")
    expect(ctx.host.fs.remove).toHaveBeenCalledWith("/tmp/openusage-test/plugin/last-live-usage.json")
    expect(ctx.host.log.warn).toHaveBeenCalledWith(
      "deleted cached live Antigravity usage: cached reset window elapsed"
    )
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

  it("renders Claude as exhausted when Antigravity only reports a reset time", async () => {
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
                {
                  label: "Gemini 3.1 Pro (High)",
                  modelOrAlias: { model: "MODEL_PLACEHOLDER_M37" },
                  quotaInfo: { remainingFraction: 1, resetTime: "2026-02-08T09:10:56Z" },
                },
                {
                  label: "Gemini 3 Flash",
                  modelOrAlias: { model: "MODEL_PLACEHOLDER_M18" },
                  quotaInfo: { remainingFraction: 1, resetTime: "2026-02-08T09:10:56Z" },
                },
                {
                  label: "Claude Sonnet 4.6 (Thinking)",
                  modelOrAlias: { model: "MODEL_PLACEHOLDER_M35" },
                  quotaInfo: { resetTime: "2026-02-02T16:13:00Z" },
                },
                {
                  label: "Claude Opus 4.6 (Thinking)",
                  modelOrAlias: { model: "MODEL_PLACEHOLDER_M26" },
                  quotaInfo: { resetTime: "2026-02-02T16:13:00Z" },
                },
                {
                  label: "GPT-OSS 120B (Medium)",
                  modelOrAlias: { model: "MODEL_OPENAI_GPT_OSS_120B_MEDIUM" },
                  quotaInfo: { resetTime: "2026-02-02T16:13:00Z" },
                },
              ],
              clientModelSorts: [
                {
                  groups: [
                    {
                      modelLabels: [
                        "Gemini 3.1 Pro (High)",
                        "Gemini 3 Flash",
                        "Claude Sonnet 4.6 (Thinking)",
                        "Claude Opus 4.6 (Thinking)",
                        "GPT-OSS 120B (Medium)",
                      ],
                    },
                  ],
                },
              ],
            },
          },
        })),
      }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(getProgressLabels(result)).toEqual(["Gemini Pro", "Gemini Flash", "Claude"])
    expect(getLine(result, "Gemini Pro").used).toBe(0)
    expect(getLine(result, "Gemini Flash").used).toBe(0)
    expect(getLine(result, "Claude").used).toBe(100)
    expect(getLine(result, "Claude").resetsAt).toBe("2026-02-02T16:13:00Z")
  })

  it("groups Anthropic model labels without Claude in the name", async () => {
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
                {
                  label: "Gemini 3.1 Pro (High)",
                  modelOrAlias: { model: "MODEL_PLACEHOLDER_M37" },
                  quotaInfo: { remainingFraction: 0.8, resetTime: "2026-02-08T09:10:56Z" },
                },
                {
                  label: "Sonnet 4.6 (Thinking)",
                  modelOrAlias: { model: "MODEL_PLACEHOLDER_NEW_SONNET" },
                  quotaInfo: { remainingFraction: 0.55, resetTime: "2026-02-08T09:10:56Z" },
                },
              ],
              clientModelSorts: [
                { groups: [{ modelLabels: ["Gemini 3.1 Pro (High)", "Sonnet 4.6 (Thinking)"] }] },
              ],
            },
          },
        })),
      }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(getProgressLabels(result)).toEqual(["Gemini Pro", "Claude"])
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

  it("does not include apiKey in LS metadata", async () => {
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

    expect(metadata.apiKey).toBeUndefined()
    expect(metadata.ideName).toBe("antigravity")
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

  it("prefers a valid cached token before DB refresh", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeAuthStatusJson(), makeProtobufBase64(ctx, "ya29.proto", "1//refresh", futureExpiry))
    ctx.host.ls.discover.mockReturnValue(null)
    ctx.host.fs.writeText(
      ctx.app.pluginDataDir + "/auth.json",
      JSON.stringify({ accessToken: "ya29.cached", expiresAtMs: Date.now() + 3600 * 1000 })
    )

    const authHeaders = []
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("oauth2.googleapis.com")) return { status: 500, bodyText: "" }
      if (url.includes("fetchAvailableModels")) {
        authHeaders.push(opts.headers.Authorization)
        if (opts.headers.Authorization === "Bearer ya29.cached") {
          return { status: 200, bodyText: JSON.stringify(makeCloudCodeResponse()) }
        }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(getProgressLabels(result)).toEqual(["Gemini Pro", "Claude"])
    expect(authHeaders).toEqual(["Bearer ya29.cached"])
  })

  it("refreshes when the DB access token is expired", async () => {
    const ctx = makeCtx()
    const pastExpiry = Math.floor(Date.now() / 1000) - 60
    setupSqliteMock(ctx, makeAuthStatusJson({ apiKey: "ya29.apiKey" }), makeProtobufBase64(ctx, "ya29.expired", "1//refresh", pastExpiry))
    ctx.host.ls.discover.mockReturnValue(null)

    const authHeaders = []
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("oauth2.googleapis.com")) {
        return { status: 200, bodyText: JSON.stringify({ access_token: "ya29.refreshed", expires_in: 3599 }) }
      }
      if (url.includes("fetchAvailableModels")) {
        authHeaders.push(opts.headers.Authorization)
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
    expect(authHeaders).toEqual(["Bearer ya29.refreshed"])
    expect(ctx.host.log.warn).toHaveBeenCalledWith("DB access token expired; skipping direct Cloud Code attempt")
    expect(ctx.host.log.warn).toHaveBeenCalledWith("attempting Antigravity refresh-token recovery")
  })

  it("refreshes after cached and DB token auth failures", async () => {
    const ctx = makeCtx()
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600
    setupSqliteMock(ctx, makeAuthStatusJson({ apiKey: "ya29.apiKey" }), makeProtobufBase64(ctx, "ya29.proto", "1//refresh", futureExpiry))
    ctx.host.ls.discover.mockReturnValue(null)
    ctx.host.fs.writeText(
      ctx.app.pluginDataDir + "/auth.json",
      JSON.stringify({ accessToken: "ya29.cached", expiresAtMs: Date.now() + 3600 * 1000 })
    )

    const authHeaders = []
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if (url.includes("oauth2.googleapis.com")) {
        return { status: 200, bodyText: JSON.stringify({ access_token: "ya29.refreshed", expires_in: 3599 }) }
      }
      if (url.includes("fetchAvailableModels")) {
        authHeaders.push(opts.headers.Authorization)
        if (opts.headers.Authorization === "Bearer ya29.cached") {
          return { status: 401, bodyText: '{"error":"unauthorized"}' }
        }
        if (opts.headers.Authorization === "Bearer ya29.proto") {
          return { status: 401, bodyText: '{"error":"unauthorized"}' }
        }
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
    expect(authHeaders).toEqual(["Bearer ya29.cached", "Bearer ya29.proto", "Bearer ya29.refreshed"])
    expect(ctx.host.log.warn).toHaveBeenCalledWith("cached Antigravity token rejected by Cloud Code auth")
    expect(ctx.host.log.warn).toHaveBeenCalledWith("DB access token rejected by Cloud Code auth")
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

  it("throws after logging the offline auth failures when refresh recovery is unavailable", async () => {
    const ctx = makeCtx()
    const pastExpiry = Math.floor(Date.now() / 1000) - 60
    setupSqliteMock(ctx, makeAuthStatusJson({ apiKey: "ya29.apiKey" }), makeProtobufBase64(ctx, "ya29.expired", null, pastExpiry))
    ctx.host.ls.discover.mockReturnValue(null)
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("fetchAvailableModels")) {
        return { status: 401, bodyText: '{"error":"unauthorized"}' }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()

    expect(() => plugin.probe(ctx)).toThrow("Start Antigravity and try again.")
    expect(ctx.host.log.warn).toHaveBeenCalledWith("DB access token expired; skipping direct Cloud Code attempt")
    expect(ctx.host.log.warn).toHaveBeenCalledWith("no Antigravity refresh token available for offline recovery")
    expect(ctx.host.http.request).not.toHaveBeenCalled()
  })

  it("tolerates cache write failures after a successful refresh", async () => {
    const ctx = makeCtx()
    const pastExpiry = Math.floor(Date.now() / 1000) - 60
    setupSqliteMock(ctx, makeAuthStatusJson({ apiKey: "ya29.apiKey" }), makeProtobufBase64(ctx, "ya29.expired", "1//refresh", pastExpiry))
    ctx.host.ls.discover.mockReturnValue(null)
    ctx.host.fs.writeText.mockImplementation(() => {
      throw new Error("disk full")
    })

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
    expect(ctx.host.log.warn).toHaveBeenCalledWith("failed to cache refreshed token: Error: disk full")
  })

  it("tries the extension port when discovered ports fail probing", async () => {
    const ctx = makeCtx()
    ctx.host.ls.discover.mockReturnValue(makeDiscovery({ ports: [99999], extensionPort: 42010 }))
    let usedPort = null
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      if ((url.includes("GetUserStatus") || url.includes("GetCommandModelConfigs")) && url.includes("99999")) {
        return { status: 404, bodyText: "" }
      }
      if (url.includes("GetUserStatus")) {
        usedPort = Number(url.match(/:(\d+)\//)[1])
        return { status: 200, bodyText: JSON.stringify(makeUserStatusResponse()) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(usedPort).toBe(42010)
  })

  it("skips unusable LS ports until one returns quota data", async () => {
    const ctx = makeCtx()
    ctx.host.ls.discover.mockReturnValue(makeDiscovery({ ports: [42001, 42002], extensionPort: 42010 }))
    let usedPort = null
    ctx.host.http.request.mockImplementation((opts) => {
      const url = String(opts.url)
      const port = Number(url.match(/:(\d+)\//)[1])
      if (url.includes("GetUserStatus")) {
        if (port === 42001) return { status: 404, bodyText: "" }
        usedPort = port
        return { status: 200, bodyText: JSON.stringify(makeUserStatusResponse()) }
      }
      if (url.includes("GetCommandModelConfigs")) {
        if (port === 42001) return { status: 404, bodyText: "" }
        return { status: 200, bodyText: JSON.stringify(makeUserStatusResponse({ userStatus: null, clientModelConfigs: [] })) }
      }
      return { status: 500, bodyText: "" }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Pro")
    expect(usedPort).toBe(42002)
    expect(getProgressLabels(result)).toEqual(["Gemini Pro", "Claude"])
  })
})
