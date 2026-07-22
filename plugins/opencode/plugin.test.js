import { readFileSync } from "node:fs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

function response(bodyText, status = 200) {
  return { status, bodyText, headers: {} }
}

function setManualCookie(ctx, cookieHeader = "auth=test; __Host-auth=test2") {
  ctx.host.providerSecrets.read.mockImplementation((key) =>
    key === "cookieHeader" ? cookieHeader : null
  )
}

function setWorkspace(ctx, workspaceId = "wrk_01TESTWORKSPACE") {
  ctx.host.providerConfig = {
    get: vi.fn((key) => {
      if (key === "source") return "manual"
      if (key === "workspaceId") return workspaceId
      return null
    }),
  }
  return workspaceId
}

function setOpenCodeDb(ctx, path = "~/.local/share/opencode/opencode.db") {
  ctx.host.fs.writeText(path, "sqlite fixture marker")
}

function setCostHistoryQuery(ctx, rows) {
  const list = Array.isArray(rows) ? rows : []
  ctx.host.sqlite.query.mockImplementation((dbPath, sql) => {
    expect(dbPath).toBe("~/.local/share/opencode/opencode.db")
    if (!String(sql).includes("AS modelId")) {
      expect(String(sql)).toContain(
        "json_extract(data, '$.providerID') IN ('opencode-go', 'opencode')"
      )
    }
    expect(String(sql)).toContain("json_extract(data, '$.role') = 'assistant'")
    if (!String(sql).includes("AS modelId")) {
      expect(String(sql)).toContain("json_type(data, '$.cost') IN ('integer', 'real')")
    }
    expect(String(sql)).toContain("COALESCE(json_extract(data, '$.time.created'), time_created)")
    return JSON.stringify(list)
  })
}

