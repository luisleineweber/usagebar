import { beforeEach, describe, expect, it, vi } from "vitest"

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }))

import {
  browserImportMessage,
  importBrowserCookies,
  listBrowserImportSources,
  type BrowserCookieImportCode,
} from "@/lib/browser-cookie-import"

describe("browser cookie import adapter", () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it("uses camelCase Tauri arguments and returns metadata only", async () => {
    invokeMock.mockResolvedValue({
      providerId: "claude",
      sourceId: "edge",
      profileId: "Default",
      code: "ok",
      matchedCount: 1,
      skippedExpiredCount: 0,
      decryptFailureCount: 0,
    })

    await importBrowserCookies("claude", "edge", "Default")

    expect(invokeMock).toHaveBeenCalledWith("import_browser_cookies", {
      providerId: "claude",
      sourceId: "edge",
      profileId: "Default",
    })
  })

  it("lists sources through the provider-scoped command", async () => {
    invokeMock.mockResolvedValue([])
    await listBrowserImportSources("claude")
    expect(invokeMock).toHaveBeenCalledWith("list_browser_import_sources", {
      providerId: "claude",
    })
  })

  it("maps safe diagnostic codes to actionable copy", () => {
    expect(
      browserImportMessage({
        providerId: "claude",
        sourceId: "edge",
        profileId: "Default",
        code: "unsupportedEncryption",
        matchedCount: 0,
        skippedExpiredCount: 0,
        decryptFailureCount: 1,
      })
    ).toMatch(/guided login|paste/i)
  })

  it.each<[BrowserCookieImportCode, number, string]>([
    ["ok", 1, "Imported 1 approved session cookie."],
    ["ok", 2, "Imported 2 approved session cookies."],
    ["notEnabled", 0, "Enable browser import for this provider first."],
    ["notInstalled", 0, "Microsoft Edge or the selected profile was not found."],
    ["noMatch", 0, "No approved signed-in session was found."],
    ["browserLocked", 0, "Edge is using the cookie database."],
    ["vaultWriteFailed", 0, "Windows credential store could not save it."],
    ["invalidProfile", 0, "selected Edge profile is no longer available."],
    ["unsupportedProvider", 0, "Browser import is not available for this provider."],
  ])("maps %s results to safe user text", (code, matchedCount, text) => {
    expect(
      browserImportMessage({
        providerId: "claude",
        sourceId: "edge",
        profileId: "Default",
        code,
        matchedCount,
        skippedExpiredCount: 0,
        decryptFailureCount: 0,
      })
    ).toContain(text)
  })

  it("forwards native command failures", async () => {
    invokeMock.mockRejectedValue(new Error("IPC unavailable"))

    let failure: unknown
    try {
      await listBrowserImportSources("claude")
    } catch (error) {
      failure = error
    }
    expect(failure).toEqual(new Error("IPC unavailable"))
  })
})
