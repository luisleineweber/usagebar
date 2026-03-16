import { useShallow } from "zustand/react/shallow"
import { OverviewPage } from "@/pages/overview"
import { ProviderDetailPage } from "@/pages/provider-detail"
import type { DisplayPluginState } from "@/hooks/app/use-app-plugin-views"
import type { TraySettingsPreview } from "@/hooks/app/use-tray-icon"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { useAppUiStore } from "@/stores/app-ui-store"
import type { ProviderConfig } from "@/lib/provider-settings"
import { openSettingsWindow } from "@/lib/settings-window"
import type {
  AutoUpdateIntervalMinutes,
  DisplayMode,
  GlobalShortcut,
  MenubarIconStyle,
  ResetTimerDisplayMode,
  ThemeMode,
} from "@/lib/settings"

type AppContentDerivedProps = {
  displayPlugins: DisplayPluginState[]
  selectedPlugin: DisplayPluginState | null
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
  onMenubarIconStyleChange: (value: MenubarIconStyle) => void
  traySettingsPreview: TraySettingsPreview
  onGlobalShortcutChange: (value: GlobalShortcut) => void
  onStartOnLoginChange: (value: boolean) => void
}

export type AppContentProps = AppContentDerivedProps & AppContentActionProps

export function AppContent({
  displayPlugins,
  selectedPlugin,
  onRetryPlugin,
  onResetTimerDisplayModeToggle,
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

  if (activeView === "home") {
    return (
      <OverviewPage
        plugins={displayPlugins}
        onRetryPlugin={onRetryPlugin}
        displayMode={displayMode}
        resetTimerDisplayMode={resetTimerDisplayMode}
        onResetTimerDisplayModeToggle={onResetTimerDisplayModeToggle}
      />
    )
  }

  const handleRetry = selectedPlugin
    && selectedPlugin.meta.supportState !== "comingSoonOnWindows"
    ? () => onRetryPlugin(selectedPlugin.meta.id)
    : /* v8 ignore next */ undefined

  return (
    <ProviderDetailPage
      plugin={selectedPlugin}
      onRetry={handleRetry}
      onOpenProviderSettings={(providerId) => {
        void openSettingsWindow({ tab: "providers", providerId }).catch(console.error)
      }}
      displayMode={displayMode}
      resetTimerDisplayMode={resetTimerDisplayMode}
      onResetTimerDisplayModeToggle={onResetTimerDisplayModeToggle}
    />
  )
}