describe("opencode plugin", () => {
  beforeEach(() => {
    delete globalThis.__openusage_plugin
    vi.resetModules()
  })

  it("throws when no cookie header is configured", async () => {
    const ctx = makeCtx()
    const plugin = await loadPlugin()

    expect(() => plugin.probe(ctx)).toThrow(
      "Set OPENCODE_COOKIE_HEADER to your OpenCode cookie header."
    )
  })

  it("shows Zen pay-as-you-go balance from the billing response", async () => {
    const ctx = makeCtx()
    setManualCookie(ctx)
    const workspaceId = setWorkspace(ctx)
    ctx.host.sqlite.query.mockImplementation(() => {
      throw new Error("missing db")
    })
    ctx.host.http.request.mockReturnValue(
      response(
        JSON.stringify({
          billing: {
            currentBalance: 12.34,
          },
        })
      )
    )

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
    expect(result.lines).toEqual([
      {
        type: "text",
        label: "Balance",
        value: "$12.34",
        subtitle: "OpenCode Zen pay-as-you-go balance",
      },
      {
        type: "text",
        label: "Source",
        value: "OpenCode Zen signed-in website billing session",
      },
      {
        type: "text",
        label: "Auth source",
        value: "Stored Cookie header",
      },
      {
        type: "text",
        label: "Endpoint",
        value: "https://opencode.ai/_server",
      },
    ])
  })

  it("skips local cost windows when the OpenCode database is missing or unreadable", async () => {
    const ctx = makeCtx()
    setManualCookie(ctx)
    setWorkspace(ctx)
    ctx.host.sqlite.query.mockImplementation(() => {
      throw new Error("unable to open database file")
    })
    ctx.host.http.request.mockReturnValue(
      response(
        JSON.stringify({
          billing: {
            currentBalance: 8,
          },
        })
      )
    )

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.map((line) => line.label)).toEqual([
      "Balance",
      "Source",
      "Auth source",
      "Endpoint",
    ])
    expect(result.lines[0]).toMatchObject({ label: "Balance", value: "$8.00" })
  })

  it("renders zero local cost windows when the database has no history rows", async () => {
    const ctx = makeCtx()
    ctx.nowIso = "2026-03-06T12:00:00.000Z"
    setManualCookie(ctx)
    setWorkspace(ctx)
    setOpenCodeDb(ctx)
    setCostHistoryQuery(ctx, [])
    ctx.host.http.request.mockReturnValue(
      response(
        JSON.stringify({
          billing: {
            currentBalance: 8,
          },
        })
      )
    )

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.slice(-3)).toEqual([
      {
        type: "text",
        label: "Yesterday",
        value: "$0.00",
        subtitle: "Local OpenCode assistant spend",
      },
      {
        type: "text",
        label: "Last 2 days",
        value: "$0.00",
        subtitle: "Local OpenCode assistant spend",
      },
      {
        type: "text",
        label: "Last 30 days",
        value: "$0.00",
        subtitle: "Local OpenCode assistant spend",
      },
    ])
  })

  it("aggregates local OpenCode costs for yesterday, last two days, and last thirty days", async () => {
    const ctx = makeCtx()
    ctx.nowIso = "2026-03-06T12:00:00.000Z"
    setManualCookie(ctx)
    setWorkspace(ctx)
    setOpenCodeDb(ctx)
    setCostHistoryQuery(ctx, [
      { createdMs: Date.parse("2026-02-03T23:59:59.000Z"), cost: 99 },
      { createdMs: Date.parse("2026-02-05T00:00:00.000Z"), cost: 1.25 },
      { createdMs: Date.parse("2026-03-04T10:00:00.000Z"), cost: 2 },
      { createdMs: Date.parse("2026-03-05T09:00:00.000Z"), cost: 3.5 },
      { createdMs: Date.parse("2026-03-06T09:00:00.000Z"), cost: 4.75 },
    ])
    ctx.host.http.request.mockReturnValue(
      response(
        JSON.stringify({
          billing: {
            currentBalance: 8,
          },
        })
      )
    )

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Yesterday")?.value).toBe("$3.50")
    expect(result.lines.find((line) => line.label === "Last 2 days")?.value).toBe("$10.25")
    expect(result.lines.find((line) => line.label === "Last 30 days")?.value).toBe("$11.50")
    expect(result.history).toMatchObject({
      version: 1,
      source: "opencode-sqlite",
      timeZone: "UTC",
    })
    expect(result.history.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          periodStart: "2026-03-05T00:00:00.000Z",
          costUsd: 3.5,
        }),
        expect.objectContaining({
          periodStart: "2026-03-06T00:00:00.000Z",
          costUsd: 4.75,
        }),
      ])
    )
  })

  it("emits recorded OpenCode model and token history without inventing missing fields", async () => {
    const ctx = makeCtx()
    ctx.nowIso = "2026-03-06T12:00:00.000Z"
    setManualCookie(ctx)
    setWorkspace(ctx)
    setOpenCodeDb(ctx)
    ctx.host.sqlite.query.mockImplementation((_dbPath, sql) => {
      if (String(sql).includes("AS modelId")) {
        expect(String(sql)).not.toContain(
          "json_extract(data, '$.providerID') IN ('opencode-go', 'opencode')"
        )
        return JSON.stringify([
          {
            createdMs: Date.parse("2026-03-05T09:00:00.000Z"),
            providerId: "anthropic",
            modelId: "claude-sonnet-4-5",
            cost: 0.24,
            inputTokens: 120,
            outputTokens: 30,
            cacheReadTokens: 40,
            cacheCreationTokens: 5,
            totalTokens: 195,
          },
          {
            createdMs: Date.parse("2026-03-05T10:00:00.000Z"),
            modelId: "claude-sonnet-4-5",
            cost: null,
            inputTokens: null,
            outputTokens: null,
            cacheReadTokens: null,
            cacheCreationTokens: null,
            totalTokens: null,
          },
        ])
      }
      return JSON.stringify([{ createdMs: Date.parse("2026-03-05T09:00:00.000Z"), cost: 0.24 }])
    })
    ctx.host.http.request.mockReturnValue(
      response(JSON.stringify({ billing: { currentBalance: 8 } }))
    )

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.history.entries).toContainEqual({
      periodStart: "2026-03-05T00:00:00.000Z",
      periodEnd: "2026-03-06T00:00:00.000Z",
      model: "claude-sonnet-4-5",
      costUsd: 0.24,
      inputTokens: 120,
      outputTokens: 30,
      cacheReadTokens: 40,
      cacheCreationTokens: 5,
      totalTokens: 195,
    })
  })

  it("declares local OpenCode cost detail lines in the manifest", () => {
    const manifest = JSON.parse(readFileSync("plugins/opencode/plugin.json", "utf8"))

    expect(manifest.capabilities.sqlite).toBe(true)
    expect(manifest.lines).toEqual(
      expect.arrayContaining([
        { type: "text", label: "Yesterday", scope: "detail" },
        { type: "text", label: "Last 2 days", scope: "detail" },
        { type: "text", label: "Last 30 days", scope: "detail" },
      ])
    )
  })

  it("prefers the stored cookie over OPENCODE_COOKIE_HEADER", async () => {
    const ctx = makeCtx()
    setManualCookie(ctx, "auth=stored")
    setWorkspace(ctx)
    ctx.host.env.get.mockImplementation((key) =>
      key === "OPENCODE_COOKIE_HEADER" ? "auth=stale-env" : null
    )
    ctx.host.http.request.mockReturnValue(
      response(
        JSON.stringify({
          billing: {
            currentBalance: 12.34,
          },
        })
      )
    )

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(ctx.host.http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: "auth=stored",
        }),
      })
    )
    expect(result.lines.find((line) => line.label === "Auth source")?.value).toBe(
      "Stored Cookie header"
    )
  })

  it("keeps standalone Zen hidden because Zen balance is surfaced through OpenCode Go", () => {
    const manifest = JSON.parse(readFileSync("plugins/opencode/plugin.json", "utf8"))

    expect(manifest.platformSupport.windows.surfaced).toBe(false)
  })

  it("reads zero Zen balance from cent-denominated fields", async () => {
    const ctx = makeCtx()
    setManualCookie(ctx)
    setWorkspace(ctx)
    ctx.host.http.request.mockReturnValue(
      response(
        JSON.stringify({
          data: {
            zen: {
              balanceCents: 0,
            },
          },
        })
      )
    )

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines[0]).toMatchObject({ label: "Balance", value: "$0.00" })
  })

  it("reads Zen balance from serialized server text", async () => {
    const ctx = makeCtx()
    setManualCookie(ctx)
    setWorkspace(ctx)
    ctx.host.http.request.mockReturnValue(
      response("return { currentBalance: 5.25, billing: true }")
    )

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(result.lines[0]).toMatchObject({ label: "Balance", value: "$5.25" })
  })

  it("falls back to the billing page hydrated balance", async () => {
    const ctx = makeCtx()
    setManualCookie(ctx)
    const workspaceId = setWorkspace(ctx, "wrk_01KGFHEAF5E5M17063C23DR6ZH")
    ctx.host.http.request
      .mockReturnValueOnce(
        response(
          JSON.stringify({
            customerID: null,
            paymentMethodID: null,
          })
        )
      )
      .mockReturnValueOnce(
        response(`
        <script>
          _$HY.r["billing.get[\\"${workspaceId}\\"]"] = $R[15];
          $R[22]($R[16], $R[25] = {
            customerID: null,
            paymentMethodID: null,
            balance: 0,
            monthlyUsage: 0
          });
        </script>
      `)
      )

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(ctx.host.http.request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: "GET",
        url: `https://opencode.ai/workspace/${workspaceId}/billing`,
        headers: expect.objectContaining({
          Cookie: "auth=test; __Host-auth=test2",
        }),
      })
    )
    expect(result.lines[0]).toMatchObject({ label: "Balance", value: "$0.00" })
  })

  it("surfaces explicit null Zen billing responses as no usage data", async () => {
    const ctx = makeCtx()
    setManualCookie(ctx)
    setWorkspace(ctx, "wrk_nullcase")
    ctx.host.http.request.mockReturnValue(response("null"))

    const plugin = await loadPlugin()

    expect(() => plugin.probe(ctx)).toThrow(
      "OpenCode Zen has no billing usage data for this workspace."
    )
  })

  it("surfaces missing balance fields as a workspace-or-response-shape problem", async () => {
    const ctx = makeCtx()
    setManualCookie(ctx)
    const workspaceId = setWorkspace(ctx, "wrk_shapeproblem")
    ctx.host.http.request.mockReturnValue(
      response(
        JSON.stringify({
          usage: { percent: 50 },
          plan: { name: "Team" },
        })
      )
    )

    const plugin = await loadPlugin()

    expect(() => plugin.probe(ctx)).toThrow(
      "OpenCode returned billing data for workspace " +
        workspaceId +
        ", but it did not include the expected Zen balance field. Verify the workspace ID from the billing URL or an opencode.ai/_server payload. If that workspace is correct, OpenCode likely changed the billing response shape."
    )
    expect(ctx.host.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("opencode zen billing response missing balance for " + workspaceId)
    )
  })

  it("falls back to ccusage when SQLite history is empty", async () => {
    const ctx = makeCtx()
    setManualCookie(ctx)
    setWorkspace(ctx, "wrk_ccusage_fallback")
    ctx.host.http.request.mockReturnValue(response(JSON.stringify({ billing: { balance: 1.25 } })))
    ctx.host.sqlite.query.mockReturnValue("[]")
    ctx.host.ccusage.query.mockReturnValue({
      status: "ok",
      data: {
        daily: [
          {
            date: "2026-07-20",
            modelBreakdowns: [
              {
                modelName: "deepseek-v4-flash-free",
                inputTokens: 20,
                outputTokens: 10,
                cacheReadTokens: 60,
                cacheCreationTokens: 5,
                cost: 0.25,
              },
            ],
          },
        ],
      },
    })

    const plugin = await loadPlugin()
    const result = plugin.probe(ctx)

    expect(ctx.host.ccusage.query).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "opencode", since: expect.any(String) })
    )
    expect(result.history).toMatchObject({ source: "ccusage" })
    expect(result.history.entries[0]).toMatchObject({
      inputTokens: 20,
      outputTokens: 10,
      cacheReadTokens: 60,
      cacheCreationTokens: 5,
      costUsd: 0.25,
    })
  })
})
