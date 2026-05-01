import { describe, expect, it } from "vitest"

import { shouldUseTemplateTrayIcon } from "@/hooks/app/use-tray-icon"

function withNavigatorPlatform<T>(platform: string, userAgent: string, fn: () => T): T {
  const originalPlatform = Object.getOwnPropertyDescriptor(Navigator.prototype, "platform")
  const originalUserAgent = Object.getOwnPropertyDescriptor(Navigator.prototype, "userAgent")

  Object.defineProperty(Navigator.prototype, "platform", {
    configurable: true,
    get: () => platform,
  })
  Object.defineProperty(Navigator.prototype, "userAgent", {
    configurable: true,
    get: () => userAgent,
  })

  try {
    return fn()
  } finally {
    if (originalPlatform) {
      Object.defineProperty(Navigator.prototype, "platform", originalPlatform)
    }
    if (originalUserAgent) {
      Object.defineProperty(Navigator.prototype, "userAgent", originalUserAgent)
    }
  }
}

describe("use-tray-icon platform helpers", () => {
  it("uses template tray icons on macOS", () => {
    const result = withNavigatorPlatform("MacIntel", "Mozilla/5.0 (Macintosh)", () =>
      shouldUseTemplateTrayIcon()
    )

    expect(result).toBe(true)
  })

  it("does not use template tray icons on Windows", () => {
    const result = withNavigatorPlatform("Win32", "Mozilla/5.0 (Windows NT 10.0)", () =>
      shouldUseTemplateTrayIcon()
    )

    expect(result).toBe(false)
  })
})
