import { describe, expect, it } from "vitest"

import { buildTraySettingsPreview } from "@/lib/tray-preview"

const pluginsMeta = [
  {
    id: "codex",
    name: "Codex",
    iconUrl: "codex-icon",
    primaryCandidates: ["Session"],
    lines: [
      { type: "progress" as const, label: "Session", scope: "overview" as const },
      { type: "progress" as const, label: "Weekly", scope: "overview" as const },
    ],
  },
  {
    id: "claude",
    name: "Claude",
    iconUrl: "claude-icon",
    primaryCandidates: ["Weekly"],
    lines: [{ type: "progress" as const, label: "Weekly", scope: "overview" as const }],
  },
]

const pluginStates = {
  codex: {
    data: {
      providerId: "codex",
      displayName: "Codex",
      iconUrl: "codex-icon",
      lines: [
        { type: "progress" as const, label: "Session", used: 20, limit: 100, format: { kind: "percent" as const } },
        { type: "progress" as const, label: "Weekly", used: 60, limit: 100, format: { kind: "percent" as const } },
      ],
    },
    loading: false,
    error: null,
  },
  claude: {
    data: {
      providerId: "claude",
      displayName: "Claude",
      iconUrl: "claude-icon",
      lines: [
        { type: "progress" as const, label: "Weekly", used: 70, limit: 100, format: { kind: "percent" as const } },
      ],
    },
    loading: false,
    error: null,
  },
}

describe("buildTraySettingsPreview", () => {
  it("keeps Metric 1 and Metric 2 values by provider and metric identity", () => {
    const result = buildTraySettingsPreview({
      pluginsMeta,
      pluginSettings: { order: ["codex", "claude"], disabled: [] },
      pluginStates,
      displayMode: "left",
      surfacePins: [
        { providerId: "codex", metricLabel: "Weekly", presentation: "bar" },
        { providerId: "claude", metricLabel: "Weekly", presentation: "text" },
      ],
    })

    expect(result.preview.bars).toEqual([
      { id: "codex:Weekly", fraction: 0.4 },
      { id: "claude:Weekly", fraction: 0.3 },
    ])
  })

  it("keeps the first provider for the History view", () => {
    const result = buildTraySettingsPreview({
      pluginsMeta,
      pluginSettings: { order: ["codex", "claude"], disabled: [] },
      pluginStates,
      displayMode: "left",
    })

    expect(result.state).toMatchObject({
      kind: "value",
      providerId: "codex",
      remainingPercentExact: 80,
    })
    expect(result.preview.providerBars).toEqual([{ id: "codex", fraction: 0.8 }])
    expect(result.preview.providerIconUrl).toBe("codex-icon")
  })
})
