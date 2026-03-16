import { Blocks, Settings2 } from "lucide-react"
import { GeneralSettingsPane } from "@/components/settings/general-settings-pane"
import { ProvidersSettingsPane, type ProviderSelectionOptions } from "@/components/settings/providers-settings-pane"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { SettingsPluginState } from "@/hooks/app/use-settings-plugin-list"
import type { TraySettingsPreview } from "@/hooks/app/use-tray-icon"
import type { ProviderConfig } from "@/lib/provider-settings"
import type {
  AutoUpdateIntervalMinutes,
  DisplayMode,
  GlobalShortcut,
  MenubarIconStyle,
  ResetTimerDisplayMode,
  ThemeMode,
} from "@/lib/settings"

interface SettingsPageProps {
  providers: SettingsPluginState[]
  selectedProviderId: string | null
  onSelectedProviderChange: (id: string, options?: ProviderSelectionOptions) => void
  settingsTab: "general" | "providers"
  onSettingsTabChange: (value: "general" | "providers") => void
  onReorder: (orderedIds: string[]) => void
  onToggle: (id: string) => void
  autoUpdateInterval: AutoUpdateIntervalMinutes
  onAutoUpdateIntervalChange: (value: AutoUpdateIntervalMinutes) => void
  themeMode: ThemeMode
  onThemeModeChange: (value: ThemeMode) => void
  displayMode: DisplayMode
  onDisplayModeChange: (value: DisplayMode) => void
  resetTimerDisplayMode: ResetTimerDisplayMode
  onResetTimerDisplayModeChange: (value: ResetTimerDisplayMode) => void
  menubarIconStyle: MenubarIconStyle
  onMenubarIconStyleChange: (value: MenubarIconStyle) => void
  traySettingsPreview: TraySettingsPreview
  globalShortcut: GlobalShortcut
  onGlobalShortcutChange: (value: GlobalShortcut) => void
  startOnLogin: boolean
  onStartOnLoginChange: (value: boolean) => void
  onProviderConfigChange: (providerId: string, patch: Partial<ProviderConfig>) => Promise<void>
  onProviderSecretSave: (providerId: string, secretKey: string, value: string) => Promise<void>
  onProviderSecretDelete: (providerId: string, secretKey: string) => Promise<void>
  onRetryProvider: (id: string) => void
}

export function SettingsPage({
  providers,
  selectedProviderId,
  onSelectedProviderChange,
  settingsTab,
  onSettingsTabChange,
  onReorder,
  onToggle,
  autoUpdateInterval,
  onAutoUpdateIntervalChange,
  themeMode,
  onThemeModeChange,
  displayMode,
  onDisplayModeChange,
  resetTimerDisplayMode,
  onResetTimerDisplayModeChange,
  menubarIconStyle,
  onMenubarIconStyleChange,
  traySettingsPreview,
  globalShortcut,
  onGlobalShortcutChange,
  startOnLogin,
  onStartOnLoginChange,
  onProviderConfigChange,
  onProviderSecretSave,
  onProviderSecretDelete,
  onRetryProvider,
}: SettingsPageProps) {
  const isProvidersTab = settingsTab === "providers"

  return (
    <Tabs
      value={settingsTab}
      className="gap-5"
      onValueChange={(value) => onSettingsTabChange(value as "general" | "providers")}
    >
      <div className="shrink-0 rounded-[26px] border border-border/60 bg-card/95 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.16)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/75 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <span className="size-2 rounded-full bg-primary" />
              UsageBar
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-[0.01em]">Settings</h1>
              <p className="text-sm text-muted-foreground">
                {isProvidersTab
                  ? "Desktop provider management in a dedicated window."
                  : "General app preferences for refresh, display, and startup."}
              </p>
            </div>
          </div>

          <div className="flex min-w-[240px] flex-1 justify-start md:justify-end">
            <TabsList variant="default" className="h-auto gap-1 rounded-2xl border border-border/70 bg-background/80 p-1.5">
              <TabsTrigger value="general" className="gap-2 rounded-xl px-4 py-2.5">
                <Settings2 className="size-4" />
                General
              </TabsTrigger>
              <TabsTrigger value="providers" className="gap-2 rounded-xl px-4 py-2.5">
                <Blocks className="size-4" />
                Providers
              </TabsTrigger>
            </TabsList>
          </div>
        </div>
      </div>

      <TabsContent value="general" className="mt-0">
        <GeneralSettingsPane
          autoUpdateInterval={autoUpdateInterval}
          onAutoUpdateIntervalChange={onAutoUpdateIntervalChange}
          themeMode={themeMode}
          onThemeModeChange={onThemeModeChange}
          displayMode={displayMode}
          onDisplayModeChange={onDisplayModeChange}
          resetTimerDisplayMode={resetTimerDisplayMode}
          onResetTimerDisplayModeChange={onResetTimerDisplayModeChange}
          menubarIconStyle={menubarIconStyle}
          onMenubarIconStyleChange={onMenubarIconStyleChange}
          traySettingsPreview={traySettingsPreview}
          globalShortcut={globalShortcut}
          onGlobalShortcutChange={onGlobalShortcutChange}
          startOnLogin={startOnLogin}
          onStartOnLoginChange={onStartOnLoginChange}
        />
      </TabsContent>

      <TabsContent value="providers" className="mt-0">
        <ProvidersSettingsPane
          providers={providers}
          selectedProviderId={selectedProviderId}
          onSelectedProviderChange={onSelectedProviderChange}
          onReorder={onReorder}
          onToggle={onToggle}
          onProviderConfigChange={onProviderConfigChange}
          onProviderSecretSave={onProviderSecretSave}
          onProviderSecretDelete={onProviderSecretDelete}
          onRetryProvider={onRetryProvider}
        />
      </TabsContent>
    </Tabs>
  )
}
