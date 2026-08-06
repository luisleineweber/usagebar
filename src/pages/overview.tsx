import { ProviderCard } from "@/components/provider-card"
import { SurfacePinWidget } from "@/components/surface-pin-widget"
import { Button } from "@/components/ui/button"
import type { DisplayPluginState } from "@/hooks/app/use-app-plugin-views"
import type { DisplayMode, ResetTimerDisplayMode, SurfacePin, TimeFormatMode } from "@/lib/settings"
import { openSettingsWindow } from "@/lib/settings-window"

interface OverviewPageProps {
  plugins: DisplayPluginState[]
  onRetryPlugin?: (pluginId: string) => void
  displayMode: DisplayMode
  resetTimerDisplayMode: ResetTimerDisplayMode
  timeFormatMode?: TimeFormatMode
  onResetTimerDisplayModeToggle?: () => void
  surfacePins?: SurfacePin[]
}

export function OverviewPage({
  plugins,
  onRetryPlugin,
  displayMode,
  resetTimerDisplayMode,
  timeFormatMode,
  onResetTimerDisplayModeToggle,
  surfacePins = [],
}: OverviewPageProps) {
  if (plugins.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
        <p className="text-sm text-muted-foreground">No active providers yet.</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            openSettingsWindow({ tab: "providers" }).catch(console.error)
          }}
        >
          Set up a provider
        </Button>
      </div>
    )
  }

  return (
    <div>
      <SurfacePinWidget pins={surfacePins} plugins={plugins} displayMode={displayMode} />
      {plugins.map((plugin, index) => (
        <ProviderCard
          key={plugin.meta.id}
          name={plugin.meta.name}
          iconUrl={plugin.meta.iconUrl}
          iconColorMode={plugin.meta.iconColorMode}
          plan={plugin.data?.plan ?? plugin.lastSettledData?.plan ?? plugin.meta.defaultPlan}
          showSeparator={index < plugins.length - 1}
          loading={plugin.loading}
          error={plugin.error}
          errorCategory={plugin.errorCategory}
          lines={plugin.data?.lines ?? plugin.lastSettledData?.lines ?? []}
          skeletonLines={plugin.meta.lines}
          lastManualRefreshAt={plugin.lastManualRefreshAt}
          lastUpdatedAt={plugin.lastSuccessAt}
          status={plugin.status}
          onRetry={onRetryPlugin ? () => onRetryPlugin(plugin.meta.id) : undefined}
          scopeFilter="overview"
          displayMode={displayMode}
          resetTimerDisplayMode={resetTimerDisplayMode}
          timeFormatMode={timeFormatMode}
          onResetTimerDisplayModeToggle={onResetTimerDisplayModeToggle}
        />
      ))}
    </div>
  )
}
