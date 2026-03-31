import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const CLOUD_COMPAT_VERSION = "1.108.2"

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

function makeAuthStatus(apiKey = "sk-ws-01-test") {
  return JSON.stringify([{ value: JSON.stringify({ apiKey }) }])
}

function makeQuotaResponse(overrides) {
  const base = {
    userStatus: {
      planStatus: {
        planInfo: {
          planName: "Teams",
          billingStrategy: "BILLING_STRATEGY_QUOTA",
        },
        dailyQuotaRemainingPercent: 100,
        weeklyQuotaRemainingPercent: 100,
        overageBalanceMicros: "964220000",
        dailyQuotaResetAtUnix: "1774080000",
        weeklyQuotaResetAtUnix: "1774166400",
      },
    },
  }

  if (overrides) {
    base.userStatus.planStatus = {
      ...base.userStatus.planStatus,
      ...overrides,
      planInfo: {
        ...base.userStatus.planStatus.planInfo,
        ...(overrides.planInfo || {}),
      },
    }
  }

  return base
}

function setupCloudMock(ctx, { stableAuth, nextAuth, stableResponse, nextResponse }) {
  ctx.host.sqlite.query.mockImplementation((db, sql) => {
    if (!String(sql).includes("windsurfAuthStatus")) return "[]"
    if (String(db).includes("Windsurf - Next")) {
      return nextAuth ? makeAuthStatus(nextAuth) : "[]"
    }
    if (String(db).includes("Windsurf/User/globalStorage")) {
      return stableAuth ? makeAuthStatus(stableAuth) : "[]"
    }
    return "[]"
  })

  ctx.host.http.request.mockImplementation((requestOptions) => {
    const body = JSON.parse(String(requestOptions.bodyText || "{}"))
    const ideName = body.metadata && body.metadata.ideName
    if (ideName === "windsurf-next") {
      if (nextResponse instanceof Error) throw nextResponse
      return nextResponse || { status: 500, bodyText: "{}" }
    }
    if (ideName === "windsurf") {
      if (stableResponse instanceof Error) throw stableResponse
      return stableResponse || { status: 500, bodyText: "{}" }
    }
    return { status: 500, bodyText: "{}" }
  })
}

