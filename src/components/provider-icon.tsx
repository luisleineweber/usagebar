import type { PluginIconColorMode } from "@/lib/plugin-types"
import { getProviderIconColor } from "@/lib/provider-icon"
import { cn } from "@/lib/utils"
import { useDarkMode } from "@/hooks/use-dark-mode"

type ProviderIconProps = {
  iconUrl: string
  darkIconUrl?: string
  iconColorMode?: PluginIconColorMode
  brandColor?: string
  isDark?: boolean
  className: string
  label?: string
  title?: string
  ariaHidden?: boolean
  testId?: string
}

export function ProviderIcon({
  iconUrl,
  darkIconUrl,
  iconColorMode = "monochrome",
  brandColor,
  isDark,
  className,
  label,
  title,
  ariaHidden = false,
  testId,
}: ProviderIconProps) {
  const appIsDark = useDarkMode()
  const resolvedIsDark = isDark ?? appIsDark
  const classes = cn("inline-block shrink-0 object-contain", className)

  if (iconColorMode === "multicolor") {
    return (
      <img
        src={resolvedIsDark && darkIconUrl ? darkIconUrl : iconUrl}
        alt={ariaHidden ? "" : label}
        aria-hidden={ariaHidden || undefined}
        title={title}
        data-testid={testId}
        className={classes}
      />
    )
  }

  return (
    <span
      role={ariaHidden ? undefined : "img"}
      aria-label={ariaHidden ? undefined : label}
      aria-hidden={ariaHidden || undefined}
      title={title}
      data-testid={testId}
      className={classes}
      style={{
        backgroundColor: getProviderIconColor(brandColor, resolvedIsDark),
        WebkitMaskImage: `url(${iconUrl})`,
        WebkitMaskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskImage: `url(${iconUrl})`,
        maskSize: "contain",
        maskRepeat: "no-repeat",
        maskPosition: "center",
      }}
    />
  )
}
