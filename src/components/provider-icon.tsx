import type { PluginIconColorMode } from "@/lib/plugin-types"
import { getProviderIconColor } from "@/lib/provider-icon"
import { cn } from "@/lib/utils"

type ProviderIconProps = {
  iconUrl: string
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
  iconColorMode = "monochrome",
  brandColor,
  isDark = false,
  className,
  label,
  title,
  ariaHidden = false,
  testId,
}: ProviderIconProps) {
  const classes = cn("inline-block shrink-0 object-contain", className)

  if (iconColorMode === "multicolor") {
    return (
      <img
        src={iconUrl}
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
        backgroundColor: getProviderIconColor(brandColor, isDark),
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
