import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { makeCtx } from "../test-helpers.js"

const EVENTS_PATH = "/api/dashboard/get-filtered-usage-events"
const PAGE_SIZE = 500
const NOW = new Date(2026, 10, 17, 15, 30)

const loadPlugin = async () => {
  await import("./plugin.js")
  return globalThis.__openusage_plugin
}

function makeJwt(payload) {
  const jwtPayload = Buffer.from(JSON.stringify(payload), "utf8")
    .toString("base64")
    .replace(/=+$/g, "")
  return `a.${jwtPayload}.c`
}

function localNoon(day) {
  return new Date(2026, 10, day, 12).getTime()
}

function dayPeriod(day) {
  return {
    periodStart: new Date(2026, 10, day).toISOString(),
    periodEnd: new Date(2026, 10, day + 1).toISOString(),
  }
}

function event(overrides = {}) {
  const { tokenUsage, ...rest } = overrides
  return {
    timestamp: String(localNoon(16)),
    model: "claude-4.5-sonnet",
    kind: "USAGE_EVENT_KIND_INCLUDED_IN_PRO",
    chargedCents: 4,
    tokenUsage: {
      inputTokens: 100,
      outputTokens: 50,
      cacheWriteTokens: 10,
      cacheReadTokens: 5,
      totalCents: 25,
      ...tokenUsage,
    },
    ...rest,
  }
}

function uniqueEvents(count, startIndex = 0) {
  return Array.from({ length: count }, (_, index) =>
    event({ timestamp: String(localNoon(16) + startIndex + index) })
  )
}

function eventsPage(events, total) {
  const body = { usageEventsDisplay: events }
  if (total !== undefined) body.totalUsageEventsCount = total
  return { status: 200, bodyText: JSON.stringify(body) }
}

function setup(respondToEvents) {
  const ctx = makeCtx()
  const token = makeJwt({ sub: "auth0|user_abc123", exp: Math.floor(NOW.getTime() / 1000) + 3600 })
  ctx.host.sqlite.query.mockImplementation((db, sql) =>
    String(sql).includes("cursorAuth/accessToken") ? JSON.stringify([{ value: token }]) : "[]"
  )
  const eventRequests = []
  ctx.host.http.request.mockImplementation((opts) => {
    const url = String(opts.url)
    if (url.includes(EVENTS_PATH)) {
      const body = JSON.parse(opts.bodyText)
      eventRequests.push({ opts, body })
      return respondToEvents(body.page, body)
    }
    if (url.includes("GetCurrentPeriodUsage")) {
      return {
        status: 200,
        bodyText: JSON.stringify({
          enabled: true,
          planUsage: { totalSpend: 1200, limit: 2400 },
          billingCycleEnd: NOW.getTime() + 86400000,
        }),
      }
    }
    if (url.includes("GetPlanInfo")) {
      return { status: 200, bodyText: JSON.stringify({ planInfo: { planName: "pro" } }) }
    }
    return { status: 404, bodyText: "{}" }
  })
  return { ctx, eventRequests }
}

