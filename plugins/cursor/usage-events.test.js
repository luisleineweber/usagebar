import { describe, expect, it } from "vitest"
import {
  EVENTS_PATH,
  PAGE_SIZE,
  event,
  eventsPage,
  hasTotalUsage,
  loadPlugin,
  localNoon,
  localTime,
  now,
  setup,
  uniqueEvents,
  useUsageEventTestEnvironment,
} from "./usage-events-fixtures.js"

// November days in Europe/Berlin use +01:00.
function dayPeriod(day) {
  const pad = (value) => String(value).padStart(2, "0")
  return {
    periodStart: `2026-11-${pad(day)}T00:00:00+01:00`,
    periodEnd: `2026-11-${pad(day + 1)}T00:00:00+01:00`,
  }
}

async function probeHistory(respond) {
  const { ctx } = setup(respond)
  const plugin = await loadPlugin()
  return { ctx, result: plugin.probe(ctx) }
}

describe("cursor usage event history", () => {
  useUsageEventTestEnvironment()

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
    expect(opts.timeoutMs).toBe(15000)
    expect(body).toEqual({
      page: 1,
      pageSize: PAGE_SIZE,
      startDate: String(localTime(10, 18, 0)),
      endDate: String(now().getTime()),
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
    const { result } = await probeHistory(() => eventsPage(events, events.length))

    expect(hasTotalUsage(result)).toBe(true)
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

  it("labels days with the local offset, including the daylight saving change", async () => {
    const events = [
      event({ timestamp: String(localTime(10, 25, 1, 30)) }),
      event({ timestamp: String(localTime(10, 25, 23, 30)) }),
      event({ timestamp: String(localTime(10, 26, 0, 30)) }),
    ]
    const { result } = await probeHistory(() => eventsPage(events, 3))

    expect(
      result.history.entries.map(({ periodStart, periodEnd, requests }) => ({
        periodStart,
        periodEnd,
        requests,
      }))
    ).toEqual([
      { periodStart: "2026-10-25T00:00:00+02:00", periodEnd: "2026-10-26T00:00:00+01:00", requests: 2 },
      { periodStart: "2026-10-26T00:00:00+01:00", periodEnd: "2026-10-27T00:00:00+01:00", requests: 1 },
    ])
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

  it("removes rows repeated at a page boundary when the total proves exactly that overlap", async () => {
    const first = uniqueEvents(PAGE_SIZE)
    const second = [...first.slice(-2), ...uniqueEvents(3, PAGE_SIZE)]
    const { result } = await probeHistory((page) =>
      eventsPage(page === 1 ? first : second, PAGE_SIZE + 3)
    )

    expect(result.history.entries[0].requests).toBe(PAGE_SIZE + 3)
  })

  it("omits history when the total proves fewer repeats than the boundary overlap", async () => {
    // Page 1 ends [A, B] and page 2 starts [A, B], but only one row is extra.
    // Which row repeats is unknown, and a guess would move usage between models.
    const rowA = event({ timestamp: String(localNoon(16) + 900), model: "gpt-5" })
    const rowB = event({ timestamp: String(localNoon(16) + 901), model: "claude-4.5-sonnet" })
    const first = [...uniqueEvents(PAGE_SIZE - 2), rowA, rowB]
    const second = [rowA, rowB, ...uniqueEvents(2, PAGE_SIZE)]
    const { ctx, result } = await probeHistory((page) =>
      eventsPage(page === 1 ? first : second, PAGE_SIZE + 3)
    )

    expect(result).not.toHaveProperty("history")
    expect(hasTotalUsage(result)).toBe(true)
    expect(ctx.host.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("page overlap does not match total: 1 extra rows, 2 repeated")
    )
  })

  it("keeps a boundary repeat when the reported total counts it as a real event", async () => {
    const first = uniqueEvents(PAGE_SIZE)
    const second = [first[PAGE_SIZE - 1], ...uniqueEvents(2, PAGE_SIZE)]
    const { result } = await probeHistory((page) =>
      eventsPage(page === 1 ? first : second, PAGE_SIZE + 3)
    )

    expect(result.history.entries[0].requests).toBe(PAGE_SIZE + 3)
  })

  it("keeps identical legitimate events on the same page", async () => {
    const twin = event({ timestamp: String(localNoon(16)) })
    const { result } = await probeHistory(() => eventsPage([twin, { ...twin }, { ...twin }], 3))

    expect(result.history.entries).toEqual([
      expect.objectContaining({ requests: 3, costUsd: 0.75, chargedCostUsd: 0.12 }),
    ])
  })

  it("joins pages without a total count when no rows repeat at the boundary", async () => {
    const { result } = await probeHistory((page) =>
      eventsPage(page === 1 ? uniqueEvents(PAGE_SIZE) : uniqueEvents(2, PAGE_SIZE))
    )

    expect(result.history.entries[0].requests).toBe(PAGE_SIZE + 2)
  })

  it("omits history when pages overlap at a boundary and no total resolves it", async () => {
    const first = uniqueEvents(PAGE_SIZE)
    const { ctx, result } = await probeHistory((page) =>
      eventsPage(page === 1 ? first : [first[PAGE_SIZE - 1]])
    )

    expect(result).not.toHaveProperty("history")
    expect(hasTotalUsage(result)).toBe(true)
    expect(ctx.host.log.warn).toHaveBeenCalledWith(
      "usage events unavailable (pages overlap at page 2 without a total); history omitted"
    )
  })

  it("treats an empty object after a full page as the last page", async () => {
    const { result } = await probeHistory((page) =>
      page === 1 ? eventsPage(uniqueEvents(PAGE_SIZE), PAGE_SIZE) : { status: 200, bodyText: "{}" }
    )

    expect(result.history.entries[0].requests).toBe(PAGE_SIZE)
  })

  it("checks rows against the earlier total when an empty object ends paging", async () => {
    const { ctx, result } = await probeHistory((page) =>
      page === 1 ? eventsPage(uniqueEvents(PAGE_SIZE), PAGE_SIZE + 3) : { status: 200, bodyText: "{}" }
    )

    expect(result).not.toHaveProperty("history")
    expect(ctx.host.log.warn).toHaveBeenCalledWith(
      "usage events unavailable (incomplete pages: expected 503, received 500); history omitted"
    )
  })

  it("reports the Cursor user ID as the account key for the host to hash", async () => {
    const { result } = await probeHistory(() => eventsPage([event()], 1))

    expect(result.accountKey).toBe("user_abc123")
  })

  it("leaves charged cost unknown when any event in the bucket omits chargedCents", async () => {
    const { chargedCents: _omitted, ...withoutCharged } = event({
      timestamp: String(localNoon(16) + 1),
    })
    const { result } = await probeHistory(() => eventsPage([event(), withoutCharged], 2))

    const [entry] = result.history.entries
    expect(entry.requests).toBe(2)
    expect(entry.costUsd).toBe(0.5)
    expect(entry).not.toHaveProperty("chargedCostUsd")
  })

  it("leaves list-price cost unknown and never substitutes charged cost", async () => {
    const { result } = await probeHistory(() =>
      eventsPage([event({ tokenUsage: { totalCents: undefined }, chargedCents: 9 })], 1)
    )

    const [entry] = result.history.entries
    expect(entry).not.toHaveProperty("costUsd")
    expect(entry.chargedCostUsd).toBe(0.09)
  })

  it("keeps token metrics unknown when a token field or token usage is missing", async () => {
    const withoutTokenUsage = event({ timestamp: String(localNoon(16)), model: "gpt-5" })
    delete withoutTokenUsage.tokenUsage
    const { result } = await probeHistory(() =>
      eventsPage(
        [
          event({ tokenUsage: { cacheWriteTokens: undefined } }),
          event({ tokenUsage: { outputTokens: -1 } }),
          withoutTokenUsage,
        ],
        3
      )
    )

    const [claude, gpt] = result.history.entries
    expect(claude).toEqual({
      ...dayPeriod(16),
      model: "claude-4.5-sonnet",
      requests: 2,
      inputTokens: 200,
      cacheReadTokens: 10,
      costUsd: 0.5,
      chargedCostUsd: 0.08,
    })
    expect(gpt).toEqual({ ...dayPeriod(16), model: "gpt-5", requests: 1, chargedCostUsd: 0.04 })
  })

  it("keeps events without a model as an unlabelled entry", async () => {
    const { result } = await probeHistory(() => eventsPage([event({ model: "" })], 1))

    expect(result.history.entries).toHaveLength(1)
    expect(result.history.entries[0]).not.toHaveProperty("model")
    expect(result.history.entries[0].requests).toBe(1)
  })

  it("reports a confirmed empty window as empty history", async () => {
    const { result } = await probeHistory(() => ({ status: 200, bodyText: "{}" }))

    expect(result.history.entries).toEqual([])
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
      (page) =>
        eventsPage(page === 1 ? uniqueEvents(PAGE_SIZE) : uniqueEvents(1, PAGE_SIZE), page === 1 ? 501 : 502),
    ],
    [
      "more raw rows than the total without a boundary repeat",
      (page) =>
        eventsPage(page === 1 ? uniqueEvents(PAGE_SIZE) : uniqueEvents(2, PAGE_SIZE), PAGE_SIZE + 1),
    ],
    ["full pages up to the page limit", (page) => eventsPage(uniqueEvents(PAGE_SIZE, page * PAGE_SIZE))],
    ["only events without a timestamp", () => eventsPage([event({ timestamp: undefined }), event({ timestamp: "0" })], 2)],
    ["one event without a timestamp", () => eventsPage([event(), event({ timestamp: undefined })], 2)],
    ["an event before the requested window", () => eventsPage([event({ timestamp: String(localTime(10, 17, 23)) })], 1)],
    ["an event after the requested window", () => eventsPage([event({ timestamp: String(now().getTime() + 60000) })], 1)],
    ["a timestamp outside the JavaScript date range", () => eventsPage([event({ timestamp: "9000000000000000" })], 1)],
  ])("omits history and keeps the summary for %s", async (_name, respond) => {
    const { ctx, result } = await probeHistory(respond)

    expect(result).not.toHaveProperty("history")
    expect(hasTotalUsage(result)).toBe(true)
    expect(ctx.host.log.warn).toHaveBeenCalledWith(
      expect.stringMatching(/^usage events unavailable \(.+\); history omitted$/)
    )
  })
})
