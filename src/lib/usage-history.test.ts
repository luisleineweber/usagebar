import { describe, expect, it } from "vitest"
import type { PluginOutput, UsageHistoryEntry } from "@/lib/plugin-types"
import {
  entryTotalTokens,
  filterUsageHistory,
  getUsageHistoryWindow,
  summarizeUsageHistory,
  summarizeUsageHistoryPeriods,
} from "@/lib/usage-history"

const NOW_MS = Date.UTC(2026, 6, 10, 12)

function historyEntry(overrides: Partial<UsageHistoryEntry> = {}): UsageHistoryEntry {
  return {
    periodStart: "2026-07-10T00:00:00.000Z",
    periodEnd: "2026-07-11T00:00:00.000Z",
    model: "gpt-5",
    project: "usagebar",
    costUsd: 1,
    requests: 2,
    inputTokens: 40,
    outputTokens: 50,
    reasoningTokens: 10,
    totalTokens: 100,
    ...overrides,
  }
}

function output(
  providerId: string,
  entries: UsageHistoryEntry[],
  source = "fixture",
  timeZone = "UTC"
): PluginOutput {
  return {
    providerId,
    displayName: providerId,
    iconUrl: `${providerId}.svg`,
    lines: [],
    history: { version: 1, source, timeZone, entries },
  }
}

describe("usage history calendar windows", () => {
  it("returns Today, Yesterday, 7d, and 30d calendar ranges", () => {
    expect(getUsageHistoryWindow("today", NOW_MS)).toEqual({
      startMs: Date.UTC(2026, 6, 10),
      endMs: NOW_MS,
    })
    expect(getUsageHistoryWindow("yesterday", NOW_MS)).toEqual({
      startMs: Date.UTC(2026, 6, 9),
      endMs: Date.UTC(2026, 6, 10),
    })
    expect(getUsageHistoryWindow("7d", NOW_MS)).toEqual({
      startMs: Date.UTC(2026, 6, 4),
      endMs: NOW_MS,
    })
    expect(getUsageHistoryWindow("30d", NOW_MS)).toEqual({
      startMs: Date.UTC(2026, 5, 11),
      endMs: NOW_MS,
    })
  })

  it("uses IANA time zones across daylight-saving transitions", () => {
    const afterSpringForwardMs = Date.UTC(2026, 2, 9, 16)
    expect(getUsageHistoryWindow("today", afterSpringForwardMs, "America/New_York")).toEqual({
      startMs: Date.UTC(2026, 2, 9, 4),
      endMs: afterSpringForwardMs,
    })
    expect(getUsageHistoryWindow("yesterday", afterSpringForwardMs, "America/New_York")).toEqual({
      startMs: Date.UTC(2026, 2, 8, 5),
      endMs: Date.UTC(2026, 2, 9, 4),
    })
  })
})

