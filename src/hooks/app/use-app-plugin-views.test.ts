import { renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useAppPluginViews } from "@/hooks/app/use-app-plugin-views"
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

describe("useAppPluginViews", () => {
  it("derives display and nav plugins from settings order", () => {
    const pluginSettings: PluginSettings = {
      order: ["codex", "cursor"],
      disabled: ["cursor"],
    }

    const pluginsMeta = [
      createPluginMeta("cursor", "Cursor"),
      createPluginMeta("codex", "Codex"),
    ]

    const { result } = renderHook(() =>
      useAppPluginViews({
        activeView: "home",
        setActiveView: vi.fn(),
        pluginSettings,
        pluginsMeta,
        pluginStates: {
          codex: {
            data: null,
            loading: true,
            error: null,
            lastManualRefreshAt: null,
            lastSuccessAt: null,
          },
        },
      })
    )

    expect(result.current.displayPlugins).toHaveLength(1)
    expect(result.current.displayPlugins[0]?.meta.id).toBe("codex")
    expect(result.current.displayPlugins[0]?.loading).toBe(true)
    expect(result.current.navPlugins).toEqual([
      {
        id: "codex",
        name: "Codex",
        iconUrl: "/codex.svg",
        brandColor: "#000000",
      },
    ])
  })

  it("keeps errored providers visible in home and nav", () => {
    const pluginSettings: PluginSettings = {
      order: ["codex", "cursor"],
      disabled: [],
    }

    const pluginsMeta = [
      createPluginMeta("codex", "Codex"),
      createPluginMeta("cursor", "Cursor"),
    ]

    const { result } = renderHook(() =>
      useAppPluginViews({
        activeView: "home",
        setActiveView: vi.fn(),
        pluginSettings,
        pluginsMeta,
        pluginStates: {
          codex: {
            data: { providerId: "codex", displayName: "Codex", lines: [], iconUrl: "/codex.svg" },
            loading: false,
            error: null,
            lastManualRefreshAt: null,
            lastSuccessAt: null,
          },
          cursor: {
            data: null,
            loading: false,
            error: "Not logged in",
            lastManualRefreshAt: null,
            lastSuccessAt: null,
          },
        },
      })
    )

    expect(result.current.displayPlugins.map((plugin) => plugin.meta.id)).toEqual(["codex", "cursor"])
    expect(result.current.navPlugins.map((plugin) => plugin.id)).toEqual(["codex", "cursor"])
  })

  it("falls back to home when active provider becomes disabled", async () => {
    const setActiveView = vi.fn()
    const pluginSettings: PluginSettings = {
      order: ["codex"],
      disabled: ["codex"],
    }

    renderHook(() =>
      useAppPluginViews({
        activeView: "codex",
        setActiveView,
        pluginSettings,
        pluginsMeta: [createPluginMeta("codex", "Codex")],
        pluginStates: {},
      })
    )

    await waitFor(() => {
      expect(setActiveView).toHaveBeenCalledWith("home")
    })
  })

  it("does not fall back while plugin settings are still loading", async () => {
    const setActiveView = vi.fn()
    const pluginsMeta = [createPluginMeta("codex", "Codex")]
    const { rerender } = renderHook(
      ({ pluginSettings }: { pluginSettings: PluginSettings | null }) =>
        useAppPluginViews({
          activeView: "codex",
          setActiveView,
          pluginSettings,
          pluginsMeta,
          pluginStates: {},
        }),
      { initialProps: { pluginSettings: null } }
    )

    expect(setActiveView).not.toHaveBeenCalled()

    rerender({
      pluginSettings: {
        order: ["codex"],
        disabled: ["codex"],
      },
    })

    await waitFor(() => {
      expect(setActiveView).toHaveBeenCalledWith("home")
    })
  })

  it("returns selected plugin for active provider view", () => {
    const pluginSettings: PluginSettings = {
      order: ["codex"],
      disabled: [],
    }

    const { result } = renderHook(() =>
      useAppPluginViews({
        activeView: "codex",
        setActiveView: vi.fn(),
        pluginSettings,
        pluginsMeta: [createPluginMeta("codex", "Codex")],
        pluginStates: {
          codex: {
            data: { providerId: "codex", displayName: "Codex", lines: [], iconUrl: "/codex.svg" },
            loading: false,
            error: null,
            lastManualRefreshAt: null,
            lastSuccessAt: null,
          },
        },
      })
    )

    expect(result.current.selectedPlugin?.meta.id).toBe("codex")
  })
})
