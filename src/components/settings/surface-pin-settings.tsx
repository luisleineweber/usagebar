import { shouldUseTemplateTrayIcon } from "@/hooks/app/use-tray-icon"
import { useSystemTrayColorScheme } from "@/hooks/use-system-tray-color-scheme"
import { makeTrayBarsSvg } from "@/lib/tray-bars-icon"
import { makeTrayNumberSvg, type TrayColorScheme } from "@/lib/tray-number-icon"
import type { TraySettingsPreview } from "@/lib/tray-preview"
import type { AccentColor, MenubarIconStyle } from "@/lib/settings"

// Approximate Windows 11 taskbar surfaces, so the preview matches the real tray contrast.
const TASKBAR_BACKGROUND = {
  dark: "#202124",
  light: "#f3f3f3",
} satisfies Record<TrayColorScheme, string>
const TEMPLATE_TINT = {
  dark: "#ffffff",
  light: "#000000",
} satisfies Record<TrayColorScheme, string>

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
  const scheme = useSystemTrayColorScheme()
  const trayBars =
    menubarIconStyle === "provider" || menubarIconStyle === "donut"
      ? preview.providerBars
      : preview.bars
  const useTemplateIcon = shouldUseTemplateTrayIcon()
  const useWindowsNumberPreview = !useTemplateIcon && menubarIconStyle === "provider"
  const traySvg = useWindowsNumberPreview
    ? makeTrayNumberSvg({
        value:
          preview.state?.kind === "value"
            ? Math.round(preview.state.remainingPercentExact)
            : preview.state?.kind === "error"
              ? "error"
              : "unknown",
        sizePx: 36,
        scheme,
        state: preview.state,
      })
    : makeTrayBarsSvg({
        bars: trayBars,
        sizePx: 36,
        style: menubarIconStyle,
        percentText: menubarIconStyle === "provider" ? preview.providerPercentText : undefined,
        providerIconUrl: preview.providerIconUrl,
        // Windows draws bars and donut in the raw accent color. Template icons take the OS tint.
        foregroundColor: useTemplateIcon ? TEMPLATE_TINT[scheme] : accentColor,
      })
  const trayPreviewUrl = `data:image/svg+xml,${encodeURIComponent(traySvg)}`

  return (
    <div className="rounded-lg bg-muted p-3">
      <p className="text-xs font-medium text-muted-foreground">Live preview</p>
      <div
        data-tray-scheme={scheme}
        className="mt-2 flex min-h-12 items-center justify-center rounded-md px-3"
        style={{ backgroundColor: TASKBAR_BACKGROUND[scheme] }}
      >
        <img src={trayPreviewUrl} alt="Tray icon preview" className="h-9 max-w-full" />
      </div>
    </div>
  )
}