describe("cursor usage event history", () => {
  beforeEach(() => {
    delete globalThis.__openusage_plugin
    vi.resetModules()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("requests whole local days with the session cookie and CSRF origin", async () => {
    const { ctx, eventRequests } = setup(() => eventsPage([], 0))
    const plugin = await loadPlugin()

    plugin.probe(ctx)

    expect(eventRequests).toHaveLength(1)
    const { opts, body } = eventRequests[0]
    expect(opts.method).toBe("POST")
    expect(opts.url).toBe("https://cursor.com" + EVENTS_PATH)
    expect(opts.headers.Origin).toBe("https://cursor.com")
    expect(opts.headers.Cookie).toMatch(/^WorkosCursorSessionToken=user_abc123%3A%3A/)
    expect(body).toEqual({
      page: 1,
      pageSize: PAGE_SIZE,
      startDate: String(new Date(2026, 9, 19).getTime()),
      endDate: String(NOW.getTime()),
    })
  })

  it("aggregates events per local day and model with list-price and charged cost kept apart", async () => {
    const events = [
      event({ timestamp: String(localNoon(15)), chargedCents: 4 }),
      event({
        timestamp: String(localNoon(15) + 1000),
        chargedCents: 6,
        tokenUsage: { inputTokens: 200, totalCents: 75 },
      }),
      event({
        timestamp: String(localNoon(15)),
        model: "gpt-5",
        chargedCents: "12.5",
        tokenUsage: { inputTokens: "300", totalCents: "40" },
      }),
      event({ timestamp: String(localNoon(16)), chargedCents: 0, tokenUsage: { totalCents: 0 } }),
    ]
    const { ctx } = setup(() => eventsPage(events, events.length))
    const plugin = await loadPlugin()

    const result = plugin.probe(ctx)

    expect(result.lines.find((line) => line.label === "Total usage")).toBeTruthy()
    expect(result.history).toEqual({
      version: 1,
      source: "cursor-usage-events",
      timeZone: "system-local",
      entries: [
        {
          ...dayPeriod(15),
          model: "claude-4.5-sonnet",
          requests: 2,
          inputTokens: 300,
          outputTokens: 100,
          cacheReadTokens: 10,
          cacheCreationTokens: 20,
          totalTokens: 430,
          costUsd: 1,
          chargedCostUsd: 0.1,
        },
        {
          ...dayPeriod(15),
          model: "gpt-5",
          requests: 1,
          inputTokens: 300,
          outputTokens: 50,
          cacheReadTokens: 5,
          cacheCreationTokens: 10,
          totalTokens: 365,
          costUsd: 0.4,
          chargedCostUsd: 0.125,
        },
        {
          ...dayPeriod(16),
          model: "claude-4.5-sonnet",
          requests: 1,
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 5,
          cacheCreationTokens: 10,
          totalTokens: 165,
          costUsd: 0,
          chargedCostUsd: 0,
        },
      ],
    })
  })

  it("follows full pages until a short page arrives", async () => {
    const pages = [uniqueEvents(PAGE_SIZE), uniqueEvents(PAGE_SIZE, PAGE_SIZE), uniqueEvents(3, 1000)]
    const { ctx, eventRequests } = setup((page) => eventsPage(pages[page - 1], 1003))
    const plugin = await loadPlugin()

    const result = plugin.probe(ctx)

    expect(eventRequests.map((request) => request.body.page)).toEqual([1, 2, 3])
    expect(result.history.entries).toHaveLength(1)
    expect(result.history.entries[0].requests).toBe(1003)
    expect(result.history.entries[0].costUsd).toBeCloseTo(250.75)
    expect(result.history.entries[0].chargedCostUsd).toBeCloseTo(40.12)
  })

  it("stops on an empty page after an exactly full page", async () => {
    const pages = [uniqueEvents(PAGE_SIZE), []]
    const { ctx, eventRequests } = setup((page) => eventsPage(pages[page - 1], PAGE_SIZE))
    const plugin = await loadPlugin()

    const result = plugin.probe(ctx)

    expect(eventRequests).toHaveLength(2)
    expect(result.history.entries[0].requests).toBe(PAGE_SIZE)
  })

  it("removes rows repeated at a page boundary only as far as the reported total proves", async () => {
    const first = uniqueEvents(PAGE_SIZE)
    // Page 2 repeats the last two rows of page 1, then continues.
    const second = [...first.slice(-2), ...uniqueEvents(3, PAGE_SIZE)]
    const { ctx } = setup((page) => eventsPage(page === 1 ? first : second, PAGE_SIZE + 3))
    const plugin = await loadPlugin()

    const result = plugin.probe(ctx)

    expect(result.history.entries[0].requests).toBe(PAGE_SIZE + 3)
  })

  it("keeps a boundary repeat when the reported total counts it as a real event", async () => {
    const first = uniqueEvents(PAGE_SIZE)
    const second = [first[PAGE_SIZE - 1], ...uniqueEvents(2, PAGE_SIZE)]
    const { ctx } = setup((page) => eventsPage(page === 1 ? first : second, PAGE_SIZE + 3))
    const plugin = await loadPlugin()

    const result = plugin.probe(ctx)

    expect(result.history.entries[0].requests).toBe(PAGE_SIZE + 3)
  })

  it("keeps identical legitimate events on the same page", async () => {
    const twin = event({ timestamp: String(localNoon(16)) })
    const { ctx } = setup(() => eventsPage([twin, { ...twin }, { ...twin }], 3))
    const plugin = await loadPlugin()

    const result = plugin.probe(ctx)

    expect(result.history.entries).toEqual([
      expect.objectContaining({ requests: 3, costUsd: 0.75, chargedCostUsd: 0.12 }),
    ])
  })

  it("does not remove repeats when the response has no total count", async () => {
    const first = uniqueEvents(PAGE_SIZE)
    const second = [first[PAGE_SIZE - 1]]
    const { ctx } = setup((page) => eventsPage(page === 1 ? first : second))
    const plugin = await loadPlugin()

    const result = plugin.probe(ctx)

    expect(result.history.entries[0].requests).toBe(PAGE_SIZE + 1)
  })

  it("leaves charged cost unknown when any event in the bucket omits chargedCents", async () => {
    const { chargedCents: _omitted, ...withoutCharged } = event({
      timestamp: String(localNoon(16) + 1),
    })
    const { ctx } = setup(() => eventsPage([event(), withoutCharged], 2))
    const plugin = await loadPlugin()

    const [entry] = plugin.probe(ctx).history.entries

    expect(entry.requests).toBe(2)
    expect(entry.costUsd).toBe(0.5)
    expect(entry).not.toHaveProperty("chargedCostUsd")
  })

  it("leaves list-price cost unknown and never substitutes charged cost", async () => {
    const { ctx } = setup(() =>
      eventsPage([event({ tokenUsage: { totalCents: undefined }, chargedCents: 9 })], 1)
    )
    const plugin = await loadPlugin()

    const [entry] = plugin.probe(ctx).history.entries

    expect(entry).not.toHaveProperty("costUsd")
    expect(entry.chargedCostUsd).toBe(0.09)
  })

  it("keeps token metrics unknown when a token field or token usage is missing", async () => {
    const withoutTokenUsage = event({ timestamp: String(localNoon(16)), model: "gpt-5" })
    delete withoutTokenUsage.tokenUsage
    const { ctx } = setup(() =>
      eventsPage(
        [
          event({ tokenUsage: { cacheWriteTokens: undefined } }),
          event({ tokenUsage: { outputTokens: -1 } }),
          withoutTokenUsage,
        ],
        3
      )
    )
    const plugin = await loadPlugin()

    const [claude, gpt] = plugin.probe(ctx).history.entries

    expect(claude).toEqual({
      ...dayPeriod(16),
      model: "claude-4.5-sonnet",
      requests: 2,
      inputTokens: 200,
      cacheReadTokens: 10,
      costUsd: 0.5,
      chargedCostUsd: 0.08,
    })
    expect(gpt).toEqual({
      ...dayPeriod(16),
      model: "gpt-5",
      requests: 1,
      chargedCostUsd: 0.04,
    })
  })

  it("keeps events without a model as an unlabelled entry and skips events without a timestamp", async () => {
    const { ctx } = setup(() =>
      eventsPage([event({ model: "" }), event({ timestamp: "0" }), event({ timestamp: undefined })], 3)
    )
    const plugin = await loadPlugin()

    const entries = plugin.probe(ctx).history.entries

    expect(entries).toHaveLength(1)
    expect(entries[0]).not.toHaveProperty("model")
    expect(entries[0].requests).toBe(1)
    expect(ctx.host.log.warn).toHaveBeenCalledWith(
      "usage events: skipped 2 events without a valid timestamp"
    )
  })

  it("reports a confirmed empty window as empty history", async () => {
    const { ctx } = setup(() => ({ status: 200, bodyText: "{}" }))
    const plugin = await loadPlugin()

    expect(plugin.probe(ctx).history.entries).toEqual([])
  })

  it.each([
    ["an HTTP error", () => ({ status: 500, bodyText: "{}" })],
    ["a forbidden response", () => ({ status: 403, bodyText: "{}" })],
    ["an error envelope", () => ({ status: 200, bodyText: JSON.stringify({ error: "denied" }) })],
    ["invalid JSON", () => ({ status: 200, bodyText: "<html>" })],
    ["a non-array event list", () => ({ status: 200, bodyText: JSON.stringify({ usageEventsDisplay: {} }) })],
    ["a negative total", () => eventsPage([], -1)],
    [
      "a request exception",
      () => {
        throw new Error("socket hang up")
      },
    ],
    ["fewer events than the reported total", () => eventsPage(uniqueEvents(2), 5)],
    [
      "a total that changes between pages",
      (page) => eventsPage(page === 1 ? uniqueEvents(PAGE_SIZE) : uniqueEvents(1, PAGE_SIZE), page === 1 ? 501 : 502),
    ],
    [
      "more raw rows than the total without a boundary repeat",
      (page) =>
        eventsPage(page === 1 ? uniqueEvents(PAGE_SIZE) : uniqueEvents(2, PAGE_SIZE), PAGE_SIZE + 1),
    ],
    ["full pages up to the page limit", (page) => eventsPage(uniqueEvents(PAGE_SIZE, page * PAGE_SIZE))],
  ])("omits history and keeps the summary for %s", async (_name, respond) => {
    const { ctx } = setup(respond)
    const plugin = await loadPlugin()

    const result = plugin.probe(ctx)

    expect(result).not.toHaveProperty("history")
    expect(result.lines.find((line) => line.label === "Total usage")).toBeTruthy()
    expect(ctx.host.log.warn).toHaveBeenCalledWith(
      expect.stringMatching(/^usage events unavailable \(.+\); history omitted$/)
    )
  })
})
