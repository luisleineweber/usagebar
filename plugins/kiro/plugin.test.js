import { beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { makeCtx } from "../test-helpers.js"

const TOKEN_PATH = "~/.aws/sso/cache/kiro-auth-token.json"
const WINDOWS_TOKEN_PATH = "~/.aws/sso/cache/kiro-auth-token.json"
const PROFILE_PATH = "~/Library/Application Support/Kiro/User/globalStorage/kiro.kiroagent/profile.json"
const WINDOWS_PROFILE_PATH = "~/AppData/Roaming/Kiro/User/globalStorage/kiro.kiroagent/profile.json"
const LOG_PATH =
  "~/Library/Application Support/Kiro/logs/20260406T235910/window1/exthost/kiro.kiroAgent/q-client.log"
const WINDOWS_LOG_PATH = "~/AppData/Roaming/Kiro/logs/20260406T235910/window1/exthost/kiro.kiroAgent/q-client.log"
const WINDOWS_CLI_SESSION_PATH = "~/.kiro/sessions/cli/session-1.json"

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

const makeToken = (overrides = {}) => ({
  accessToken: "kiro-access-token",
  refreshToken: "kiro-refresh-token",
  expiresAt: "2026-02-02T01:00:00.000Z",
  authMethod: "social",
  provider: "Google",
  profileArn: "arn:aws:codewhisperer:us-east-1:699475941385:profile/EHGA3GRVQMUK",
  ...overrides,
})

const makeStatePayload = (overrides = {}) => ({
  "kiro.resourceNotifications.usageState": {
    usageBreakdowns: [
      {
        type: "CREDIT",
        currentUsage: 0,
        usageLimit: 50,
        resetDate: "2026-05-01T00:00:00.000Z",
        displayName: "Credit",
        displayNamePlural: "Credits",
        freeTrialUsage: {
          currentUsage: 106.11,
          usageLimit: 500,
          expiryDate: "2026-05-03T15:09:55.196Z",
        },
      },
    ],
    timestamp: Date.parse("2026-02-01T23:58:00.000Z"),
    ...overrides,
  },
})

const makeUsageOutput = (overrides = {}) => ({
  nextDateReset: "2026-05-01T00:00:00.000Z",
  overageConfiguration: { overageStatus: "DISABLED" },
  subscriptionInfo: {
    subscriptionTitle: "KIRO FREE",
    type: "Q_DEVELOPER_STANDALONE_FREE",
  },
  usageBreakdownList: [
    {
      resourceType: "CREDIT",
      currentUsage: 0,
      currentUsageWithPrecision: 0,
      usageLimit: 50,
      usageLimitWithPrecision: 50,
      nextDateReset: "2026-05-01T00:00:00.000Z",
      displayName: "Credit",
      displayNamePlural: "Credits",
      freeTrialInfo: {
        currentUsage: 106,
        currentUsageWithPrecision: 106.11,
        usageLimit: 500,
        usageLimitWithPrecision: 500,
        freeTrialStatus: "ACTIVE",
        freeTrialExpiry: "2026-05-03T15:09:55.196Z",
      },
      bonuses: [],
    },
  ],
  ...overrides,
})

const writeToken = (ctx, token = makeToken(), path = TOKEN_PATH) => {
  ctx.host.fs.writeText(path, JSON.stringify(token, null, 2))
}

const writeProfile = (ctx, arn = makeToken().profileArn, path = PROFILE_PATH) => {
  ctx.host.fs.writeText(path, JSON.stringify({ arn, name: "Google" }, null, 2))
}

const mockStateDb = (ctx, payload) => {
  ctx.host.sqlite.query.mockImplementation((db, sql) => {
    if (String(sql).includes("kiro.kiroAgent")) {
      return JSON.stringify([{ value: JSON.stringify(payload) }])
    }
    return JSON.stringify([])
  })
}

const writeUsageLog = (ctx, output = makeUsageOutput(), loggedAt = "2026-02-01 23:57:00.000", path = LOG_PATH) => {
  const line =
    loggedAt +
    " [info] " +
    JSON.stringify({
      clientName: "CodeWhispererRuntimeClient",
      commandName: "GetUsageLimitsCommand",
      input: {
        origin: "AI_EDITOR",
        profileArn: makeToken().profileArn,
        resourceType: "AGENTIC_REQUEST",
      },
      output,
    })
  ctx.host.fs.writeText(path, line + "\n")
}

const writeCliSession = (ctx, path = WINDOWS_CLI_SESSION_PATH) => {
  ctx.host.fs.writeText(
    path,
    JSON.stringify(
      {
        session_state: {
          conversation_metadata: {
            user_turn_metadatas: [
              {
                end_timestamp: "2026-05-08T17:05:26.898478400Z",
                metering_usage: [{ value: 0.030855276782752895, unit: "credit", unitPlural: "credits" }],
              },
              {
                end_timestamp: "2026-05-08T17:05:58.664126400Z",
                metering_usage: [
                  { value: 0.03164164825870647, unit: "credit", unitPlural: "credits" },
                  { value: 0.07090904610281924, unit: "credit", unitPlural: "credits" },
                ],
              },
              {
                end_timestamp: "2026-04-30T23:59:59.000Z",
                metering_usage: [{ value: 99, unit: "credit", unitPlural: "credits" }],
              },
            ],
          },
        },
      },
      null,
      2
    )
  )
}

describe("kiro plugin", () => {
  beforeEach(() => {
    delete globalThis.__openusage_plugin
    vi.resetModules()
  })

  it("throws when auth token is missing", async () => {
    const ctx = makeCtx()
    const plugin = await loadPlugin()
    expect(() => plugin.probe(ctx)).toThrow("Open Kiro and sign in, then try again.")
  })

  it("uses Windows Kiro CLI sessions when desktop auth is missing", async () => {
    const ctx = makeCtx()
    ctx.app.platform = "windows"
    ctx.nowIso = "2026-05-10T12:00:00.000Z"
    writeCliSession(ctx)

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Kiro CLI")
    expect(result.lines.find((line) => line.label === "CLI Credits")).toMatchObject({
      type: "text",
      value: "0.13 credits used this month",
      subtitle: "From local Kiro CLI sessions",
    })
    expect(result.lines.find((line) => line.label === "Resets")).toMatchObject({
      type: "badge",
      text: "2026-06-01",
    })
    expect(result.lines.find((line) => line.label === "Source")).toEqual({
      type: "text",
      label: "Source",
      value: "CLI session files",
    })
    expect(ctx.host.http.request).not.toHaveBeenCalled()
  })

  it("uses local usage state and usage log metadata without hitting the network", async () => {
    const ctx = makeCtx()
    writeToken(ctx)
    mockStateDb(ctx, makeStatePayload())
    writeUsageLog(
      ctx,
      makeUsageOutput({
        usageBreakdownList: [
          {
            resourceType: "CREDIT",
            currentUsage: 1,
            currentUsageWithPrecision: 1,
            usageLimit: 50,
            usageLimitWithPrecision: 50,
            nextDateReset: "2026-05-01T00:00:00.000Z",
            displayName: "Credit",
            displayNamePlural: "Credits",
            freeTrialInfo: {
              currentUsage: 99,
              currentUsageWithPrecision: 99.5,
              usageLimit: 500,
              usageLimitWithPrecision: 500,
              freeTrialStatus: "ACTIVE",
              freeTrialExpiry: "2026-05-03T15:09:55.196Z",
            },
            bonuses: [],
          },
        ],
      })
    )

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Kiro Free")
    expect(result.lines.find((line) => line.label === "Credits")).toMatchObject({
      used: 0,
      limit: 50,
      format: { kind: "count", suffix: "credits" },
    })
    expect(result.lines.find((line) => line.label === "Bonus Credits")).toMatchObject({
      used: 106.11,
      limit: 500,
      format: { kind: "count", suffix: "credits" },
    })
    expect(result.lines.find((line) => line.label === "Overages")).toMatchObject({
      type: "badge",
      text: "Disabled",
    })
    expect(result.lines.find((line) => line.label === "Source")).toEqual({
      type: "text",
      label: "Source",
      value: "Desktop cache",
    })
    expect(ctx.host.http.request).not.toHaveBeenCalled()
  })

  it("falls back to the latest usage log when sqlite state is missing", async () => {
    const ctx = makeCtx()
    writeToken(ctx)
    writeUsageLog(ctx)
    ctx.host.http.request.mockReturnValue({
      status: 503,
      headers: {},
      bodyText: "{}",
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Kiro Free")
    expect(result.lines.find((line) => line.label === "Credits")).toMatchObject({
      used: 0,
      limit: 50,
    })
    expect(result.lines.find((line) => line.label === "Bonus Credits")).toMatchObject({
      used: 106.11,
      limit: 500,
    })
    expect(result.lines.find((line) => line.label === "Source")?.value).toBe("Usage log after live API failure")
    expect(ctx.host.http.request).toHaveBeenCalledTimes(1)
  })

  it("skips malformed newer Windows logs and uses an older valid usage log", async () => {
    const ctx = makeCtx()
    ctx.app.platform = "windows"
    writeToken(ctx, makeToken({ profileArn: "" }), WINDOWS_TOKEN_PATH)
    writeProfile(ctx, makeToken().profileArn, WINDOWS_PROFILE_PATH)
    ctx.host.fs.writeText(
      "~/AppData/Roaming/Kiro/logs/20260407T000000/window1/exthost/kiro.kiroAgent/q-client.log",
      "2026-02-02 00:00:00.000 [info] malformed latest log\n"
    )
    writeUsageLog(ctx, makeUsageOutput(), "2026-02-01 23:57:00.000", WINDOWS_LOG_PATH)
    ctx.host.http.request.mockReturnValue({
      status: 503,
      headers: {},
      bodyText: "{}",
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Kiro Free")
    expect(result.lines.find((line) => line.label === "Credits")).toMatchObject({
      used: 0,
      limit: 50,
    })
    expect(result.lines.find((line) => line.label === "Source")?.value).toBe("Usage log after live API failure")
    expect(ctx.host.http.request).toHaveBeenCalledTimes(1)
  })

  it("refreshes an expired token and fetches live usage when local data is unavailable", async () => {
    const ctx = makeCtx()
    writeToken(ctx, makeToken({ accessToken: "", expiresAt: "2026-02-01T00:00:00.000Z" }))
    writeProfile(ctx)

    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("/refreshToken")) {
        expect(JSON.parse(opts.bodyText)).toEqual({ refreshToken: "kiro-refresh-token" })
        return {
          status: 200,
          headers: {},
          bodyText: JSON.stringify({
            accessToken: "refreshed-access-token",
            refreshToken: "refreshed-refresh-token",
            expiresIn: 3600,
            profileArn: makeToken().profileArn,
          }),
        }
      }

      expect(String(opts.url)).toContain("https://q.us-east-1.amazonaws.com/getUsageLimits?")
      expect(opts.headers.Authorization).toBe("Bearer refreshed-access-token")
      return {
        status: 200,
        headers: {},
        bodyText: JSON.stringify(makeUsageOutput()),
      }
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Kiro Free")
    expect(result.lines.find((line) => line.label === "Credits")).toBeTruthy()
    expect(result.lines.find((line) => line.label === "Source")?.value).toBe("Live usage API")
    const savedToken = JSON.parse(ctx.host.fs.readText(TOKEN_PATH))
    expect(savedToken.accessToken).toBe("refreshed-access-token")
    expect(savedToken.refreshToken).toBe("refreshed-refresh-token")
  })

  it("adds TokenType for external IdP live requests", async () => {
    const ctx = makeCtx()
    writeToken(
      ctx,
      makeToken({
        authMethod: "external_idp",
        provider: "ExternalIdp",
        accessToken: "external-idp-token",
        refreshToken: "external-idp-refresh",
        profileArn: "",
      })
    )
    writeProfile(ctx)

    ctx.host.http.request.mockImplementation(() => ({
      status: 200,
      headers: {},
      bodyText: JSON.stringify(makeUsageOutput()),
    }))

    const plugin = await loadPlugin()
    plugin.probe(ctx)

    const usageRequest = ctx.host.http.request.mock.calls.find(([opts]) => String(opts.url).includes("/getUsageLimits?"))[0]
    expect(usageRequest.headers.TokenType).toBe("EXTERNAL_IDP")
  })

  it("falls back to stale local data when live fetch fails", async () => {
    const ctx = makeCtx()
    writeToken(ctx)
    mockStateDb(
      ctx,
      makeStatePayload({
        timestamp: Date.parse("2026-02-01T23:00:00.000Z"),
      })
    )

    ctx.host.http.request.mockReturnValue({
      status: 503,
      headers: {},
      bodyText: "{}",
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Credits")).toMatchObject({
      used: 0,
      limit: 50,
    })
    expect(result.plan).toBeUndefined()
    expect(result.lines.find((line) => line.label === "Source")?.value).toBe(
      "Desktop cache after live API failure"
    )
  })

  it("uses Windows token, state, profile, and log paths", async () => {
    const ctx = makeCtx()
    ctx.app.platform = "windows"
    writeToken(ctx, makeToken({ profileArn: "" }), WINDOWS_TOKEN_PATH)
    writeProfile(ctx, makeToken().profileArn, WINDOWS_PROFILE_PATH)
    writeUsageLog(ctx, makeUsageOutput(), "2026-02-01 23:57:00.000", WINDOWS_LOG_PATH)

    ctx.host.sqlite.query.mockImplementation((db, sql) => {
      expect(db).toBe("~/AppData/Roaming/Kiro/User/globalStorage/state.vscdb")
      if (String(sql).includes("kiro.kiroAgent")) {
        return JSON.stringify([{ value: JSON.stringify(makeStatePayload()) }])
      }
      return JSON.stringify([])
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.plan).toBe("Kiro Free")
    expect(ctx.host.http.request).not.toHaveBeenCalled()
  })

  it("declares actual output labels in the manifest", () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), "plugins/kiro/plugin.json"), "utf8"))
    expect(manifest.lines.map((line) => `${line.type}:${line.label}:${line.scope}`)).toEqual([
      "progress:Credits:overview",
      "text:CLI Credits:overview",
      "progress:Bonus Credits:detail",
      "badge:Overages:detail",
      "text:Source:detail",
    ])
  })
})
