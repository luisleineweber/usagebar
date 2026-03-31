import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { PluginState } from "@/hooks/app/types"
import { useSettingsPluginList } from "@/hooks/app/use-settings-plugin-list"
import type { PluginMeta } from "@/lib/plugin-types"
import type { PluginSettings } from "@/lib/settings"

function createPluginMeta(id: string, name: string): PluginMeta {
  return {
    id,
    name,
    iconUrl: `/${id}.svg`,
    brandColor: "#000000",
    lines: [],
    primaryCandidates: [],
  }
}

const defaultState: PluginState = {
  data: null,
  loading: false,
  error: null,
  lastManualRefreshAt: null,
  lastSuccessAt: null,
}

describe("useSettingsPluginList", () => {
  it("returns ordered settings plugins with enabled state", () => {
    const pluginSettings: PluginSettings = {
      order: ["codex", "missing", "cursor"],
      disabled: ["cursor"],
    }

    const { result } = renderHook(() =>
      useSettingsPluginList({
        pluginSettings,
        pluginsMeta: [
          createPluginMeta("cursor", "Cursor"),
          createPluginMeta("codex", "Codex"),
        ],
        pluginStates: {
          codex: defaultState,
          cursor: { ...defaultState, error: "sign in required" },
        },
        providerConfigs: {
          cursor: { source: "manual" },
        },
      })
    )

    expect(result.current).toEqual([
      expect.objectContaining({ id: "codex", name: "Codex", enabled: true, iconUrl: "/codex.svg" }),
      expect.objectContaining({
        id: "cursor",
        name: "Cursor",
        enabled: false,
        iconUrl: "/cursor.svg",
        config: { source: "manual" },
        state: { ...defaultState, error: "sign in required" },
      }),
    ])
  })

  it("returns empty list when settings are not loaded", () => {
    const { result } = renderHook(() =>
      useSettingsPluginList({
        pluginSettings: null,
        pluginsMeta: [createPluginMeta("codex", "Codex")],
        pluginStates: {},
        providerConfigs: {},
      })
    )

    expect(result.current).toEqual([])
  })
})
