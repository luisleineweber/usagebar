import { getRelativeLuminance } from "@/lib/color"

/** Keep monochrome provider marks visible against both application surfaces. */
export function getProviderIconColor(brandColor: string | undefined, isDark: boolean): string {
  if (!brandColor) return "currentColor"

  const luminance = getRelativeLuminance(brandColor)
  if (isDark && luminance < 0.15) return "#ffffff"
  if (!isDark && luminance > 0.85) return "currentColor"
  return brandColor
}
