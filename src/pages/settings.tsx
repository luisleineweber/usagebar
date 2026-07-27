import { AlertCircle, Blocks, RefreshCw, Settings2 } from "lucide-react"
import { GeneralSettingsPane } from "@/components/settings/general-settings-pane"
import { ProvidersSettingsPane } from "@/components/settings/providers-settings-pane"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import type { SettingsPluginState } from "@/hooks/app/use-settings-plugin-list"
import type { TraySettingsPreview } from "@/lib/tray-preview"
import type { ProviderConfig } from "@/lib/provider-settings"
import type { SelectedProviderChangeOptions } from "@/lib/settings-window"
import type {
  AutoUpdateIntervalMinutes,
  AccentColor,
  DisplayMode,
  GlobalShortcut,
  MenubarIconStyle,
  ResetTimerDisplayMode,
  ThemeMode,
  TimeFormatMode,
  SurfacePin,
} from "@/lib/settings"

interface SettingsPageProps {
  providers: SettingsPluginState[]
  selectedProviderId: string | null
  onSelectedProviderChange: (id: string, options?: SelectedProviderChangeOptions) => void
  settingsTab: "general" | "providers"
  onSettingsTabChange: (value: "general" | "providers") => void
  onToggle: (id: string) => void
  onShow: (id: string) => void
  autoUpdateInterval: AutoUpdateIntervalMinutes
  onAutoUpdateIntervalChange: (value: AutoUpdateIntervalMinutes) => void
  themeMode: ThemeMode
  onThemeModeChange: (value: ThemeMode) => void
  accentColor: AccentColor
  onAccentColorChange: (value: AccentColor) => void
  displayMode: DisplayMode
  onDisplayModeChange: (value: DisplayMode) => void
  resetTimerDisplayMode: ResetTimerDisplayMode
  onResetTimerDisplayModeChange: (value: ResetTimerDisplayMode) => void
  timeFormatMode: TimeFormatMode
  onTimeFormatModeChange: (value: TimeFormatMode) => void
  menubarIconStyle: MenubarIconStyle
  onMenubarIconStyleChange: (value: MenubarIconStyle) => void
  surfacePins: SurfacePin[]
  onSurfacePinsChange: (value: SurfacePin[]) => void
  traySettingsPreview: TraySettingsPreview
  globalShortcut: GlobalShortcut
  onGlobalShortcutChange: (value: GlobalShortcut) => void
  startOnLogin: boolean
  onStartOnLoginChange: (value: boolean) => void
  onProviderConfigChange: (providerId: string, patch: Partial<ProviderConfig>) => Promise<void>
  onProviderSecretSave: (providerId: string, secretKey: string, value: string) => Promise<void>
  onProviderSecretDelete: (providerId: string, secretKey: string) => Promise<void>
  onRetryProvider: (id: string) => void
  providerConfigLoadError: string | null
  onRetryProviderConfigs: () => Promise<void>
}

export function SettingsPage({
  providers,
  selectedProviderId,
  onSelectedProviderChange,
  settingsTab,
  onSettingsTabChange,
  onToggle,
  onShow,
  autoUpdateInterval,
  onAutoUpdateIntervalChange,
  themeMode,
  onThemeModeChange,
  accentColor,
  onAccentColorChange,
  displayMode,
  onDisplayModeChange,
  resetTimerDisplayMode,
  onResetTimerDisplayModeChange,
  timeFormatMode,
  onTimeFormatModeChange,
  menubarIconStyle,
  onMenubarIconStyleChange,
  surfacePins,
  onSurfacePinsChange,
  traySettingsPreview,
  globalShortcut,
  onGlobalShortcutChange,
  startOnLogin,
  onStartOnLoginChange,
  onProviderConfigChange,
  onProviderSecretSave,
  onProviderSecretDelete,
  onRetryProvider,
  providerConfigLoadError,
  onRetryProviderConfigs,
}: SettingsPageProps) {
  return (
    <Tabs
      value={settingsTab}
      className="gap-0"
      onValueChange={(value) => onSettingsTabChange(value as "general" | "providers")}
    >
      {/* Page header: title stacked above underline tabs, left-aligned */}
      <div className="mb-1 pb-0">
        <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <span className="size-2 rounded-full bg-primary" />
          UsageBar
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage providers, refresh schedule, display, and system preferences.
        </p>

        {providerConfigLoadError && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-3 rounded-md border border-destructive/35 bg-destructive/8 px-3 py-3 text-sm"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-foreground">Provider settings unavailable</div>
              <div className="mt-0.5 break-words text-muted-foreground">
                {providerConfigLoadError}
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => void onRetryProviderConfigs()}
            >
              <RefreshCw className="size-3" />
              Retry
            </Button>
          </div>
        )}

        {/* Underline tab bar uses variant="line" so the built-in after: indicator fires on data-active */}
        <TabsList
          variant="line"
          className="mt-4 h-auto w-fit gap-0 rounded-none border-b border-border/55 bg-transparent p-0 pb-0"
        >
          <TabsTrigger value="general" className="gap-2 rounded-none px-4 pb-2.5 pt-0.5 text-sm">
            <Settings2 className="size-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="providers" className="gap-2 rounded-none px-4 pb-2.5 pt-0.5 text-sm">
            <Blocks className="size-4" />
            Providers
          </TabsTrigger>
        </TabsList>
      </div>

      {/* General uses two columns on wide settings windows to avoid a narrow form in empty space. */}
      <TabsContent value="general" className="mt-0 pt-5">
        <GeneralSettingsPane
          autoUpdateInterval={autoUpdateInterval}
          onAutoUpdateIntervalChange={onAutoUpdateIntervalChange}
          themeMode={themeMode}
          onThemeModeChange={onThemeModeChange}
          accentColor={accentColor}
          onAccentColorChange={onAccentColorChange}
          displayMode={displayMode}
          onDisplayModeChange={onDisplayModeChange}
          resetTimerDisplayMode={resetTimerDisplayMode}
          onResetTimerDisplayModeChange={onResetTimerDisplayModeChange}
          timeFormatMode={timeFormatMode}
          onTimeFormatModeChange={onTimeFormatModeChange}
          menubarIconStyle={menubarIconStyle}
          onMenubarIconStyleChange={onMenubarIconStyleChange}
          surfacePins={surfacePins}
          onSurfacePinsChange={onSurfacePinsChange}
          traySettingsPreview={traySettingsPreview}
          plugins={providers.map((provider) => provider.meta)}
          globalShortcut={globalShortcut}
          onGlobalShortcutChange={onGlobalShortcutChange}
          startOnLogin={startOnLogin}
          onStartOnLoginChange={onStartOnLoginChange}
        />
      </TabsContent>

      {/* Providers: full width for two-column layout */}
      <TabsContent value="providers" className="mt-0 pt-5">
        <ProvidersSettingsPane
          providers={providers}
          selectedProviderId={selectedProviderId}
          onSelectedProviderChange={onSelectedProviderChange}
          onToggle={onToggle}
          onShow={onShow}
          onProviderConfigChange={onProviderConfigChange}
          onProviderSecretSave={onProviderSecretSave}
          onProviderSecretDelete={onProviderSecretDelete}
          onRetryProvider={onRetryProvider}
        />
      </TabsContent>
    </Tabs>
  )
}
