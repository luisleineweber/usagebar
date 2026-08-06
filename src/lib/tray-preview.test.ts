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

const fourProviderMeta = [
  ...pluginsMeta,
  {
    id: "cursor",
    name: "Cursor",
    iconUrl: "cursor-icon",
    primaryCandidates: ["Requests"],
    lines: [{ type: "progress" as const, label: "Requests", scope: "overview" as const }],
  },
  {
    id: "opencode",
    name: "OpenCode",
    iconUrl: "opencode-icon",
    primaryCandidates: ["Usage"],
    lines: [{ type: "progress" as const, label: "Usage", scope: "overview" as const }],
  },
]

const fourProviderStates = {
  ...pluginStates,
  cursor: {
    data: {
      providerId: "cursor",
      displayName: "Cursor",
      iconUrl: "cursor-icon",
      lines: [
        {
          type: "progress" as const,
          label: "Requests",
          used: 30,
          limit: 100,
          format: { kind: "percent" as const },
        },
      ],
    },
    loading: false,
    error: null,
  },
  opencode: {
    data: {
      providerId: "opencode",
      displayName: "OpenCode",
      iconUrl: "opencode-icon",
      lines: [
        {
          type: "progress" as const,
          label: "Usage",
          used: 90,
          limit: 100,
          format: { kind: "percent" as const },
        },
      ],
    },
    loading: false,
    error: null,
  },
}

describe("buildTraySettingsPreview", () => {
  it("uses the first four primary provider metrics for stacked bars", () => {
    const result = buildTraySettingsPreview({
      pluginsMeta: fourProviderMeta,
      pluginSettings: { order: ["codex", "claude", "cursor", "opencode"], disabled: [] },
      pluginStates: fourProviderStates,
      displayMode: "left",
    })

    expect(result.preview.bars).toEqual([
      { id: "codex", fraction: 0.8 },
      { id: "claude", fraction: 0.3 },
      { id: "cursor", fraction: 0.7 },
      { id: "opencode", fraction: 0.1 },
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
