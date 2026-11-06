import { afterEach, describe, expect, it } from "vitest"

import { TASKBAR_BACKGROUND, type TaskbarTheme } from "@/lib/taskbar-theme"
import {
  getTrayNumberColor,
  getWindowsTrayIconSizePx,
  makeTrayNumberSvg,
} from "@/lib/tray-number-icon"

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (a, b) => b - a
  )
  return (light! + 0.05) / (dark! + 0.05)
}

function fillOf(svg: string): string {
  return /fill="(#[0-9a-f]{6})"/.exec(svg)?.[1] ?? ""
}

const originalMatchMedia = window.matchMedia

function setAppTheme(appTheme: "light" | "dark") {
  window.matchMedia = ((query: string) => ({
    matches: query === `(prefers-color-scheme: ${appTheme})`,
    media: query,
  })) as typeof window.matchMedia
}

afterEach(() => {
  window.matchMedia = originalMatchMedia
})

describe("Windows tray number icon", () => {
  it("uses a fixed 16px logical slot and crisp physical sizes", () => {
    expect(getWindowsTrayIconSizePx(1)).toBe(16)
    expect(getWindowsTrayIconSizePx(1.25)).toBe(20)
    expect(getWindowsTrayIconSizePx(1.5)).toBe(24)
    expect(getWindowsTrayIconSizePx(2)).toBe(32)
  })

  it("renders a number without percent signs, provider art, text or effects", () => {
    const svg = makeTrayNumberSvg({ value: 36, sizePx: 16, taskbarTheme: "dark" })

    expect(svg).toContain('viewBox="0 0 16 16"')
    expect(svg).toContain('shape-rendering="crispEdges"')
    expect(svg).not.toContain("<text")
    expect(svg).not.toContain("%")
    expect(svg).not.toContain("<image")
    expect(svg).not.toContain("gradient")
    expect(svg).not.toContain("filter")
  })

  it("uses the dash and error glyphs for unknown and error states", () => {
    expect(makeTrayNumberSvg({ value: "unknown", sizePx: 16, taskbarTheme: "dark" })).toContain(
      'data-glyph="dash"'
    )
    expect(makeTrayNumberSvg({ value: "error", sizePx: 16, taskbarTheme: "dark" })).toContain(
      'data-glyph="error"'
    )
  })

  it("clamps the displayed value to 0 through 99", () => {
    expect(makeTrayNumberSvg({ value: 100, sizePx: 16, taskbarTheme: "dark" })).toContain(
      'data-value="99"'
    )
    expect(makeTrayNumberSvg({ value: -2, sizePx: 16, taskbarTheme: "dark" })).toContain(
      'data-value="0"'
    )
  })

  it.each([
    { appTheme: "light", taskbarTheme: "light", fill: "#111827" },
    { appTheme: "dark", taskbarTheme: "light", fill: "#111827" },
    { appTheme: "light", taskbarTheme: "dark", fill: "#ffffff" },
    { appTheme: "dark", taskbarTheme: "dark", fill: "#ffffff" },
  ] as const)(
    "follows the $taskbarTheme taskbar with the $appTheme app theme",
    ({ appTheme, taskbarTheme, fill }) => {
      setAppTheme(appTheme)
      expect(fillOf(makeTrayNumberSvg({ value: 94, sizePx: 16, taskbarTheme }))).toBe(fill)
    }
  )

  it.each(["light", "dark"] as const satisfies readonly TaskbarTheme[])(
    "keeps every status color readable on the %s taskbar",
    (taskbarTheme) => {
      const states = [
        { kind: "value", remainingPercentExact: 80 },
        { kind: "value", remainingPercentExact: 20 },
        { kind: "value", remainingPercentExact: 5 },
        { kind: "unknown" },
        { kind: "error" },
      ] as const
      for (const state of states) {
        const color = getTrayNumberColor(state, taskbarTheme)
        expect(contrast(color, TASKBAR_BACKGROUND[taskbarTheme])).toBeGreaterThanOrEqual(4.5)
      }
    }
  )

  it("assigns status colors from the exact remaining value", () => {
    expect(getTrayNumberColor({ kind: "value", remainingPercentExact: 25 }, "dark")).toBe("#f59e0b")
    expect(getTrayNumberColor({ kind: "value", remainingPercentExact: 25.01 }, "dark")).toBe(
      "#ffffff"
    )
    expect(getTrayNumberColor({ kind: "value", remainingPercentExact: 9.999 }, "dark")).toBe(
      "#f87171"
    )
    expect(getTrayNumberColor({ kind: "value", remainingPercentExact: 25 }, "light")).toBe(
      "#b45309"
    )
    expect(getTrayNumberColor({ kind: "value", remainingPercentExact: 9.999 }, "light")).toBe(
      "#b91c1c"
    )
    expect(getTrayNumberColor({ kind: "unknown" }, "light")).toBe("#111827")
    expect(getTrayNumberColor({ kind: "error" }, "dark")).toBe("#f87171")
  })
})
