import { useCallback, useEffect, useRef, useState } from "react"
import { resolveResource } from "@tauri-apps/api/path"
import { TrayIcon } from "@tauri-apps/api/tray"
import type { PluginMeta } from "@/lib/plugin-types"
import type {
  AccentColor,
  DisplayMode,
  MenubarIconStyle,
  PluginSettings,
  TrayProviderSelection,
  TimeFormatMode,
} from "@/lib/settings"
import {
  buildTraySettingsPreview,
  EMPTY_TRAY_SETTINGS_PREVIEW,
  type TraySettingsPreview,
} from "@/lib/tray-preview"
import {
  getTrayIconSizePx,
  renderTrayBarsIcon,
  TRAY_TEMPLATE_FOREGROUND,
} from "@/lib/tray-bars-icon"
import {
  getSystemTrayColorScheme,
  getTrayNumberColor,
  getWindowsTrayIconSizePx,
  renderTrayNumberIcon,
} from "@/lib/tray-number-icon"
import {
  formatTrayBarsTooltip,
  formatTrayNativeTitle,
  formatTrayTooltip,
} from "@/lib/tray-tooltip"
import type { TrayState } from "@/lib/tray-state"
import type { PluginState } from "@/hooks/app/types"

export type TrayUpdateReason = "probe" | "settings" | "init"

type UseTrayIconArgs = {
  pluginsMeta: PluginMeta[]
  pluginSettings: PluginSettings | null
  pluginStates: Record<string, PluginState>
  displayMode: DisplayMode
  accentColor: AccentColor
  menubarIconStyle: MenubarIconStyle
  activeView: string
  trayProviderSelection: TrayProviderSelection
  timeFormatMode?: TimeFormatMode
}

export type { TraySettingsPreview } from "@/lib/tray-preview"

export function shouldUseTemplateTrayIcon(): boolean {
  const platform = navigator.platform.toLowerCase()
  const userAgent = navigator.userAgent.toLowerCase()
  return platform.includes("mac") || userAgent.includes("mac os")
}

function isSameTraySettingsPreview(a: TraySettingsPreview, b: TraySettingsPreview): boolean {
  if (a.providerIconUrl !== b.providerIconUrl) return false
  if (a.providerPercentText !== b.providerPercentText) return false
  if (a.bars.length !== b.bars.length) return false
  if (a.providerBars.length !== b.providerBars.length) return false
  for (let i = 0; i < a.bars.length; i += 1) {
    if (a.bars[i]?.id !== b.bars[i]?.id) return false
    if (a.bars[i]?.fraction !== b.bars[i]?.fraction) return false
  }
  for (let i = 0; i < a.providerBars.length; i += 1) {
    if (a.providerBars[i]?.id !== b.providerBars[i]?.id) return false
    if (a.providerBars[i]?.fraction !== b.providerBars[i]?.fraction) return false
  }
  return true
}

function getTrayStateValue(state: TrayState): string {
  if (state.kind === "error") return "error"
  if (state.kind === "unknown") return "unknown"
  return String(Math.round(state.remainingPercentExact))
}

