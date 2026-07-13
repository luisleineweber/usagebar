import type { DisplayPluginState } from "@/hooks/app/use-app-plugin-views"
import type { DisplayMode, SurfacePin } from "@/lib/settings"

type SurfacePinWidgetProps = {
  pins: readonly SurfacePin[]
  plugins: readonly DisplayPluginState[]
  displayMode: DisplayMode
}

type ResolvedPin = {
  pin: SurfacePin
  providerName: string
  percent: number | null
}

export function resolveSurfacePins({
  pins,
  plugins,
  displayMode,
}: SurfacePinWidgetProps): ResolvedPin[] {
  const pluginsById = new Map(plugins.map((plugin) => [plugin.meta.id, plugin]))

  return pins.flatMap((pin) => {
    const plugin = pluginsById.get(pin.providerId)
    if (!plugin) return []
    const lines = plugin.data?.lines ?? plugin.lastSettledData?.lines ?? []
    const line = lines.find(
      (candidate) => candidate.type === "progress" && candidate.label === pin.metricLabel
    )
    const fraction =
      line && line.type === "progress" && line.limit > 0
        ? (displayMode === "used" ? line.used : line.limit - line.used) / line.limit
        : null
    const percent = fraction === null ? null : Math.round(Math.max(0, Math.min(1, fraction)) * 100)
    return [{ pin, providerName: plugin.meta.name, percent }]
  })
}

export function SurfacePinWidget(props: SurfacePinWidgetProps) {
  const resolvedPins = resolveSurfacePins(props)
  if (resolvedPins.length === 0) return null

  return (
    <section className="border-b border-border/55 px-3 py-2.5" aria-label="Pinned metrics">
      <div className="grid gap-2 sm:grid-cols-2">
        {resolvedPins.map(({ pin, providerName, percent }) => {
          const value = percent === null ? "--%" : `${percent}%`
          return (
            <div key={`${pin.providerId}:${pin.metricLabel}`} className="min-w-0">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-medium">
                  {providerName}: {pin.metricLabel}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{value}</span>
              </div>
              {pin.presentation === "bar" ? (
                <div
                  className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label={`${providerName} ${pin.metricLabel}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent ?? undefined}
                >
                  <div
                    className="h-full rounded-full bg-foreground"
                    style={{ width: `${percent ?? 0}%` }}
                  />
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
