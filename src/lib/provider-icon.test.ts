import { describe, expect, it } from "vitest"
import { getProviderIconColor } from "@/lib/provider-icon"

describe("getProviderIconColor", () => {
  it("replaces a black mark on dark surfaces", () => {
    expect(getProviderIconColor("#000000", true)).toBe("#ffffff")
  })

  it("replaces a white mark on light surfaces with the current foreground", () => {
    expect(getProviderIconColor("#ffffff", false)).toBe("currentColor")
  })

  it("keeps brand colors that work on the current surface", () => {
    expect(getProviderIconColor("#74AA9C", false)).toBe("#74AA9C")
    expect(getProviderIconColor("#74AA9C", true)).toBe("#74AA9C")
  })
})
