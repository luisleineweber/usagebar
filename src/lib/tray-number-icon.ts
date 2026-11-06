import { renderSvgToImage } from "@/lib/tray-bars-icon"
import type { TaskbarTheme } from "@/lib/taskbar-theme"
import type { TrayState } from "@/lib/tray-state"

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

/** Glyph colors per taskbar surface. Each one keeps at least 4.5:1 contrast on its taskbar. */
const TRAY_NUMBER_COLORS = {
  dark: { normal: "#ffffff", warning: "#f59e0b", critical: "#f87171" },
  light: { normal: "#111827", warning: "#b45309", critical: "#b91c1c" },
} as const satisfies Record<TaskbarTheme, Record<"normal" | "warning" | "critical", string>>

export function getTrayNumberColor(
  state: Pick<TrayState, "kind"> & { remainingPercentExact?: number },
  taskbarTheme: TaskbarTheme
): string {
  const colors = TRAY_NUMBER_COLORS[taskbarTheme]
  if (state.kind === "error") return colors.critical
  if (state.kind !== "value" || typeof state.remainingPercentExact !== "number") {
    return colors.normal
  }
  if (state.remainingPercentExact < 10) return colors.critical
  if (state.remainingPercentExact <= 25) return colors.warning
  return colors.normal
}

export function makeTrayNumberSvg(args: {
  value: TrayNumberGlyph
  sizePx: number
  taskbarTheme: TaskbarTheme
  state?: TrayState
}): string {
  const { value, sizePx, taskbarTheme } = args
  const glyphs = getGlyphs(value)
  const totalUnits = glyphs.length * 3 + Math.max(0, glyphs.length - 1)
  const cell = Math.max(2, Math.floor(Math.min((sizePx - 2) / totalUnits, (sizePx - 2) / 5)))
  const glyphWidth = totalUnits * cell
  const xStart = Math.floor((sizePx - glyphWidth) / 2)
  const yStart = Math.floor((sizePx - 5 * cell) / 2)
  const color = getTrayNumberColor(
    args.state ??
      (value === "error"
        ? { kind: "error" }
        : value === "unknown"
          ? { kind: "unknown" }
          : { kind: "value", remainingPercentExact: value }),
    taskbarTheme
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
  taskbarTheme: TaskbarTheme
  state?: TrayState
}) {
  const svg = makeTrayNumberSvg(args)
  return renderSvgToImage(svg, args.sizePx, args.sizePx)
}