describe("windsurf plugin", () => {
  beforeEach(() => {
    delete globalThis.__openusage_plugin
    vi.resetModules()
  })

  it("renders quota-only lines from the cloud response", async () => {
    const ctx = makeCtx()
    setupCloudMock(ctx, {
      stableAuth: "sk-ws-01-stable",
      stableResponse: { status: 200, bodyText: JSON.stringify(makeQuotaResponse()) },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Teams")
    expect(result.lines).toEqual([
      {
        type: "progress",
        label: "Daily quota",
        used: 0,
        limit: 100,
        format: { kind: "percent" },
        resetsAt: "2026-03-21T08:00:00.000Z",
        periodDurationMs: 24 * 60 * 60 * 1000,
      },
      {
        type: "progress",
        label: "Weekly quota",
        used: 0,
        limit: 100,
        format: { kind: "percent" },
        resetsAt: "2026-03-22T08:00:00.000Z",
        periodDurationMs: 7 * 24 * 60 * 60 * 1000,
      },
      {
        type: "text",
        label: "Extra usage balance",
        value: "$964.22",
      },
    ])
  })

  it("uses the Windows state DB path on Windows", async () => {
    const ctx = makeCtx()
    ctx.app.platform = "windows"
    setupCloudMock(ctx, {
      stableAuth: "sk-ws-01-stable",
      stableResponse: { status: 200, bodyText: JSON.stringify(makeQuotaResponse()) },
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(ctx.host.sqlite.query).toHaveBeenCalledWith(
      "~/AppData/Roaming/Windsurf/User/globalStorage/state.vscdb",
      "SELECT value FROM ItemTable WHERE key = 'windsurfAuthStatus' LIMIT 1"
    )
    const requestBody = JSON.parse(String(ctx.host.http.request.mock.calls[0][0].bodyText))
    expect(requestBody.metadata.ideVersion).toBe(CLOUD_COMPAT_VERSION)
    expect(requestBody.metadata.extensionVersion).toBe(CLOUD_COMPAT_VERSION)
  })

  it("uses windsurf-next metadata when only the Next auth DB is available", async () => {
    const ctx = makeCtx()
    setupCloudMock(ctx, {
      nextAuth: "sk-ws-01-next",
      nextResponse: {
        status: 200,
        bodyText: JSON.stringify(makeQuotaResponse({ planInfo: { planName: "Pro" } })),
      },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Pro")
    const requestBody = JSON.parse(String(ctx.host.http.request.mock.calls[0][0].bodyText))
    expect(requestBody.metadata.ideName).toBe("windsurf-next")
    expect(requestBody.metadata.extensionName).toBe("windsurf-next")
  })

  it("falls through when the first variant returns no userStatus", async () => {
    const ctx = makeCtx()
    setupCloudMock(ctx, {
      stableAuth: "sk-ws-01-stable",
      nextAuth: "sk-ws-01-next",
      stableResponse: { status: 200, bodyText: "{}" },
      nextResponse: {
        status: 200,
        bodyText: JSON.stringify(makeQuotaResponse({ planInfo: { planName: "Next" } })),
      },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Next")
    expect(ctx.host.http.request).toHaveBeenCalledTimes(2)
  })

  it("prefers the stable Windsurf variant when both auth DBs are available", async () => {
    const ctx = makeCtx()
    setupCloudMock(ctx, {
      stableAuth: "sk-ws-01-stable",
      nextAuth: "sk-ws-01-next",
      stableResponse: { status: 200, bodyText: JSON.stringify(makeQuotaResponse()) },
      nextResponse: {
        status: 200,
        bodyText: JSON.stringify(makeQuotaResponse({ planInfo: { planName: "Next" } })),
      },
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(ctx.host.http.request).toHaveBeenCalledTimes(1)
    const requestBody = JSON.parse(String(ctx.host.http.request.mock.calls[0][0].bodyText))
    expect(requestBody.metadata.ideName).toBe("windsurf")
  })

  it("returns a login hint on cloud auth failures", async () => {
    const ctx = makeCtx()
    setupCloudMock(ctx, {
      stableAuth: "sk-ws-01-stable",
      stableResponse: { status: 401, bodyText: "{}" },
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Start Windsurf or sign in and try again.")
  })

  it("returns a quota hint when the cloud payload is not the new quota shape", async () => {
    const ctx = makeCtx()
    setupCloudMock(ctx, {
      stableAuth: "sk-ws-01-stable",
      stableResponse: {
        status: 200,
        bodyText: JSON.stringify({
          userStatus: {
            planStatus: {
              planInfo: { planName: "Legacy" },
              availablePromptCredits: 50000,
            },
          },
        }),
      },
    })

    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Windsurf quota data unavailable. Try again later.")
    expect(ctx.host.log.warn).toHaveBeenCalledWith("quota contract unavailable for windsurf")
  })

  it("clamps percentage usage from remaining quota values", async () => {
    const ctx = makeCtx()
    setupCloudMock(ctx, {
      stableAuth: "sk-ws-01-stable",
      stableResponse: {
        status: 200,
        bodyText: JSON.stringify(
          makeQuotaResponse({
            dailyQuotaRemainingPercent: -20,
            weeklyQuotaRemainingPercent: 25,
          })
        ),
      },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Daily quota")?.used).toBe(100)
    expect(result.lines.find((line) => line.label === "Weekly quota")?.used).toBe(75)
  })

  it("does not probe the local language server anymore", async () => {
    const ctx = makeCtx()
    setupCloudMock(ctx, {
      stableAuth: "sk-ws-01-stable",
      stableResponse: { status: 200, bodyText: JSON.stringify(makeQuotaResponse()) },
    })

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    expect(ctx.host.ls.discover).not.toHaveBeenCalled()
    expect(String(ctx.host.http.request.mock.calls[0][0].url)).toContain(
      "server.self-serve.windsurf.com/exa.seat_management_pb.SeatManagementService/GetUserStatus"
    )
  })
})
