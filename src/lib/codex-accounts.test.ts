import { beforeEach, describe, expect, it, vi } from "vitest"

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}))

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}))

import { deleteCodexAccountProfile, importCurrentCodexAccountProfile, listCodexAccountProfiles } from "@/lib/codex-accounts"

describe("codex-accounts", () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  describe("listCodexAccountProfiles", () => {
    it("calls the list tauri command", async () => {
      invokeMock.mockResolvedValue([{ profileId: "p1", label: "Test" }])
      const result = await listCodexAccountProfiles()
      expect(invokeMock).toHaveBeenCalledWith("list_codex_account_profiles")
      expect(result).toEqual([{ profileId: "p1", label: "Test" }])
    })
  })

  describe("importCurrentCodexAccountProfile", () => {
    it("calls the import tauri command", async () => {
      invokeMock.mockResolvedValue({ profile: { profileId: "p1" }, wasFirstProfile: true })
      const result = await importCurrentCodexAccountProfile()
      expect(invokeMock).toHaveBeenCalledWith("import_current_codex_account_profile")
      expect(result.wasFirstProfile).toBe(true)
    })
  })

  describe("deleteCodexAccountProfile", () => {
    it("calls the delete tauri command with profileId", async () => {
      invokeMock.mockResolvedValue(null)
      const result = await deleteCodexAccountProfile("p1")
      expect(invokeMock).toHaveBeenCalledWith("delete_codex_account_profile", { profileId: "p1" })
      expect(result).toBeNull()
    })
  })
})
