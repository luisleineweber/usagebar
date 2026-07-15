import { describe, expect, it } from "vitest"
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  deriveUsageEvents,
  isQuietHours,
} from "@/lib/notification-events"
import type { PluginOutput } from "@/lib/plugin-types"

function output(used: number, resetsAt = "2026-07-14T00:00:00Z"): PluginOutput {
  return {
    providerId: "claude",
    displayName: "Claude",
    iconUrl: "",
    lines: [{ type: "progress", label: "Session", used, limit: 100, format: { kind: "percent" }, resetsAt }],
  }
}

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

  it("handles overnight quiet hours", () => {
    const preferences = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      quietHours: { enabled: true, start: "22:00", end: "08:00" },
    }
    expect(isQuietHours(preferences, new Date(2026, 6, 13, 23, 0))).toBe(true)
    expect(isQuietHours(preferences, new Date(2026, 6, 13, 12, 0))).toBe(false)
  })
})
