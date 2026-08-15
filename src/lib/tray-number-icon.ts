import { renderSvgToImage } from "@/lib/tray-bars-icon"
import type { TrayState } from "@/lib/tray-state"

export type TrayColorScheme = "light" | "dark"
export type TrayNumberGlyph = number | "unknown" | "error"

type Glyph = {
  name: string
  rows: readonly string[]
}

const DIGITS = new Map(
  Object.entries({
    "0": { name: "0", rows: ["111", "101", "101", "101", "111"] },
    "1": { name: "1", rows: ["110", "010", "010", "010", "111"] },
    "2": { name: "2", rows: ["111", "001", "111", "100", "111"] },
    "3": { name: "3", rows: ["111", "001", "111", "001", "111"] },
    "4": { name: "4", rows: ["101", "101", "111", "001", "001"] },
    "5": { name: "5", rows: ["111", "100", "111", "001", "111"] },
    "6": { name: "6", rows: ["111", "100", "111", "101", "111"] },
    "7": { name: "7", rows: ["111", "001", "001", "001", "001"] },
    "8": { name: "8", rows: ["111", "101", "111", "101", "111"] },
    "9": { name: "9", rows: ["111", "101", "111", "001", "111"] },
  })
)

const DASH: Glyph = { name: "dash", rows: ["000", "000", "111", "000", "000"] }
const ERROR: Glyph = { name: "error", rows: ["010", "010", "010", "000", "010"] }

function clampDisplayedValue(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(99, Math.round(value)))
}

function getGlyphs(value: TrayNumberGlyph): Glyph[] {
  if (value === "unknown") return [DASH]
  if (value === "error") return [ERROR]
  return String(clampDisplayedValue(value))
    .split("")
    .map((digit) => DIGITS.get(digit) ?? DIGITS.get("0")!)
}

export function getWindowsTrayIconSizePx(devicePixelRatio: number | undefined): number {
  const dpr = typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1
  return Math.max(16, Math.round(16 * dpr))
}

export function getSystemTrayColorScheme(): TrayColorScheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "dark"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function getTrayNumberColor(
  state: Pick<TrayState, "kind"> & { remainingPercentExact?: number; scheme: TrayColorScheme }
): string {
  if (state.kind === "error") return state.scheme === "dark" ? "#ef4444" : "#b91c1c"
  if (state.kind !== "value" || typeof state.remainingPercentExact !== "number") {
    return state.scheme === "dark" ? "#f8fafc" : "#111827"
  }
  if (state.remainingPercentExact < 10) return state.scheme === "dark" ? "#ef4444" : "#b91c1c"
  if (state.remainingPercentExact <= 25) return state.scheme === "dark" ? "#f59e0b" : "#c2410c"
  return state.scheme === "dark" ? "#f8fafc" : "#111827"
}

export function makeTrayNumberSvg(args: {
  value: TrayNumberGlyph
  sizePx: number
  scheme: TrayColorScheme
  state?: TrayState
}): string {
  const { value, sizePx, scheme } = args
  const glyphs = getGlyphs(value)
  const totalUnits = glyphs.length * 3 + Math.max(0, glyphs.length - 1)
  const cell = Math.max(2, Math.floor(Math.min((sizePx - 2) / totalUnits, (sizePx - 2) / 5)))
  const glyphWidth = totalUnits * cell
  const xStart = Math.floor((sizePx - glyphWidth) / 2)
  const yStart = Math.floor((sizePx - 5 * cell) / 2)
  const color = getTrayNumberColor(
    args.state
      ? { ...args.state, scheme }
      : value === "error"
        ? { kind: "error", scheme }
        : value === "unknown"
          ? { kind: "unknown", scheme }
          : { kind: "value", remainingPercentExact: value, scheme }
  )
  const glyphName =
    value === "unknown" ? "dash" : value === "error" ? "error" : String(clampDisplayedValue(value))
  const rects: string[] = []
  let xOffset = xStart

  for (const glyph of glyphs) {
    for (let row = 0; row < glyph.rows.length; row += 1) {
      const pattern = glyph.rows[row] ?? "000"
      for (let column = 0; column < pattern.length; column += 1) {
        if (pattern[column] !== "1") continue
        rects.push(
          `<rect x="${xOffset + column * cell}" y="${yStart + row * cell}" width="${cell}" height="${cell}" />`
        )
      }
    }
    xOffset += 3 * cell + cell
  }

  const dataValue = typeof value === "number" ? clampDisplayedValue(value) : value
  return [
    `<svg width="${sizePx}" height="${sizePx}" viewBox="0 0 ${sizePx} ${sizePx}" xmlns="http://www.w3.org/2000/svg" data-glyph="${glyphName}" data-value="${dataValue}">`,
    `<g fill="${color}" shape-rendering="crispEdges">${rects.join("")}</g>`,
    "</svg>",
  ].join("")
}

export async function renderTrayNumberIcon(args: {
  value: TrayNumberGlyph
  sizePx: number
  scheme: TrayColorScheme
  state?: TrayState
}) {
  const svg = makeTrayNumberSvg(args)
  return renderSvgToImage(svg, args.sizePx, args.sizePx)
}
