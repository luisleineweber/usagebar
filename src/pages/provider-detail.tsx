import { ProviderCard } from "@/components/provider-card"
import type { DisplayPluginState } from "@/hooks/app/use-app-plugin-views"
import type { DisplayMode, ResetTimerDisplayMode } from "@/lib/settings"

interface ProviderDetailPageProps {
  plugin: DisplayPluginState | null
  hasResolvedViews?: boolean
  onRetry?: () => void
  displayMode: DisplayMode
  resetTimerDisplayMode: ResetTimerDisplayMode
  onResetTimerDisplayModeToggle?: () => void
}

export function ProviderDetailPage({
  plugin,
  hasResolvedViews = true,
  onRetry,
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

  return (
    <div className="space-y-3 py-3">
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
        onRetry={onRetry}
        scopeFilter="all"
        displayMode={displayMode}
        resetTimerDisplayMode={resetTimerDisplayMode}
        onResetTimerDisplayModeToggle={onResetTimerDisplayModeToggle}
      />
    </div>
  )
}