export function useTrayIcon({
  pluginsMeta,
  pluginSettings,
  pluginStates,
  displayMode,
  accentColor,
  menubarIconStyle,
  activeView,
  trayProviderSelection,
  timeFormatMode = "auto",
}: UseTrayIconArgs) {
  const trayRef = useRef<TrayIcon | null>(null)
  const trayGaugeIconPathRef = useRef<string | null>(null)
  const trayUpdateTimerRef = useRef<number | null>(null)
  const trayUpdatePendingRef = useRef(false)
  const trayUpdateQueuedRef = useRef(false)
  const [trayReady, setTrayReady] = useState(false)
  const [traySettingsPreview, setTraySettingsPreview] = useState<TraySettingsPreview>(
    EMPTY_TRAY_SETTINGS_PREVIEW
  )

  const pluginsMetaRef = useRef(pluginsMeta)
  const pluginSettingsRef = useRef(pluginSettings)
  const pluginStatesRef = useRef(pluginStates)
  const displayModeRef = useRef(displayMode)
  const accentColorRef = useRef(accentColor)
  const menubarIconStyleRef = useRef(menubarIconStyle)
  const activeViewRef = useRef(activeView)
  const trayProviderSelectionRef = useRef(trayProviderSelection)
  const lastLeftProviderIdRef = useRef<string | null>(null)
  const timeFormatModeRef = useRef(timeFormatMode)
  const useTemplateIconRef = useRef(shouldUseTemplateTrayIcon())
  const lastIconKeyRef = useRef<string | null>(null)
  const lastTooltipRef = useRef<string | null>(null)
  const lastTitleRef = useRef<string | null>(null)
  const lastTemplateRef = useRef<boolean | null>(null)

  useEffect(() => {
    pluginsMetaRef.current = pluginsMeta
  }, [pluginsMeta])
  useEffect(() => {
    pluginSettingsRef.current = pluginSettings
  }, [pluginSettings])
  useEffect(() => {
    pluginStatesRef.current = pluginStates
  }, [pluginStates])
  useEffect(() => {
    displayModeRef.current = displayMode
  }, [displayMode])
  useEffect(() => {
    accentColorRef.current = accentColor
  }, [accentColor])
  useEffect(() => {
    menubarIconStyleRef.current = menubarIconStyle
  }, [menubarIconStyle])
  useEffect(() => {
    const previousView = activeViewRef.current
    if (
      previousView !== activeView &&
      pluginsMetaRef.current.some((plugin) => plugin.id === previousView)
    ) {
      lastLeftProviderIdRef.current = previousView
    }
    activeViewRef.current = activeView
  }, [activeView])
  useEffect(() => {
    trayProviderSelectionRef.current = trayProviderSelection
  }, [trayProviderSelection])
  useEffect(() => {
    timeFormatModeRef.current = timeFormatMode
  }, [timeFormatMode])

  const scheduleTrayIconUpdate = useCallback((_reason: TrayUpdateReason, delayMs = 0) => {
    if (trayUpdateTimerRef.current !== null) {
      window.clearTimeout(trayUpdateTimerRef.current)
      trayUpdateTimerRef.current = null
    }

    trayUpdateTimerRef.current = window.setTimeout(() => {
      trayUpdateTimerRef.current = null
      if (trayUpdatePendingRef.current) {
        trayUpdateQueuedRef.current = true
        return
      }
      trayUpdatePendingRef.current = true

      const finalizeUpdate = () => {
        trayUpdatePendingRef.current = false
        if (!trayUpdateQueuedRef.current) return
        trayUpdateQueuedRef.current = false
        scheduleTrayIconUpdate("probe", 0)
      }

      const tray = trayRef.current
      if (!tray) {
        finalizeUpdate()
        return
      }

      const maybeSetTitle = (tray as TrayIcon & { setTitle?: (value: string) => Promise<void> })
        .setTitle
      const maybeSetTooltip = (tray as TrayIcon & { setTooltip?: (value: string) => Promise<void> })
        .setTooltip
      const setTooltipIfChanged = (tooltip: string) => {
        if (lastTooltipRef.current === tooltip || typeof maybeSetTooltip !== "function") {
          return Promise.resolve()
        }
        lastTooltipRef.current = tooltip
        return maybeSetTooltip.call(tray, tooltip)
      }
      const setTitleIfChanged = (title: string) => {
        if (
          !useTemplateIconRef.current ||
          lastTitleRef.current === title ||
          typeof maybeSetTitle !== "function"
        ) {
          return Promise.resolve()
        }
        lastTitleRef.current = title
        return maybeSetTitle.call(tray, title)
      }
      const setTemplateIfChanged = (isTemplate: boolean) => {
        if (!useTemplateIconRef.current) return Promise.resolve()
        if (lastTemplateRef.current === isTemplate) return Promise.resolve()
        lastTemplateRef.current = isTemplate
        return tray.setIconAsTemplate(isTemplate)
      }
      const setIconIfChanged = (key: string, icon: Parameters<TrayIcon["setIcon"]>[0]) => {
        if (lastIconKeyRef.current === key) return Promise.resolve()
        lastIconKeyRef.current = key
        return tray.setIcon(icon)
      }
      const setStableTrayIcon = (tooltip: string, title: string) => {
        const gaugePath = trayGaugeIconPathRef.current
        if (!gaugePath) {
          finalizeUpdate()
          return
        }
        void Promise.all([
          setIconIfChanged(`stable:${gaugePath}`, gaugePath),
          setTemplateIfChanged(useTemplateIconRef.current),
          setTitleIfChanged(title),
          setTooltipIfChanged(tooltip),
        ])
          .catch((error) => console.error("Failed to update stable tray icon:", error))
          .finally(finalizeUpdate)
      }

      const currentSettings = pluginSettingsRef.current
      const currentMeta = pluginsMetaRef.current
      const currentStates = pluginStatesRef.current
      if (!currentSettings) {
        setTraySettingsPreview(EMPTY_TRAY_SETTINGS_PREVIEW)
        setStableTrayIcon("UsageBar\nRemaining: –\nReset: Unknown", "–")
        return
      }

      const style = menubarIconStyleRef.current
      const preferredProviderId =
        style !== "bars" && trayProviderSelectionRef.current === "last"
          ? currentMeta.some((plugin) => plugin.id === activeViewRef.current)
            ? activeViewRef.current
            : lastLeftProviderIdRef.current
          : null

      const { state: trayState, preview: nextPreview } = buildTraySettingsPreview({
        pluginsMeta: currentMeta,
        pluginSettings: currentSettings,
        pluginStates: currentStates,
        displayMode: displayModeRef.current,
        preferredProviderId,
      })
      const providerId = trayState.providerId
      setTraySettingsPreview((previous) =>
        isSameTraySettingsPreview(previous, nextPreview) ? previous : nextPreview
      )

      const tooltipText =
        style === "bars"
          ? formatTrayBarsTooltip(nextPreview.bars, currentMeta)
          : formatTrayTooltip(trayState, {
              timeFormatMode: timeFormatModeRef.current,
            })
      const isTemplate = useTemplateIconRef.current
      if (!isTemplate && style !== "provider") {
        const renderBars = style === "donut" ? nextPreview.providerBars : nextPreview.bars
        void renderTrayBarsIcon({
          bars: renderBars,
          sizePx: getTrayIconSizePx(window.devicePixelRatio),
          style,
          providerIconUrl: style === "donut" ? nextPreview.providerIconUrl : undefined,
          foregroundColor: accentColorRef.current,
        })
          .then((image) =>
            Promise.all([
              setIconIfChanged(
                `windows:${style}:${providerId ?? "none"}:${JSON.stringify(renderBars)}:${accentColorRef.current}`,
                image
              ),
              setTooltipIfChanged(tooltipText),
            ])
          )
          .catch((error) => console.error("Failed to render Windows tray bars:", error))
          .finally(finalizeUpdate)
        return
      }

      if (!isTemplate) {
        const scheme = getSystemTrayColorScheme()
        const numberColor =
          trayState.kind === "value"
            ? getTrayNumberColor({
                kind: "value",
                remainingPercentExact: trayState.remainingPercentExact,
                scheme,
              })
            : getTrayNumberColor({ kind: trayState.kind, scheme })
        void renderTrayNumberIcon({
          value:
            trayState.kind === "value"
              ? Math.round(trayState.remainingPercentExact)
              : trayState.kind,
          sizePx: getWindowsTrayIconSizePx(window.devicePixelRatio),
          scheme,
          state: trayState,
        })
          .then((image) =>
            Promise.all([
              setIconIfChanged(
                `number:${getTrayStateValue(trayState)}:${scheme}:${numberColor}`,
                image
              ),
              setTooltipIfChanged(tooltipText),
            ])
          )
          .catch((error) => console.error("Failed to render Windows tray number:", error))
          .finally(finalizeUpdate)
        return
      }

      if (trayState.kind !== "value" || !providerId) {
        setStableTrayIcon(tooltipText, formatTrayNativeTitle(trayState))
        return
      }

      const renderBars =
        style === "provider" || style === "donut" ? nextPreview.providerBars : nextPreview.bars
      void renderTrayBarsIcon({
        bars: renderBars,
        sizePx: getTrayIconSizePx(window.devicePixelRatio),
        style,
        percentText: style === "provider" ? nextPreview.providerPercentText : undefined,
        providerIconUrl: nextPreview.providerIconUrl,
        foregroundColor: TRAY_TEMPLATE_FOREGROUND,
      })
        .then((image) =>
          Promise.all([
            setIconIfChanged(
              `mac:${style}:${providerId}:${trayState.remainingPercentExact}:${nextPreview.providerIconUrl ?? ""}`,
              image
            ),
            setTemplateIfChanged(true),
            setTitleIfChanged(formatTrayNativeTitle(trayState)),
            setTooltipIfChanged(tooltipText),
          ])
        )
        .catch((error) => console.error("Failed to render macOS tray icon:", error))
        .finally(finalizeUpdate)
    }, delayMs)
  }, [])

  const trayInitializedRef = useRef(false)
  useEffect(() => {
    if (trayInitializedRef.current) return
    let cancelled = false

    ;(async () => {
      try {
        const tray = await TrayIcon.getById("tray")
        if (cancelled) return
        trayRef.current = tray
        trayInitializedRef.current = true

        try {
          trayGaugeIconPathRef.current = await resolveResource(
            useTemplateIconRef.current ? "icons/tray-icon.png" : "icons/tray-unknown.png"
          )
        } catch (error) {
          console.error("Failed to resolve tray fallback resource:", error)
        }

        if (cancelled) return
        setTrayReady(true)
      } catch (error) {
        console.error("Failed to load tray icon handle:", error)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!trayReady) return
    if (!pluginSettings) return
    if (pluginsMeta.length === 0) return
    scheduleTrayIconUpdate("init", 0)
  }, [pluginsMeta.length, pluginSettings, scheduleTrayIconUpdate, trayReady])

  useEffect(() => {
    if (!trayReady) return
    scheduleTrayIconUpdate("settings", 0)
  }, [
    menubarIconStyle,
    scheduleTrayIconUpdate,
    activeView,
    trayProviderSelection,
    timeFormatMode,
    trayReady,
  ])

  useEffect(() => {
    return () => {
      if (trayUpdateTimerRef.current !== null) {
        window.clearTimeout(trayUpdateTimerRef.current)
        trayUpdateTimerRef.current = null
      }
      trayUpdatePendingRef.current = false
      trayUpdateQueuedRef.current = false
    }
  }, [])

  return {
    scheduleTrayIconUpdate,
    traySettingsPreview,
  }
}
