import { describe, expect, it } from "vitest"
import type { PluginOutput, UsageHistoryEntry } from "@/lib/plugin-types"
import {
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
      requests: 5,
      inputTokens: null,
      outputTokens: 77,
      cacheReadTokens: null,
      cacheCreationTokens: null,
      reasoningTokens: null,
      totalTokens: null,
    })
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

  it("builds all four period summaries from the same filters", () => {
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
  })
})
