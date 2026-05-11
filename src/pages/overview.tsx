import { ProviderCard } from "@/components/provider-card";
import { Button } from "@/components/ui/button";
import type { DisplayPluginState } from "@/hooks/app/use-app-plugin-views";
import type { DisplayMode, ResetTimerDisplayMode } from "@/lib/settings";
import { openSettingsWindow } from "@/lib/settings-window";

interface OverviewPageProps {
  plugins: DisplayPluginState[];
  onRetryPlugin?: (pluginId: string) => void;
  displayMode: DisplayMode;
  resetTimerDisplayMode: ResetTimerDisplayMode;
  onResetTimerDisplayModeToggle?: () => void;
}

export function OverviewPage({
  plugins,
  onRetryPlugin,
  displayMode,
  resetTimerDisplayMode,
  onResetTimerDisplayModeToggle,
}: OverviewPageProps) {
  if (plugins.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
        <p className="text-sm text-muted-foreground">
          No active providers yet.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            openSettingsWindow({ tab: "providers" }).catch(console.error);
          }}
        >
          Set up a provider
        </Button>
      </div>
    );
  }

  return (
    <div>
      {plugins.map((plugin, index) => (
        <ProviderCard
          key={plugin.meta.id}
          name={plugin.meta.name}
          plan={plugin.data?.plan ?? plugin.lastSettledData?.plan}
          showSeparator={index < plugins.length - 1}
          loading={plugin.loading}
          error={plugin.error}
          lines={plugin.data?.lines ?? plugin.lastSettledData?.lines ?? []}
          skeletonLines={plugin.meta.lines}
          lastManualRefreshAt={plugin.lastManualRefreshAt}
          lastUpdatedAt={plugin.lastSuccessAt}
          status={plugin.status}
          onRetry={
            onRetryPlugin ? () => onRetryPlugin(plugin.meta.id) : undefined
          }
          scopeFilter="overview"
          displayMode={displayMode}
          resetTimerDisplayMode={resetTimerDisplayMode}
          onResetTimerDisplayModeToggle={onResetTimerDisplayModeToggle}
        />
      ))}
    </div>
  );
}