describe("usage history calendar-to-date windows", () => {
  it("starts the week on Monday (ISO 8601) and the month on day 1", () => {
    // Friday 2026-07-10.
    expect(getUsageHistoryWindow("weekToDate", NOW_MS)).toEqual({
      startMs: Date.UTC(2026, 6, 6),
      endMs: NOW_MS,
    })
    expect(getUsageHistoryWindow("monthToDate", NOW_MS)).toEqual({
      startMs: Date.UTC(2026, 6, 1),
      endMs: NOW_MS,
    })
  })

  it("keeps Monday in its own week and Sunday in the week that started six days earlier", () => {
    const mondayMs = Date.UTC(2026, 6, 13, 0, 30)
    expect(getUsageHistoryWindow("weekToDate", mondayMs).startMs).toBe(Date.UTC(2026, 6, 13))
    const sundayMs = Date.UTC(2026, 6, 12, 23, 59)
    expect(getUsageHistoryWindow("weekToDate", sundayMs).startMs).toBe(Date.UTC(2026, 6, 6))
  })

  it("crosses month and year boundaries for the week, and resets the month on day 1", () => {
    // Friday 2027-01-01: the week started Monday 2026-12-28.
    const newYearMs = Date.UTC(2027, 0, 1, 9)
    expect(getUsageHistoryWindow("weekToDate", newYearMs).startMs).toBe(Date.UTC(2026, 11, 28))
    expect(getUsageHistoryWindow("monthToDate", newYearMs).startMs).toBe(Date.UTC(2027, 0, 1))

    // Wednesday 2026-04-01: the week started Monday 2026-03-30.
    const aprilFirstMs = Date.UTC(2026, 3, 1, 9)
    expect(getUsageHistoryWindow("weekToDate", aprilFirstMs).startMs).toBe(Date.UTC(2026, 2, 30))
    expect(getUsageHistoryWindow("monthToDate", aprilFirstMs).startMs).toBe(Date.UTC(2026, 3, 1))

    // Leap day stays inside February.
    const leapDayMs = Date.UTC(2028, 1, 29, 9)
    expect(getUsageHistoryWindow("monthToDate", leapDayMs).startMs).toBe(Date.UTC(2028, 1, 1))
  })

  it("resolves the local calendar day before choosing the week or month", () => {
    // 2026-07-31T23:30Z is already Saturday 2026-08-01 in Berlin (UTC+2).
    const nowMs = Date.UTC(2026, 6, 31, 23, 30)
    expect(getUsageHistoryWindow("monthToDate", nowMs, "Europe/Berlin").startMs).toBe(
      Date.UTC(2026, 6, 31, 22)
    )
    expect(getUsageHistoryWindow("monthToDate", nowMs, "UTC").startMs).toBe(Date.UTC(2026, 6, 1))
    // 2026-07-13T02:00Z is still Sunday 2026-07-12 in Los Angeles (UTC-7).
    const mondayUtcMs = Date.UTC(2026, 6, 13, 2)
    expect(getUsageHistoryWindow("weekToDate", mondayUtcMs, "America/Los_Angeles").startMs).toBe(
      Date.UTC(2026, 6, 6, 7)
    )
  })

  it("uses local midnight before a daylight-saving change inside the window", () => {
    // Berlin springs forward on Sunday 2026-03-29; the week began Monday 2026-03-23 at UTC+1.
    const afterSpringForwardMs = Date.UTC(2026, 2, 29, 12)
    expect(getUsageHistoryWindow("weekToDate", afterSpringForwardMs, "Europe/Berlin")).toEqual({
      startMs: Date.UTC(2026, 2, 22, 23),
      endMs: afterSpringForwardMs,
    })
    expect(getUsageHistoryWindow("monthToDate", afterSpringForwardMs, "Europe/Berlin")).toEqual({
      startMs: Date.UTC(2026, 1, 28, 23),
      endMs: afterSpringForwardMs,
    })
    // New York falls back on Sunday 2026-11-01; November began at UTC-4, the next week at UTC-5.
    const afterFallBackMs = Date.UTC(2026, 10, 2, 15)
    expect(getUsageHistoryWindow("monthToDate", afterFallBackMs, "America/New_York").startMs).toBe(
      Date.UTC(2026, 10, 1, 4)
    )
    expect(getUsageHistoryWindow("weekToDate", afterFallBackMs, "America/New_York").startMs).toBe(
      Date.UTC(2026, 10, 2, 5)
    )
  })

  it("keeps rolling 7d and 30d ranges separate from the calendar periods", () => {
    const newYearMs = Date.UTC(2027, 0, 1, 9)
    expect(getUsageHistoryWindow("7d", newYearMs).startMs).toBe(Date.UTC(2026, 11, 26))
    expect(getUsageHistoryWindow("30d", newYearMs).startMs).toBe(Date.UTC(2026, 11, 3))
  })

  it("does not report zero for an empty or partly unknown calendar period", () => {
    const outputs = [
      output("codex", [
        historyEntry({
          periodStart: "2026-06-30T00:00:00.000Z",
          periodEnd: "2026-07-01T00:00:00.000Z",
        }),
        historyEntry({
          periodStart: "2026-07-06T00:00:00.000Z",
          periodEnd: "2026-07-07T00:00:00.000Z",
          costUsd: undefined,
        }),
      ]),
    ]
    const nextMonthMs = Date.UTC(2026, 7, 3, 12)
    const empty = summarizeUsageHistory(outputs, {
      period: "monthToDate",
      nowMs: nextMonthMs,
      timeZone: "UTC",
    })
    expect(empty.entryCount).toBe(0)
    expect(empty.totals.costUsd).toBeNull()
    expect(empty.totals.totalTokens).toBeNull()

    const week = summarizeUsageHistory(outputs, {
      period: "weekToDate",
      nowMs: NOW_MS,
      timeZone: "UTC",
    })
    expect(week.entryCount).toBe(1)
    expect(week.totals.costUsd).toBeNull()
    expect(week.totals.totalTokens).toBe(100)

    const month = summarizeUsageHistory(outputs, {
      period: "monthToDate",
      nowMs: NOW_MS,
      timeZone: "UTC",
    })
    expect(month.entryCount).toBe(1)
  })
})

