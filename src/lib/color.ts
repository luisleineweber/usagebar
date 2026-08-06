type Rgb = [number, number, number]

function parseHexColor(value: string): Rgb | null {
  const normalized = value.trim().replace(/^#/, "")
  if (!/^(?:[\da-f]{3}|[\da-f]{6})$/i.test(normalized)) return null
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((part) => `${part}${part}`)
          .join("")
      : normalized
  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
  ]
}

function relativeLuminance([red, green, blue]: Rgb): number {
  const channels = [red, green, blue].map((channel) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
}

function contrastRatio(first: Rgb, second: Rgb): number {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second))
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second))
  return (lighter + 0.05) / (darker + 0.05)
}

export function getRelativeLuminance(hex: string): number {
  const rgb = parseHexColor(hex)
  return rgb ? relativeLuminance(rgb) : 0
}

/** Choose the stronger of the standard dark and light text colors. */
export function getContrastTextColor(hex: string): "#111827" | "#ffffff" {
  const rgb = parseHexColor(hex)
  if (!rgb) return "#111827"

  return contrastRatio(rgb, [17, 24, 39]) >= contrastRatio(rgb, [255, 255, 255])
    ? "#111827"
    : "#ffffff"
}

/** Return only colors with usable contrast on both light and dark surfaces. */
export function getAccessibleColor(color?: string): string | undefined {
  if (!color) return undefined
  const rgb = parseHexColor(color)
  if (!rgb) return undefined
  const readableOnLight = contrastRatio(rgb, [255, 255, 255]) >= 3
  const readableOnDark = contrastRatio(rgb, [28, 28, 30]) >= 3
  return readableOnLight && readableOnDark ? color : undefined
}
