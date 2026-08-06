import type { PluginState } from "@/hooks/app/types"
import type { PluginMeta } from "@/lib/plugin-types"
import type { DisplayMode, MenubarIconStyle, PluginSettings, SurfacePin } from "@/lib/settings"
import { getTrayPinnedBars, getTrayPrimaryBars, type TrayPrimaryBar } from "@/lib/tray-primary-progress"
import { formatTrayNativeTitle } from "@/lib/tray-tooltip"
import { resolveTrayState, type TrayState } from "@/lib/tray-state"

export type TraySettingsPreview = {
  bars: TrayPrimaryBar[]
  providerBars: TrayPrimaryBar[]
  providerIconUrl?: string
  providerPercentText: string
  state?: TrayState
}

export const EMPTY_TRAY_SETTINGS_PREVIEW: TraySettingsPreview = {
  bars: [],
  providerBars: [],
  providerPercentText: "–",
}

export function buildTraySettingsPreview(args: {
  pluginsMeta: PluginMeta[]
  pluginSettings: PluginSettings | null
  pluginStates: Record<string, PluginState>
  displayMode: DisplayMode
  surfacePins?: SurfacePin[]
  preferredProviderId?: string | null
}): { preview: TraySettingsPreview; state: TrayState } {
  const {
    pluginsMeta,
    pluginSettings,
    pluginStates,
    displayMode,
    surfacePins = [],
    preferredProviderId = null,
  } = args
  if (!pluginSettings) {
    return {
      preview: EMPTY_TRAY_SETTINGS_PREVIEW,
      state: resolveTrayState({ pluginsMeta, pluginSettings, pluginStates, preferredProviderId }),
    }
  }

  const state = resolveTrayState({
    pluginsMeta,
    pluginSettings,
    pluginStates,
    preferredProviderId,
  })
  const pinnedBars = getTrayPinnedBars({ pins: surfacePins, pluginSettings, pluginStates, displayMode })
  const bars = pinnedBars.length > 0
    ? pinnedBars
    : getTrayPrimaryBars({ pluginsMeta, pluginSettings, pluginStates, maxBars: 4, displayMode })
  const providerBars = state.providerId
    ? getTrayPrimaryBars({
        pluginsMeta,
        pluginSettings,
        pluginStates,
        maxBars: 1,
        displayMode: "left",
        pluginId: state.providerId,
      })
    : []

  return {
    state,
    preview: {
      bars,
      providerBars,
      providerIconUrl: state.providerId
        ? pluginsMeta.find((plugin) => plugin.id === state.providerId)?.iconUrl
        : undefined,
      providerPercentText: formatTrayNativeTitle(state),
      state,
    },
  }
}

export function getPreviewStyle(style: MenubarIconStyle, preview: TraySettingsPreview): {
  bars: TrayPrimaryBar[]
  percentText?: string
} {
  if (style === "provider" || style === "donut") {
    return { bars: preview.providerBars, percentText: style === "provider" ? preview.providerPercentText : undefined }
  }
  return { bars: preview.bars }
}
