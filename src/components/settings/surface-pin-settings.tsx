import { shouldUseTemplateTrayIcon } from "@/hooks/app/use-tray-icon"
import { makeTrayBarsSvg } from "@/lib/tray-bars-icon"
import { useTrayNumberSurface } from "@/hooks/use-taskbar-theme"
import { TASKBAR_BACKGROUND } from "@/lib/taskbar-theme"
import { makeTrayNumberSvg } from "@/lib/tray-number-icon"
import type { TraySettingsPreview } from "@/lib/tray-preview"
import type { AccentColor, MenubarIconStyle } from "@/lib/settings"

const TEMPLATE_PREVIEW_BACKGROUND = "#202124"
// Template icons take the OS tint; on the dark preview surface that tint is white.
const TEMPLATE_PREVIEW_FOREGROUND = "#ffffff"

type SurfacePinSettingsProps = {
  menubarIconStyle: MenubarIconStyle
  accentColor: AccentColor
  preview: TraySettingsPreview
}

export function SurfacePinSettings({
  menubarIconStyle,
  accentColor,
  preview,
}: SurfacePinSettingsProps) {
  const trayBars =
    menubarIconStyle === "provider" || menubarIconStyle === "donut"
      ? preview.providerBars
      : preview.bars
  const useTemplateIcon = shouldUseTemplateTrayIcon()
  // The preview reads the same surface as the real tray icon.
  const taskbarTheme = useTrayNumberSurface()
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
        // Windows draws bars and donut in the raw accent color, like the real tray icon.
        foregroundColor: useTemplateIcon ? TEMPLATE_PREVIEW_FOREGROUND : accentColor,
      })
  const trayPreviewUrl = traySvg ? `data:image/svg+xml,${encodeURIComponent(traySvg)}` : null
  const previewBackground =
    !useTemplateIcon && taskbarTheme
      ? TASKBAR_BACKGROUND[taskbarTheme]
      : TEMPLATE_PREVIEW_BACKGROUND

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
    </div>
  )
}
