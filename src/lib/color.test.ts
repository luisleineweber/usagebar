import { describe, expect, it } from "vitest"
import { getAccessibleColor, getContrastTextColor, getRelativeLuminance } from "@/lib/color"

describe("getContrastTextColor", () => {
  it("uses white text on the light-mode green accent", () => {
    expect(getContrastTextColor("#15803d")).toBe("#ffffff")
  })

  it("uses dark text on the bright orange accent", () => {
    expect(getContrastTextColor("#eb4600")).toBe("#111827")
  })

  it("supports trimmed three-digit hex values", () => {
    expect(getContrastTextColor("  #000  ")).toBe("#ffffff")
    expect(getRelativeLuminance("#fff")).toBeCloseTo(1)
  })

  it("uses safe defaults for invalid colors", () => {
    expect(getContrastTextColor("not-a-color")).toBe("#111827")
    expect(getRelativeLuminance("#abcd")).toBe(0)
  })

  it("keeps only colors that contrast with light and dark surfaces", () => {
    expect(getAccessibleColor()).toBeUndefined()
    expect(getAccessibleColor("invalid")).toBeUndefined()
    expect(getAccessibleColor("#767676")).toBe("#767676")
    expect(getAccessibleColor("#ffffff")).toBeUndefined()
    expect(getAccessibleColor("#111111")).toBeUndefined()
  })
})
