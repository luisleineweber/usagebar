import { describe, expect, it, vi } from "vitest"
import {
  PAGE_SIZE,
  SCHEDULE_PATH,
  USER_ID,
  event,
  eventsPage,
  hasTotalUsage,
  loadPlugin,
  setup,
  uniqueEvents,
  useUsageEventTestEnvironment,
} from "./usage-events-fixtures.js"

const MINUTE_MS = 60 * 1000

function advance(ms) {
  vi.setSystemTime(Date.now() + ms)
}

function readSchedule(ctx) {
  return JSON.parse(ctx.host.fs.readText(SCHEDULE_PATH))
}

describe("cursor usage event history budget and schedule", () => {
  useUsageEventTestEnvironment()

  it("stops paging before the probe deadline and returns the summary without history", async () => {
    const { ctx, eventRequests } = setup((page) => {
      // Each page is slow: 12 s, then 6 s. The budget ends 20 s after probe start.
      advance(page === 1 ? 12000 : 6000)
      return eventsPage(uniqueEvents(PAGE_SIZE, page * PAGE_SIZE), 5000)
    })
    const plugin = await loadPlugin()
    const startedAt = Date.now()

    const result = plugin.probe(ctx)

    expect(hasTotalUsage(result)).toBe(true)
    expect(result).not.toHaveProperty("history")
    expect(eventRequests.map((request) => request.opts.timeoutMs)).toEqual([15000, 8000])
    expect(Date.now() - startedAt).toBeLessThan(20000)
    expect(ctx.host.log.warn).toHaveBeenCalledWith(
      "usage events unavailable (time budget exhausted before page 3); history omitted"
    )
    // The same window would run out of time again, so the next attempt waits one interval.
    expect(readSchedule(ctx)).toEqual({ userId: USER_ID, nextFetchAtMs: Date.now() + 30 * MINUTE_MS })
  })

  it("treats a page that times out at the budget end as budget exhaustion", async () => {
    const { ctx } = setup((page) => {
      if (page === 1) {
        advance(10000)
        return eventsPage(uniqueEvents(PAGE_SIZE), 5000)
      }
      advance(9000)
      throw new Error("request timed out")
    })
    const plugin = await loadPlugin()

    const result = plugin.probe(ctx)

    expect(result).not.toHaveProperty("history")
    expect(ctx.host.log.warn).toHaveBeenCalledWith(
      "usage events unavailable (time budget exhausted (request failed: Error: request timed out)); history omitted"
    )
    expect(readSchedule(ctx).nextFetchAtMs).toBe(Date.now() + 30 * MINUTE_MS)
  })

  it("skips history when the summary used up the budget", async () => {
    const { ctx, eventRequests } = setup(() => eventsPage([], 0))
    const summaryRequest = ctx.host.http.request.getMockImplementation()
    ctx.host.http.request.mockImplementation((opts) => {
      if (String(opts.url).includes("GetPlanInfo")) advance(18000)
      return summaryRequest(opts)
    })
    const plugin = await loadPlugin()

    const result = plugin.probe(ctx)

    expect(hasTotalUsage(result)).toBe(true)
    expect(result).not.toHaveProperty("history")
    expect(eventRequests).toHaveLength(0)
  })

  it("fetches history again only after its own refresh interval", async () => {
    const { ctx, eventRequests } = setup(() => eventsPage([event()], 1))
    const plugin = await loadPlugin()

    expect(plugin.probe(ctx).history.entries).toHaveLength(1)
    expect(readSchedule(ctx)).toEqual({ userId: USER_ID, nextFetchAtMs: Date.now() + 30 * MINUTE_MS })

    advance(5 * MINUTE_MS)
    const deferred = plugin.probe(ctx)
    // The host keeps the last history when the output has none.
    expect(deferred).not.toHaveProperty("history")
    expect(hasTotalUsage(deferred)).toBe(true)
    expect(eventRequests).toHaveLength(1)

    advance(26 * MINUTE_MS)
    expect(plugin.probe(ctx).history.entries).toHaveLength(1)
    expect(eventRequests).toHaveLength(2)
  })

  it.each([
    ["delay seconds", () => "600", 10 * MINUTE_MS],
    ["delay seconds below the minimum", () => "120", 5 * MINUTE_MS],
    ["an HTTP date", () => new Date(Date.now() + 10 * MINUTE_MS).toUTCString(), 10 * MINUTE_MS],
    ["no header", () => null, 30 * MINUTE_MS],
    ["an invalid value", () => "soon", 30 * MINUTE_MS],
  ])("defers history after HTTP 429 with %s in Retry-After", async (_name, retryAfter, delayMs) => {
    let rateLimited = true
    const { ctx, eventRequests } = setup(() => {
      if (!rateLimited) return eventsPage([event()], 1)
      const value = retryAfter()
      return { status: 429, headers: value === null ? {} : { "retry-after": value }, bodyText: "{}" }
    })
    const plugin = await loadPlugin()

    const limited = plugin.probe(ctx)
    expect(limited).not.toHaveProperty("history")
    expect(hasTotalUsage(limited)).toBe(true)
    expect(readSchedule(ctx).nextFetchAtMs).toBe(Date.now() + delayMs)

    rateLimited = false
    advance(delayMs - 1000)
    plugin.probe(ctx)
    expect(eventRequests).toHaveLength(1)

    advance(1000)
    expect(plugin.probe(ctx).history.entries).toHaveLength(1)
    expect(eventRequests).toHaveLength(2)
  })

  it("clamps Retry-After to at most one day", async () => {
    const { ctx } = setup(() => ({ status: 429, headers: { "Retry-After": "999999" }, bodyText: "{}" }))
    const plugin = await loadPlugin()

    plugin.probe(ctx)

    expect(readSchedule(ctx).nextFetchAtMs).toBe(Date.now() + 24 * 60 * MINUTE_MS)
  })

  it("retries on the next probe after an ordinary failure", async () => {
    let fail = true
    const { ctx, eventRequests } = setup(() =>
      fail ? { status: 500, bodyText: "{}" } : eventsPage([event()], 1)
    )
    const plugin = await loadPlugin()

    expect(plugin.probe(ctx)).not.toHaveProperty("history")
    expect(ctx.host.fs.exists(SCHEDULE_PATH)).toBe(false)

    fail = false
    advance(MINUTE_MS)
    expect(plugin.probe(ctx).history.entries).toHaveLength(1)
    expect(eventRequests).toHaveLength(2)
  })

  it.each([
    ["a different account", { userId: "user_other", nextFetchAtMs: () => Date.now() + MINUTE_MS }],
    ["a date more than one day ahead", { userId: USER_ID, nextFetchAtMs: () => Date.now() + 25 * 60 * MINUTE_MS }],
  ])("fetches history despite a schedule for %s", async (_name, schedule) => {
    const { ctx, eventRequests } = setup(() => eventsPage([event()], 1))
    ctx.host.fs.writeText(
      SCHEDULE_PATH,
      JSON.stringify({ userId: schedule.userId, nextFetchAtMs: schedule.nextFetchAtMs() })
    )
    const plugin = await loadPlugin()

    expect(plugin.probe(ctx).history.entries).toHaveLength(1)
    expect(eventRequests).toHaveLength(1)
  })
})
