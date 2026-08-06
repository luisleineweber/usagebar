import { describe, expect, it } from "vitest"
import { getContrastTextColor } from "@/lib/color"

describe("getContrastTextColor", () => {
  it("uses white text on the light-mode green accent", () => {
    expect(getContrastTextColor("#15803d")).toBe("#ffffff")
  })

  it("uses dark text on the bright orange accent", () => {
    expect(getContrastTextColor("#eb4600")).toBe("#111827")
  })
})
