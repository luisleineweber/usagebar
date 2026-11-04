import { shouldUseTemplateTrayIcon } from "@/hooks/app/use-tray-icon"
import { makeTrayBarsSvg, TRAY_BRAND_FOREGROUND } from "@/lib/tray-bars-icon"
import { useTaskbarTheme } from "@/hooks/use-taskbar-theme"
import { TASKBAR_BACKGROUND } from "@/lib/taskbar-theme"
import { makeTrayNumberSvg } from "@/lib/tray-number-icon"
import type { TraySettingsPreview } from "@/lib/tray-preview"
import type { MenubarIconStyle, TrayProviderSelection } from "@/lib/settings"

type SurfacePinSettingsProps = {
  menubarIconStyle: MenubarIconStyle
  trayProviderSelection: TrayProviderSelection
  preview: TraySettingsPreview
}

export function SurfacePinSettings({
  menubarIconStyle,
  trayProviderSelection,
  preview,
}: SurfacePinSettingsProps) {
  const trayBars =
    menubarIconStyle === "provider" || menubarIconStyle === "donut"
      ? preview.providerBars
      : preview.bars
  const useTemplateIcon = shouldUseTemplateTrayIcon()
  // The preview reads the same taskbar theme as the real tray icon.
  const taskbarTheme = useTaskbarTheme(!useTemplateIcon)
  const useWindowsNumberPreview = !useTemplateIcon && menubarIconStyle === "provider"
  const traySvg = useWindowsNumberPreview
    ? taskbarTheme &&
      makeTrayNumberSvg({
        value:
          preview.state?.kind === "value"
            ? Math.round(preview.state.remainingPercentExact)
            : preview.state?.kind === "error"
              ? "error"
              : "unknown",
        sizePx: 36,
        taskbarTheme,
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
  const trayPreviewUrl = traySvg ? `data:image/svg+xml,${encodeURIComponent(traySvg)}` : null
  const previewBackground =
    !useTemplateIcon && taskbarTheme ? TASKBAR_BACKGROUND[taskbarTheme] : "#202124"
  const explanation =
    menubarIconStyle === "bars"
      ? "Stacked bars show the first four providers."
      : trayProviderSelection === "first"
        ? "Always shows the first enabled provider in your saved order."
        : "Starts with the first provider. After you leave a provider, Dashboard and History show that latest provider until you leave another one. This resets after restart."

  return (
    <div className="rounded-lg bg-muted p-3">
      <p className="text-xs font-medium text-muted-foreground">Live preview</p>
      <div
        data-taskbar-theme={useTemplateIcon ? undefined : (taskbarTheme ?? undefined)}
        className="mt-2 flex min-h-12 items-center justify-center rounded-md px-3"
        style={{ backgroundColor: previewBackground }}
      >
        {trayPreviewUrl && (
          <img src={trayPreviewUrl} alt="Tray icon preview" className="h-9 max-w-full" />
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{explanation}</p>
    </div>
  )
}
