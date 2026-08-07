import { describe, expect, it } from "vitest"
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  deriveUsageEvents,
  isQuietHours,
  normalizeNotificationPreferences,
} from "@/lib/notification-events"
import type { PluginOutput } from "@/lib/plugin-types"
import type { ProviderStatus } from "@/lib/provider-status"

function output(used: number, resetsAt = "2026-07-14T00:00:00Z"): PluginOutput {
  return {
    providerId: "claude",
    displayName: "Claude",
    iconUrl: "",
    lines: [
      {
        type: "progress",
        label: "Session",
        used,
        limit: 100,
        format: { kind: "percent" },
        resetsAt,
      },
    ],
  }
}

function status(
  indicator: ProviderStatus["indicator"],
  description: string | null = null
): ProviderStatus {
  return { indicator, description, updatedAt: "2026-07-14T10:00:00Z", checkedAt: 10 }
}

describe("notification preference normalization", () => {
  it("uses defaults for missing or invalid preference data", () => {
    expect(normalizeNotificationPreferences(null)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES)
    expect(normalizeNotificationPreferences("enabled")).toEqual(DEFAULT_NOTIFICATION_PREFERENCES)
    expect(
      normalizeNotificationPreferences({
        enabled: "yes",
        quotaThresholds: "90",
        quietHours: { enabled: true, start: "9:00", end: "invalid" },
      })
    ).toEqual({
      enabled: false,
      quotaThresholds: [75, 90],
      incidents: true,
      resets: true,
      quietHours: { enabled: true, start: "22:00", end: "08:00" },
    })
  })

  it("sorts, deduplicates, and bounds quota thresholds", () => {
    expect(
      normalizeNotificationPreferences({
        enabled: true,
        quotaThresholds: [99, 50, 50, 0, 100, Number.NaN],
        incidents: false,
        resets: false,
        quietHours: { enabled: false, start: "09:15", end: "17:45" },
      })
    ).toEqual({
      enabled: true,
      quotaThresholds: [50, 99],
      incidents: false,
      resets: false,
      quietHours: { enabled: false, start: "09:15", end: "17:45" },
    })
  })
})

describe("notification event derivation", () => {
  it("emits each crossed quota threshold with a stable identity", () => {
    const events = deriveUsageEvents({
      previousOutputs: { claude: output(70) },
      outputs: { claude: output(92) },
      previousStatuses: {},
      statuses: {},
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
      now: 10,
    })
    expect(events.map((event) => event.id)).toEqual([
      "quota:claude:session:75:2026-07-14T00:00:00Z",
      "quota:claude:session:90:2026-07-14T00:00:00Z",
    ])
  })

  it("records quota resets only when the provider reset advances", () => {
    const events = deriveUsageEvents({
      previousOutputs: { claude: output(95, "2026-07-14T00:00:00Z") },
      outputs: { claude: output(5, "2026-07-21T00:00:00Z") },
      previousStatuses: {},
      statuses: {},
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
    })
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe("reset")
  })

  it("isolates quota events by provider instance and ignores an account swap baseline", () => {
    const events = deriveUsageEvents({
      previousOutputs: {
        codex: {
          ...output(70),
          providerId: "codex",
          instanceRef: { providerId: "codex", instanceId: "profile-a" },
        },
      },
      outputs: {
        codex: {
          ...output(95),
          providerId: "codex",
          instanceRef: { providerId: "codex", instanceId: "profile-b" },
        },
      },
      previousStatuses: {},
      statuses: {},
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
    })

    expect(events).toEqual([])

    const accountEvents = deriveUsageEvents({
      previousOutputs: {
        codex: {
          ...output(70),
          providerId: "codex",
          instanceRef: { providerId: "codex", instanceId: "profile-b" },
        },
      },
      outputs: {
        codex: {
          ...output(95),
          providerId: "codex",
          instanceRef: { providerId: "codex", instanceId: "profile-b" },
        },
      },
      previousStatuses: {},
      statuses: {},
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
    })

    expect(accountEvents[0]?.id).toContain("quota:codex:profile-b:")
  })

  it("handles overnight quiet hours", () => {
    const preferences = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      quietHours: { enabled: true, start: "22:00", end: "08:00" },
    }
    expect(isQuietHours(preferences, new Date(2026, 6, 13, 23, 0))).toBe(true)
    expect(isQuietHours(preferences, new Date(2026, 6, 13, 12, 0))).toBe(false)
  })

  it("handles disabled, daytime, and all-day quiet hours", () => {
    expect(isQuietHours(DEFAULT_NOTIFICATION_PREFERENCES, new Date(2026, 6, 13, 23))).toBe(false)
    expect(
      isQuietHours(
        {
          ...DEFAULT_NOTIFICATION_PREFERENCES,
          quietHours: { enabled: true, start: "09:00", end: "17:00" },
        },
        new Date(2026, 6, 13, 12)
      )
    ).toBe(true)
    expect(
      isQuietHours(
        {
          ...DEFAULT_NOTIFICATION_PREFERENCES,
          quietHours: { enabled: true, start: "09:00", end: "09:00" },
        },
        new Date(2026, 6, 13, 2)
      )
    ).toBe(true)
  })

  it("ignores missing outputs, non-progress lines, and missing baselines", () => {
    const data = output(90)
    data.lines.unshift({ type: "text", label: "Source", value: "API" })

    expect(
      deriveUsageEvents({
        previousOutputs: { claude: undefined },
        outputs: { missing: undefined, claude: data },
        previousStatuses: {},
        statuses: {},
        preferences: DEFAULT_NOTIFICATION_PREFERENCES,
      })
    ).toEqual([])
  })

  it("ignores unchanged quota levels and resets without an advanced reset time", () => {
    expect(
      deriveUsageEvents({
        previousOutputs: { claude: output(80) },
        outputs: { claude: output(70) },
        previousStatuses: {},
        statuses: {},
        preferences: DEFAULT_NOTIFICATION_PREFERENCES,
      })
    ).toEqual([])
  })

  it("reports new incidents, status changes, and recoveries", () => {
    const newIncident = deriveUsageEvents({
      previousOutputs: {},
      outputs: { claude: output(10) },
      previousStatuses: {},
      statuses: { claude: status("minor", "  Elevated errors  ") },
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
      now: 20,
    })
    expect(newIncident).toEqual([
      expect.objectContaining({
        type: "incident",
        title: "Claude service incident",
        body: "Elevated errors",
        createdAt: 20,
      }),
    ])

    const changedIncident = deriveUsageEvents({
      previousOutputs: {},
      outputs: {},
      previousStatuses: { kilo: status("minor") },
      statuses: { kilo: { ...status("major"), updatedAt: null } },
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
    })
    expect(changedIncident[0]).toMatchObject({
      id: "incident:kilo:major:10",
      body: "major provider status",
    })

    const recovery = deriveUsageEvents({
      previousOutputs: {},
      outputs: {},
      previousStatuses: { kilo: status("major") },
      statuses: { kilo: status("none") },
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
    })
    expect(recovery[0]).toMatchObject({
      type: "incidentResolved",
      title: "kilo incident resolved",
    })
  })

  it("does not report unchanged incidents or incidents when disabled", () => {
    expect(
      deriveUsageEvents({
        previousOutputs: {},
        outputs: {},
        previousStatuses: { claude: status("minor") },
        statuses: { missing: undefined, claude: status("minor") },
        preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, incidents: false },
      })
    ).toEqual([])
  })
})
