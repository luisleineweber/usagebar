import { ProviderCard } from "@/components/provider-card"
import { ProviderSetupPanel } from "@/components/provider-setup-panel"
import type { PluginState } from "@/hooks/app/types"
import type { DisplayPluginState } from "@/hooks/app/use-app-plugin-views"
import type { ProviderConfig } from "@/lib/provider-settings"
import type { DisplayMode, ResetTimerDisplayMode } from "@/lib/settings"

interface ProviderDetailPageProps {
  plugin: DisplayPluginState | null
  providerConfig?: ProviderConfig
  providerState?: PluginState
  onRetry?: () => void
  onProviderConfigChange?: (providerId: string, patch: Partial<ProviderConfig>) => Promise<void>
  onProviderSecretSave?: (providerId: string, secretKey: string, value: string) => Promise<void>
  onProviderSecretDelete?: (providerId: string, secretKey: string) => Promise<void>
  displayMode: DisplayMode
  resetTimerDisplayMode: ResetTimerDisplayMode
  onResetTimerDisplayModeToggle?: () => void
}

export function ProviderDetailPage({
  plugin,
  providerConfig,
  providerState,
  onRetry,
  onProviderConfigChange,
  onProviderSecretSave,
  onProviderSecretDelete,
  displayMode,
  resetTimerDisplayMode,
  onResetTimerDisplayModeToggle,
}: ProviderDetailPageProps) {
  if (!plugin) {
    return (
      <div className="text-center text-muted-foreground py-8">
        Provider not found
      </div>
    )
  }

  return (
    <div className="space-y-3 py-3">
      <ProviderCard
        name={plugin.meta.name}
        plan={plugin.data?.plan}
        links={plugin.meta.links}
        showSeparator={false}
        loading={plugin.loading}
        error={plugin.error}
        lines={plugin.data?.lines ?? []}
        skeletonLines={plugin.meta.lines}
        lastManualRefreshAt={plugin.lastManualRefreshAt}
        onRetry={onRetry}
        scopeFilter="all"
        displayMode={displayMode}
        resetTimerDisplayMode={resetTimerDisplayMode}
        onResetTimerDisplayModeToggle={onResetTimerDisplayModeToggle}
      />
      <ProviderSetupPanel
        plugin={plugin.meta}
        config={providerConfig}
        state={providerState}
        onRetry={onRetry}
        onConfigChange={onProviderConfigChange}
        onSecretSave={onProviderSecretSave}
        onSecretDelete={onProviderSecretDelete}
      />
    </div>
  )
}
