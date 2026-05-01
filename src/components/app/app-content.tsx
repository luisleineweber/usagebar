import { useEffect, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { OverviewPage } from "@/pages/overview"
import { ProviderDetailPage } from "@/pages/provider-detail"
import type { DisplayPluginState } from "@/hooks/app/use-app-plugin-views"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { useAppUiStore } from "@/stores/app-ui-store"
import type { ProviderConfig } from "@/lib/provider-settings"
import type {
  AutoUpdateIntervalMinutes,
  DisplayMode,
  GlobalShortcut,
  ResetTimerDisplayMode,
  ThemeMode,
} from "@/lib/settings"

type AppContentDerivedProps = {
  displayPlugins: DisplayPluginState[]
  selectedPlugin: DisplayPluginState | null
  resolvedSelectedPlugin: DisplayPluginState | null
  hasResolvedViews: boolean
  isPanelResizing?: boolean
}

export type AppContentActionProps = {
  onRetryPlugin: (id: string) => void
  onReorder: (orderedIds: string[]) => void
  onToggle: (id: string) => void
  onProviderConfigChange: (providerId: string, patch: Partial<ProviderConfig>) => Promise<void>
  onProviderSecretSave: (providerId: string, secretKey: string, value: string) => Promise<void>
  onProviderSecretDelete: (providerId: string, secretKey: string) => Promise<void>
  onAutoUpdateIntervalChange: (value: AutoUpdateIntervalMinutes) => void
  onThemeModeChange: (mode: ThemeMode) => void
  onDisplayModeChange: (mode: DisplayMode) => void
  onResetTimerDisplayModeChange: (mode: ResetTimerDisplayMode) => void
  onResetTimerDisplayModeToggle: () => void
  onGlobalShortcutChange: (value: GlobalShortcut) => void
  onStartOnLoginChange: (value: boolean) => void
}

export type AppContentProps = AppContentDerivedProps & AppContentActionProps
  & {
    onOpenProviderSettings?: (providerId: string) => void
  }

export function AppContent({
  displayPlugins,
  selectedPlugin,
  resolvedSelectedPlugin,
  hasResolvedViews,
  isPanelResizing = false,
  onRetryPlugin,
  onResetTimerDisplayModeToggle,
  onOpenProviderSettings,
}: AppContentProps) {
  const {
    activeView,
  } = useAppUiStore(
    useShallow((state) => ({
      activeView: state.activeView,
    }))
  )

  const {
    displayMode,
    resetTimerDisplayMode,
  } = useAppPreferencesStore(
    useShallow((state) => ({
      displayMode: state.displayMode,
      resetTimerDisplayMode: state.resetTimerDisplayMode,
    }))
  )
  const [transitionKey, setTransitionKey] = useState(activeView)
  const [isTransitioning, setIsTransitioning] = useState(false)

  useEffect(() => {
    if (transitionKey === activeView) return
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTransitionKey(activeView)
      setIsTransitioning(false)
      return
    }

    setTransitionKey(activeView)
    setIsTransitioning(true)
    const timeoutId = window.setTimeout(() => {
      setIsTransitioning(false)
    }, 120)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [activeView, transitionKey])

  const retryPlugin = selectedPlugin ?? resolvedSelectedPlugin
  const handleRetry = retryPlugin
    && retryPlugin.meta.supportState !== "comingSoonOnWindows"
    ? () => onRetryPlugin(retryPlugin.meta.id)
    : /* v8 ignore next */ undefined

  const content =
    activeView === "home" ? (
      <OverviewPage
        plugins={displayPlugins}
        onRetryPlugin={onRetryPlugin}
        displayMode={displayMode}
        resetTimerDisplayMode={resetTimerDisplayMode}
        onResetTimerDisplayModeToggle={onResetTimerDisplayModeToggle}
      />
    ) : (
      <ProviderDetailPage
        plugin={resolvedSelectedPlugin}
        hasResolvedViews={hasResolvedViews}
        onRetry={handleRetry}
        onOpenProviderSettings={onOpenProviderSettings}
        displayMode={displayMode}
        resetTimerDisplayMode={resetTimerDisplayMode}
        onResetTimerDisplayModeToggle={onResetTimerDisplayModeToggle}
      />
    )

  return (
    <div
      key={transitionKey}
      className={[
        "transition-[opacity,transform] duration-120 ease-out motion-reduce:transition-none",
        isTransitioning || isPanelResizing ? "opacity-95 translate-y-[1px]" : "opacity-100 translate-y-0",
      ].join(" ")}
    >
      {content}
    </div>
  )
}