describe("filterUsageHistory", () => {
  it("filters by provider, model, project, and period", () => {
    const outputs = [
      output("codex", [historyEntry(), historyEntry({ model: "gpt-4.1", project: "other" })]),
      output("claude", [historyEntry({ model: "sonnet", project: "usagebar" })]),
    ]

    const filtered = filterUsageHistory(outputs, {
      period: "today",
      nowMs: NOW_MS,
      providerIds: ["codex"],
      models: ["gpt-5"],
      projects: ["usagebar"],
    })

    expect(filtered).toHaveLength(1)
    expect(filtered[0]).toMatchObject({ providerId: "codex", model: "gpt-5", project: "usagebar" })
  })

  it("keeps provider instance identity on aggregated records without using entry account text", () => {
    const records = filterUsageHistory(
      [
        {
          ...output("codex", [historyEntry({ account: "same display account" })]),
          instanceRef: { providerId: "codex", instanceId: "profile-a" },
        },
        {
          ...output("codex", [historyEntry({ account: "same display account" })]),
          instanceRef: { providerId: "codex", instanceId: "profile-b" },
        },
      ],
      { period: "today", nowMs: NOW_MS }
    )

    expect(records.map((record) => record.instanceRef?.instanceId)).toEqual([
      "profile-a",
      "profile-b",
    ])
    expect(records.map((record) => record.account)).toEqual([
      "same display account",
      "same display account",
    ])
  })

  it("ignores missing histories and entries after now", () => {
    const withoutHistory: PluginOutput = {
      providerId: "empty",
      displayName: "Empty",
      iconUrl: "empty.svg",
      lines: [],
    }
    const filtered = filterUsageHistory(
      [
        withoutHistory,
        output("codex", [historyEntry({ periodStart: "2026-07-10T13:00:00.000Z" })]),
      ],
      { period: "today", nowMs: NOW_MS }
    )

    expect(filtered).toEqual([])
  })

  it("includes entries whose periods overlap the requested window", () => {
    const filtered = filterUsageHistory(
      [
        output("codex", [
          historyEntry({
            periodStart: "2026-07-09T23:00:00.000Z",
            periodEnd: "2026-07-10T01:00:00.000Z",
          }),
        ]),
      ],
      { period: "today", nowMs: NOW_MS }
    )

    expect(filtered).toHaveLength(1)
  })

  it("fails loudly for malformed periods", () => {
    expect(() =>
      filterUsageHistory([output("codex", [historyEntry({ periodStart: "invalid" })])], {
        period: "today",
        nowMs: NOW_MS,
      })
    ).toThrow("Invalid usage history period")
  })
})

