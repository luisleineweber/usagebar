import { describe, expect, it } from "vitest"

import {
  getTrayNumberColor,
  getWindowsTrayIconSizePx,
  makeTrayNumberSvg,
} from "@/lib/tray-number-icon"

describe("Windows tray number icon", () => {
  it("uses a fixed 16px logical slot and crisp physical sizes", () => {
    expect(getWindowsTrayIconSizePx(1)).toBe(16)
    expect(getWindowsTrayIconSizePx(1.25)).toBe(20)
    expect(getWindowsTrayIconSizePx(1.5)).toBe(24)
    expect(getWindowsTrayIconSizePx(2)).toBe(32)
  })

  it("renders a number without percent signs, provider art, text or effects", () => {
    const svg = makeTrayNumberSvg({ value: 36, sizePx: 16 })

    expect(svg).toContain('viewBox="0 0 16 16"')
    expect(svg).toContain('shape-rendering="crispEdges"')
    expect(svg).not.toContain("<text")
    expect(svg).not.toContain("%")
    expect(svg).not.toContain("<image")
    expect(svg).not.toContain("gradient")
    expect(svg).not.toContain("filter")
  })

  it("uses the dash and error glyphs for unknown and error states", () => {
    expect(makeTrayNumberSvg({ value: "unknown", sizePx: 16 })).toContain('data-glyph="dash"')
    expect(makeTrayNumberSvg({ value: "error", sizePx: 16 })).toContain('data-glyph="error"')
  })

  it("clamps the displayed value to 0 through 99", () => {
    expect(makeTrayNumberSvg({ value: 100, sizePx: 16 })).toContain('data-value="99"')
    expect(makeTrayNumberSvg({ value: -2, sizePx: 16 })).toContain('data-value="0"')
  })

  it("uses white glyphs for the taskbar, independent of the app theme", () => {
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: query === "(prefers-color-scheme: light)",
      media: query,
    })) as typeof window.matchMedia
    try {
      expect(makeTrayNumberSvg({ value: 94, sizePx: 16 })).toContain('fill="#ffffff"')
      expect(makeTrayNumberSvg({ value: "unknown", sizePx: 16 })).toContain('fill="#ffffff"')
    } finally {
      window.matchMedia = original
    }
  })

  it("assigns status colors from the exact remaining value", () => {
    expect(getTrayNumberColor({ kind: "value", remainingPercentExact: 25 })).toBe("#f59e0b")
    expect(getTrayNumberColor({ kind: "value", remainingPercentExact: 25.01 })).toBe("#ffffff")
    expect(getTrayNumberColor({ kind: "value", remainingPercentExact: 9.999 })).toBe("#ef4444")
    expect(getTrayNumberColor({ kind: "unknown" })).toBe("#ffffff")
    expect(getTrayNumberColor({ kind: "error" })).toBe("#ef4444")
  })
})
