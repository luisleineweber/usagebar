import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PluginMeta } from "@/lib/plugin-types"

const { saveModelPriceOverridesMock, saveNotificationPreferencesMock, storeState } = vi.hoisted(
  () => ({
    saveNotificationPreferencesMock: vi.fn(),
    saveModelPriceOverridesMock: vi.fn(),
    storeState: new Map<string, unknown>(),
  })
)

vi.mock("@tauri-apps/plugin-store", () => ({
  LazyStore: class {
    async get<T>(key: string): Promise<T | null> {
      return (storeState.get(key) as T | undefined) ?? null
    }

    async set<T>(key: string, value: T): Promise<void> {
      storeState.set(key, value)
    }

    async save(): Promise<void> {}
  },
}))

vi.mock("@/lib/notification-settings", () => ({
  saveNotificationPreferences: saveNotificationPreferencesMock,
}))

vi.mock("@/lib/report-pricing", () => ({
  saveModelPriceOverrides: saveModelPriceOverridesMock,
}))

import { resetAllSettings } from "@/lib/settings-reset"

const plugins: PluginMeta[] = [
  {
    id: "claude",
    name: "Claude",
    iconUrl: "/claude.svg",
    lines: [],
    primaryCandidates: [],
  },
  {
    id: "gemini",
    name: "Gemini",
    iconUrl: "/gemini.svg",
    lines: [],
    primaryCandidates: [],
  },
]

describe("resetAllSettings", () => {
  beforeEach(() => {
    storeState.clear()
    saveNotificationPreferencesMock.mockReset()
    saveModelPriceOverridesMock.mockReset()
    saveNotificationPreferencesMock.mockResolvedValue(undefined)
    saveModelPriceOverridesMock.mockResolvedValue(undefined)
  })

  it("restores preferences and preserves provider configuration", async () => {
    const providerConfigs = {
      claude: {
        source: "manual" as const,
        secrets: { cookieHeader: { updatedAt: 123 } },
      },
    }
    storeState.set("providerConfigs", providerConfigs)

    const reset = await resetAllSettings(plugins)

    expect(reset.pluginSettings).toEqual({
      order: ["claude", "gemini"],
      disabled: ["gemini"],
    })
    expect(reset.probePluginIds).toEqual(["claude"])
    expect(storeState.get("themeMode")).toBe("system")
    expect(storeState.get("displayMode")).toBe("left")
    expect(storeState.get("globalShortcut")).toBeNull()
    expect(storeState.get("plugins")).toEqual(reset.pluginSettings)
    expect(storeState.get("providerConfigs")).toEqual(providerConfigs)
    expect(saveNotificationPreferencesMock).toHaveBeenCalledOnce()
    expect(saveModelPriceOverridesMock).toHaveBeenCalledWith({})
  })
})
