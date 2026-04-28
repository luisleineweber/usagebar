import { Button } from "@/components/ui/button"
import { ProviderCard } from "@/components/provider-card"
import type { DisplayPluginState } from "@/hooks/app/use-app-plugin-views"
import type { DisplayMode, ResetTimerDisplayMode } from "@/lib/settings"

interface ProviderDetailPageProps {
  plugin: DisplayPluginState | null
  hasResolvedViews?: boolean
  onRetry?: () => void
  onOpenProviderSettings?: (providerId: string) => void
  displayMode: DisplayMode
  resetTimerDisplayMode: ResetTimerDisplayMode
  onResetTimerDisplayModeToggle?: () => void
}

export function ProviderDetailPage({
  plugin,
  hasResolvedViews = true,
  onRetry,
  onOpenProviderSettings,
  displayMode,
  resetTimerDisplayMode,
  onResetTimerDisplayModeToggle,
}: ProviderDetailPageProps) {
  if (!plugin) {
    if (!hasResolvedViews) {
      return (
        <div className="space-y-3 py-3">
          <ProviderCard
            name="Loading provider"
            loading
            lines={[]}
            skeletonLines={[]}
            showSeparator={false}
            scopeFilter="all"
            displayMode={displayMode}
            resetTimerDisplayMode={resetTimerDisplayMode}
            onResetTimerDisplayModeToggle={onResetTimerDisplayModeToggle}
          />
        </div>
      )
    }

    return (
      <div className="text-center text-muted-foreground py-8">
        Provider not found
      </div>
    )
  }

  const hasRuntimeData = Boolean(plugin.data || plugin.lastSettledData)

  return (
    <div className="space-y-3 py-3">
      {!hasRuntimeData && onOpenProviderSettings && (
        <section className="rounded-lg border border-border/80 bg-muted/40 px-3 py-3">
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Provider settings</h3>
            <p className="text-sm text-muted-foreground">
              Manage connection details and setup in the standalone Settings window.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenProviderSettings(plugin.meta.id)}
            >
              Manage provider
            </Button>
          </div>
        </section>
      )}
      <ProviderCard
        name={plugin.meta.name}
        plan={plugin.data?.plan ?? plugin.lastSettledData?.plan}
        links={plugin.meta.links}
        showSeparator={false}
        loading={plugin.loading}
        error={plugin.error}
        lines={plugin.data?.lines ?? plugin.lastSettledData?.lines ?? []}
        skeletonLines={plugin.meta.lines}
        lastManualRefreshAt={plugin.lastManualRefreshAt}
        lastUpdatedAt={plugin.lastSuccessAt}
        status={plugin.status}
        onRetry={onRetry}
        scopeFilter="all"
        displayMode={displayMode}
        resetTimerDisplayMode={resetTimerDisplayMode}
        onResetTimerDisplayModeToggle={onResetTimerDisplayModeToggle}
      />
    </div>
  )
}
