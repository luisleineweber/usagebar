import { describe, expect, it } from "vitest"
import { clamp01, cn, formatCountNumber, formatFixedPrecisionNumber } from "@/lib/utils"

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("a", undefined, "b")).toBe("a b")
  })

  it("dedupes tailwind conflicts", () => {
    expect(cn("px-2", "px-4")).toBe("px-4")
  })
})

describe("clamp01", () => {
  it("clamps non-finite and out-of-range values", () => {
    expect(clamp01(Number.NaN)).toBe(0)
    expect(clamp01(Number.POSITIVE_INFINITY)).toBe(0)
    expect(clamp01(-0.1)).toBe(0)
    expect(clamp01(0)).toBe(0)
    expect(clamp01(0.5)).toBe(0.5)
    expect(clamp01(1)).toBe(1)
    expect(clamp01(1.5)).toBe(1)
  })
})

describe("formatCountNumber", () => {
  it("formats integer values", () => {
    expect(formatCountNumber(42)).toBe("42")
    expect(formatCountNumber(0)).toBe("0")
  })

  it("formats non-integer values with up to 2 fraction digits", () => {
    expect(formatCountNumber(3.5)).toBe("3.5")
    expect(formatCountNumber(3.14159)).toBe("3.14")
  })

  it("returns 0 for non-finite values", () => {
    expect(formatCountNumber(Number.NaN)).toBe("0")
    expect(formatCountNumber(Number.POSITIVE_INFINITY)).toBe("0")
  })
})

describe("formatFixedPrecisionNumber", () => {
  it("formats integer values", () => {
    expect(formatFixedPrecisionNumber(10)).toBe("10")
  })

  it("formats non-integer values with 2 fraction digits", () => {
    expect(formatFixedPrecisionNumber(10.5)).toBe("10.50")
  })

  it("returns 0 for non-finite values", () => {
    expect(formatFixedPrecisionNumber(Number.NaN)).toBe("0")
  })
})
