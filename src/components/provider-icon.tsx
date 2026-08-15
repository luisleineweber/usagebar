import type { PluginIconColorMode } from "@/lib/plugin-types"
import { getProviderIconColor } from "@/lib/provider-icon"
import { cn } from "@/lib/utils"
import { useDarkMode } from "@/hooks/use-dark-mode"

type ProviderIconProps = {
  iconUrl: string
  darkIconUrl?: string
  iconColorMode?: PluginIconColorMode
  iconAspectRatio?: number
  fit?: "square" | "natural"
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
  iconAspectRatio,
  fit = "square",
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
  const iconStyle =
    fit === "natural" && iconAspectRatio !== undefined
      ? { width: "auto", aspectRatio: iconAspectRatio ?? 1 }
      : undefined

  if (iconColorMode === "multicolor") {
    return (
      <img
        src={resolvedIsDark && darkIconUrl ? darkIconUrl : iconUrl}
        alt={ariaHidden ? "" : label}
        aria-hidden={ariaHidden || undefined}
        title={title}
        data-testid={testId}
        className={classes}
        style={iconStyle}
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
        ...iconStyle,
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
