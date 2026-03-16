import { Button } from "@/components/ui/button"
import { ProviderCard } from "@/components/provider-card"
import type { DisplayPluginState } from "@/hooks/app/use-app-plugin-views"
import type { DisplayMode, ResetTimerDisplayMode } from "@/lib/settings"

interface ProviderDetailPageProps {
  plugin: DisplayPluginState | null
  onRetry?: () => void
  onOpenProviderSettings?: (providerId: string) => void
  displayMode: DisplayMode
  resetTimerDisplayMode: ResetTimerDisplayMode
  onResetTimerDisplayModeToggle?: () => void
}

export function ProviderDetailPage({
  plugin,
  onRetry,
  onOpenProviderSettings,
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
      <section className="rounded-xl border border-border/70 bg-muted/35 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold tracking-[0.02em]">Provider settings</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Provider settings open in a separate settings window so the tray popup stays focused on usage.
            </p>
          </div>
          {onOpenProviderSettings && (
            <Button type="button" size="sm" onClick={() => onOpenProviderSettings(plugin.meta.id)}>
              Manage provider
            </Button>
          )}
        </div>
      </section>
    </div>
  )
}