describe("summarizeUsageHistory", () => {
  it("combines scoped cost rows and authoritative period totals without assigning totals to models", () => {
    const rows = [
      historyEntry({ scope: "cost", model: undefined, costUsd: 2, totalTokens: undefined }),
      historyEntry({ scope: "usage", model: "a", totalTokens: 10, periodTotalTokens: 37 }),
      historyEntry({ scope: "usage", model: "b", totalTokens: 0, periodTotalTokens: 37 }),
    ]
    const outputs = [output("openai", rows)]
    const query = { period: "today" as const, nowMs: NOW_MS, timeZone: "UTC" }
    expect(summarizeUsageHistory(outputs, query).totals).toMatchObject({
      costUsd: 2,
      totalTokens: 37,
    })
    expect(summarizeUsageHistory(outputs, { ...query, models: ["a"] }).totals.totalTokens).toBe(10)
    expect(summarizeUsageHistory(outputs, { ...query, models: ["b"] }).totals.totalTokens).toBe(0)
  })

  it("sums Claude token rows when reasoning tokens are not reported", () => {
    const entry = historyEntry({
      inputTokens: 40,
      outputTokens: 50,
      cacheReadTokens: 10,
      cacheCreationTokens: 0,
      reasoningTokens: undefined,
      totalTokens: undefined,
    })

    expect(entryTotalTokens(entry)).toBe(100)
    expect(
      summarizeUsageHistory([output("claude", [entry])], {
        period: "today",
        nowMs: NOW_MS,
      }).totals.totalTokens
    ).toBe(100)
  })

  it("keeps aggregate fields unknown when any selected entry omits them", () => {
    const summary = summarizeUsageHistory(
      [
        output("codex", [
          historyEntry({
            costUsd: 1.25,
            requests: 2,
            inputTokens: 10,
            outputTokens: 20,
            cacheReadTokens: 30,
            cacheCreationTokens: 40,
            reasoningTokens: 5,
            totalTokens: 105,
          }),
          historyEntry({
            model: undefined,
            project: undefined,
            costUsd: undefined,
            requests: 1,
            inputTokens: undefined,
            outputTokens: 7,
            cacheReadTokens: undefined,
            cacheCreationTokens: undefined,
            reasoningTokens: undefined,
            totalTokens: undefined,
          }),
          historyEntry({
            costUsd: undefined,
            inputTokens: 100,
            outputTokens: 50,
            cacheReadTokens: 100,
            reasoningTokens: 25,
            totalTokens: undefined,
          }),
        ]),
      ],
      { period: "today", nowMs: NOW_MS }
    )

    expect(summary.entryCount).toBe(3)
    expect(summary.totals).toEqual({
      costUsd: null,
      chargedCostUsd: null,
      requests: 5,
      inputTokens: null,
      outputTokens: 77,
      cacheReadTokens: null,
      cacheCreationTokens: null,
      reasoningTokens: null,
      totalTokens: null,
    })
  })

  it("sums scoped cost and usage rows over the rows that report each metric", () => {
    const summary = summarizeUsageHistory(
      [
        output("openai-api", [
          {
            periodStart: "2026-07-10T00:00:00.000Z",
            periodEnd: "2026-07-11T00:00:00.000Z",
            scope: "cost",
            costUsd: 3,
          },
          {
            periodStart: "2026-07-09T00:00:00.000Z",
            periodEnd: "2026-07-10T00:00:00.000Z",
            scope: "cost",
            costUsd: 0,
          },
          {
            periodStart: "2026-07-10T00:00:00.000Z",
            periodEnd: "2026-07-11T00:00:00.000Z",
            scope: "usage",
            model: "gpt-5",
            inputTokens: 60,
            outputTokens: 40,
            totalTokens: 100,
            requests: 2,
          },
          {
            periodStart: "2026-07-10T00:00:00.000Z",
            periodEnd: "2026-07-11T00:00:00.000Z",
            scope: "usage",
            model: "gpt-4.1",
            inputTokens: 5,
            outputTokens: 5,
            totalTokens: 10,
            requests: 1,
          },
        ]),
      ],
      { period: "7d", nowMs: NOW_MS }
    )

    expect(summary.totals).toMatchObject({
      costUsd: 3,
      requests: 3,
      inputTokens: 65,
      outputTokens: 45,
      totalTokens: 110,
      cacheReadTokens: null,
    })
    expect(summary.topModel).toEqual({
      model: "gpt-5",
      costUsd: null,
      requests: 2,
      totalTokens: 100,
    })
  })

  it("keeps a scoped metric unknown when no row reports it or a reporting row omits it", () => {
    const costOnly = summarizeUsageHistory(
      [
        output("openai-api", [
          {
            ...historyEntry(),
            scope: "cost",
            model: undefined,
            requests: undefined,
            inputTokens: undefined,
            outputTokens: undefined,
            reasoningTokens: undefined,
            totalTokens: undefined,
          },
        ]),
      ],
      { period: "today", nowMs: NOW_MS }
    )
    expect(costOnly.totals.costUsd).toBe(1)
    expect(costOnly.totals.totalTokens).toBeNull()
    expect(costOnly.totals.requests).toBeNull()

    const partialUsage = summarizeUsageHistory(
      [
        output("openai-api", [
          { ...historyEntry(), scope: "usage", costUsd: undefined },
          { ...historyEntry(), scope: "usage", costUsd: undefined, requests: undefined },
        ]),
      ],
      { period: "today", nowMs: NOW_MS }
    )
    expect(partialUsage.totals.totalTokens).toBe(200)
    expect(partialUsage.totals.requests).toBeNull()
    expect(partialUsage.totals.costUsd).toBeNull()
  })

  it("sums charged cost apart from list-price cost and keeps partial charged totals unknown", () => {
    const charged = summarizeUsageHistory(
      [
        output("cursor", [
          historyEntry({ costUsd: 2, chargedCostUsd: 0.5 }),
          historyEntry({ costUsd: 1, chargedCostUsd: 0 }),
        ]),
      ],
      { period: "today", nowMs: NOW_MS }
    )
    expect(charged.totals.costUsd).toBe(3)
    expect(charged.totals.chargedCostUsd).toBe(0.5)

    const partial = summarizeUsageHistory(
      [
        output("cursor", [historyEntry({ costUsd: 2, chargedCostUsd: 0.5 })]),
        output("codex", [historyEntry({ costUsd: 1 })]),
      ],
      { period: "today", nowMs: NOW_MS }
    )
    expect(partial.totals.costUsd).toBe(3)
    expect(partial.totals.chargedCostUsd).toBeNull()
  })

  it("counts charged cost as a cost metric of scoped rows", () => {
    const usageRow = { ...historyEntry(), scope: "usage" as const, costUsd: undefined }
    const withUsageRows = summarizeUsageHistory(
      [
        output("cursor", [historyEntry({ costUsd: 2, chargedCostUsd: 0.5 })]),
        output("openai-api", [usageRow]),
      ],
      { period: "today", nowMs: NOW_MS }
    )
    // A usage row reports no cost, so it does not make the charged total unknown.
    expect(withUsageRows.totals.chargedCostUsd).toBe(0.5)

    const withCostRow = summarizeUsageHistory(
      [
        output("cursor", [historyEntry({ costUsd: 2, chargedCostUsd: 0.5 })]),
        output("openai-api", [
          {
            periodStart: "2026-07-10T00:00:00.000Z",
            periodEnd: "2026-07-11T00:00:00.000Z",
            scope: "cost",
            costUsd: 3,
          },
        ]),
      ],
      { period: "today", nowMs: NOW_MS }
    )
    // A cost row without a charged amount keeps the charged total unknown.
    expect(withCostRow.totals.costUsd).toBe(5)
    expect(withCostRow.totals.chargedCostUsd).toBeNull()
  })

  it("selects the top model by cost, then tokens and requests", () => {
    const summary = summarizeUsageHistory(
      [
        output("codex", [
          historyEntry({ model: "gpt-5", costUsd: 3, totalTokens: 100, requests: 1 }),
          historyEntry({ model: "gpt-5", costUsd: 2, totalTokens: 50, requests: 1 }),
          historyEntry({ model: "gpt-4.1", costUsd: 4, totalTokens: 10_000, requests: 20 }),
        ]),
      ],
      { period: "today", nowMs: NOW_MS }
    )

    expect(summary.topModel).toEqual({
      model: "gpt-5",
      costUsd: 5,
      requests: 2,
      totalTokens: 150,
    })
  })

  it("returns zero totals and no top model for sparse empty data", () => {
    const summary = summarizeUsageHistory([], { period: "30d", nowMs: NOW_MS })

    expect(summary.entryCount).toBe(0)
    expect(summary.topModel).toBeNull()
    expect(summary.totals.costUsd).toBeNull()
    expect(summary.totals.totalTokens).toBeNull()
  })

  it("keeps missing totals unknown while preserving authoritative zero totals", () => {
    const summary = summarizeUsageHistory(
      [
        output("codex", [
          historyEntry({
            costUsd: undefined,
            requests: undefined,
            inputTokens: undefined,
            outputTokens: undefined,
            cacheReadTokens: undefined,
            cacheCreationTokens: undefined,
            reasoningTokens: undefined,
            totalTokens: undefined,
          }),
          historyEntry({
            costUsd: 0,
            requests: 0,
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            reasoningTokens: 0,
            totalTokens: 0,
          }),
        ]),
      ],
      { period: "today", nowMs: NOW_MS }
    )

    expect(summary.totals).toEqual({
      costUsd: null,
      chargedCostUsd: null,
      requests: null,
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      cacheCreationTokens: null,
      reasoningTokens: null,
      totalTokens: null,
    })

    const zeroSummary = summarizeUsageHistory(
      [
        output("codex", [
          historyEntry({
            costUsd: 0,
            requests: 0,
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            reasoningTokens: 0,
            totalTokens: 0,
          }),
        ]),
      ],
      { period: "today", nowMs: NOW_MS }
    )

    expect(zeroSummary.totals.costUsd).toBe(0)
    expect(zeroSummary.totals.totalTokens).toBe(0)
  })

  it("builds every period summary from the same filters", () => {
    const summaries = summarizeUsageHistoryPeriods(
      [
        output("codex", [
          historyEntry(),
          historyEntry({
            periodStart: "2026-07-09T00:00:00.000Z",
            periodEnd: "2026-07-10T00:00:00.000Z",
          }),
        ]),
      ],
      { nowMs: NOW_MS, providerIds: ["codex"] }
    )

    expect(summaries.today.entryCount).toBe(1)
    expect(summaries.yesterday.entryCount).toBe(1)
    expect(summaries["7d"].entryCount).toBe(2)
    expect(summaries["30d"].entryCount).toBe(2)
    expect(summaries.weekToDate.entryCount).toBe(2)
    expect(summaries.monthToDate.entryCount).toBe(2)
  })
})
