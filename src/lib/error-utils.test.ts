import { describe, expect, it } from "vitest"
import { getErrorMessage } from "@/lib/error-utils"

describe("getErrorMessage", () => {
  it("returns the trimmed string error", () => {
    expect(getErrorMessage("  something broke  ", "fallback")).toBe("something broke")
  })

  it("returns the fallback for empty string", () => {
    expect(getErrorMessage("", "fallback")).toBe("fallback")
  })

  it("returns the fallback for whitespace-only string", () => {
    expect(getErrorMessage("   ", "fallback")).toBe("fallback")
  })

  it("returns the Error instance message", () => {
    expect(getErrorMessage(new Error("network down"), "fallback")).toBe("network down")
  })

  it("returns the fallback for Error with empty message", () => {
    expect(getErrorMessage(new Error(""), "fallback")).toBe("fallback")
  })

  it("returns the fallback for Error with whitespace message", () => {
    expect(getErrorMessage(new Error("   "), "fallback")).toBe("fallback")
  })

  it("returns message from an object with string message property", () => {
    expect(getErrorMessage({ message: "custom error" }, "fallback")).toBe("custom error")
  })

  it("returns the fallback for object with non-string message", () => {
    expect(getErrorMessage({ message: 42 }, "fallback")).toBe("fallback")
  })

  it("returns the fallback for object without message property", () => {
    expect(getErrorMessage({ code: 500 }, "fallback")).toBe("fallback")
  })

  it("returns the fallback for null", () => {
    expect(getErrorMessage(null, "fallback")).toBe("fallback")
  })

  it("returns the fallback for undefined", () => {
    expect(getErrorMessage(undefined, "fallback")).toBe("fallback")
  })

  it("returns the fallback for a number", () => {
    expect(getErrorMessage(123, "fallback")).toBe("fallback")
  })

  it("returns the fallback for a boolean", () => {
    expect(getErrorMessage(true, "fallback")).toBe("fallback")
  })

  it("returns trimmed message from object with message string", () => {
    expect(getErrorMessage({ message: "  padded  " }, "fallback")).toBe("padded")
  })

  it("returns fallback for object with empty string message", () => {
    expect(getErrorMessage({ message: "" }, "fallback")).toBe("fallback")
  })
})
