import { beforeEach, describe, expect, it, vi } from "vitest"

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }))

import {
  browserImportMessage,
  importBrowserCookies,
  listBrowserImportSources,
} from "@/lib/browser-cookie-import"

describe("browser cookie import adapter", () => {
  beforeEach(() => invokeMock.mockReset())

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
})
