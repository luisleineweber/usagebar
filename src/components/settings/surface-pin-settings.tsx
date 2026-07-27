import { makeTrayBarsSvg, TRAY_BRAND_FOREGROUND } from "@/lib/tray-bars-icon"
import { shouldUseTemplateTrayIcon } from "@/hooks/app/use-tray-icon"
import { makeTrayNumberSvg } from "@/lib/tray-number-icon"
import type { TraySettingsPreview } from "@/lib/tray-preview"
import type { PluginMeta } from "@/lib/plugin-types"
import { MAX_SURFACE_PINS, type MenubarIconStyle, type SurfacePin } from "@/lib/settings"
import { cn } from "@/lib/utils"

type PinCandidate = {
  providerId: string
  providerName: string
  metricLabel: string
}

type SurfacePinSettingsProps = {
  plugins: PluginMeta[]
  pins: SurfacePin[]
  onPinsChange: (pins: SurfacePin[]) => void
  menubarIconStyle: MenubarIconStyle
  preview: TraySettingsPreview
}

function getPinKey(pin: Pick<SurfacePin, "providerId" | "metricLabel">): string {
  return JSON.stringify([pin.providerId, pin.metricLabel])
}

function formatPercent(fraction: number | undefined): string {
  return typeof fraction === "number" ? `${Math.round(fraction * 100)}%` : "–"
}

export function SurfacePinSettings({
  plugins,
  pins,
  onPinsChange,
  menubarIconStyle,
  preview,
}: SurfacePinSettingsProps) {
  const candidates: PinCandidate[] = plugins.flatMap((plugin) =>
    plugin.lines
      .filter((line) => line.type === "progress")
      .map((line) => ({
        providerId: plugin.id,
        providerName: plugin.name,
        metricLabel: line.label,
      }))
  )
  const slots = Array.from({ length: MAX_SURFACE_PINS }, (_, index) => pins[index])
  const selectedKeys = new Set(pins.map(getPinKey))
  const trayBars =
    menubarIconStyle === "provider" || menubarIconStyle === "donut"
      ? preview.providerBars
      : preview.bars
  const useWindowsNumberPreview = !shouldUseTemplateTrayIcon() && menubarIconStyle === "provider"
  const traySvg = useWindowsNumberPreview
    ? makeTrayNumberSvg({
        value:
          preview.state?.kind === "value"
            ? Math.round(preview.state.remainingPercentExact)
            : preview.state?.kind === "error"
              ? "error"
              : "unknown",
        sizePx: 36,
        scheme: "dark",
        state: preview.state,
      })
    : makeTrayBarsSvg({
        bars: trayBars,
        sizePx: 36,
        style: menubarIconStyle,
        percentText: menubarIconStyle === "provider" ? preview.providerPercentText : undefined,
        providerIconUrl: preview.providerIconUrl,
        foregroundColor: TRAY_BRAND_FOREGROUND,
      })
  const trayPreviewUrl = `data:image/svg+xml,${encodeURIComponent(traySvg)}`
  const previewBarsById = new Map(preview.bars.map((bar) => [bar.id, bar]))

  const updatePin = (index: number, key: string) => {
    if (!key) {
      onPinsChange(pins.filter((_, pinIndex) => pinIndex !== index))
      return
    }
    const candidate = candidates.find((item) => getPinKey(item) === key)
    if (!candidate) return
    const next = [...pins]
    next[index] = {
      providerId: candidate.providerId,
      metricLabel: candidate.metricLabel,
      presentation: next[index]?.presentation ?? "bar",
    }
    onPinsChange(next.slice(0, MAX_SURFACE_PINS))
  }

  const updatePresentation = (index: number, presentation: SurfacePin["presentation"]) => {
    const pin = pins[index]
    if (!pin) return
    const next = [...pins]
    next[index] = { ...pin, presentation }
    onPinsChange(next)
  }

  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
      <div className="space-y-3">
        {slots.map((pin, index) => {
          const selectedKey = pin ? getPinKey(pin) : ""
          return (
            <div key={index} className="space-y-2">
              <label className="block text-xs font-medium" htmlFor={`surface-pin-${index}`}>
                Metric {index + 1}
              </label>
              <select
                id={`surface-pin-${index}`}
                value={selectedKey}
                className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                onChange={(event) => updatePin(index, event.target.value)}
              >
                <option value="">{pin ? "Remove metric" : "No metric"}</option>
                {candidates.map((candidate) => {
                  const key = getPinKey(candidate)
                  return (
                    <option
                      key={key}
                      value={key}
                      disabled={selectedKeys.has(key) && key !== selectedKey}
                    >
                      {candidate.providerName}: {candidate.metricLabel}
                    </option>
                  )
                })}
              </select>
              {pin ? (
                <div
                  className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1"
                  role="radiogroup"
                  aria-label={`Metric ${index + 1} presentation`}
                >
                  {(["bar", "text"] as const).map((presentation) => {
                    const active = pin.presentation === presentation
                    return (
                      <button
                        key={presentation}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        className={cn(
                          "h-7 rounded-sm px-2 text-xs font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
                          active
                            ? "bg-background text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                        onClick={() => updatePresentation(index, presentation)}
                      >
                        {presentation === "bar" ? "Bar" : "Text"}
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )
        })}
        {candidates.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Enable a provider with progress metrics to add pins.
          </p>
        ) : null}
      </div>

      <div className="rounded-lg bg-muted p-3">
        <p className="text-xs font-medium text-muted-foreground">Live preview</p>
        <div className="mt-2 flex min-h-12 items-center justify-center rounded-md bg-[#202124] px-3">
          <img src={trayPreviewUrl} alt="Tray icon preview" className="h-9 max-w-full" />
        </div>
        <div className="mt-3 space-y-2" aria-label="Pinned metric widget preview">
          {pins.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Pins appear here and in multi-bar tray styles.
            </p>
          ) : (
            pins.map((pin) => {
              const bar = previewBarsById.get(`${pin.providerId}:${pin.metricLabel}`)
              const percent = formatPercent(bar?.fraction)
              return (
                <div key={getPinKey(pin)} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{pin.metricLabel}</span>
                    <span className="tabular-nums text-muted-foreground">{percent}</span>
                  </div>
                  {pin.presentation === "bar" ? (
                    <div
                      className="mt-1 h-1.5 overflow-hidden rounded-full bg-background"
                      role="progressbar"
                      aria-label={`${pin.metricLabel} preview`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={
                        typeof bar?.fraction === "number"
                          ? Math.round(bar.fraction * 100)
                          : undefined
                      }
                    >
                      <div
                        className="h-full rounded-full bg-foreground"
                        style={{ width: `${Math.round((bar?.fraction ?? 0) * 100)}%` }}
                      />
                    </div>
                  ) : null}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
