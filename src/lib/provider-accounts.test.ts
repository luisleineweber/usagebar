import { beforeEach, describe, expect, it, vi } from "vitest"

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }))

import {
  deleteProviderAccountProfile,
  importCurrentProviderAccountProfile,
  listProviderAccountProfiles,
} from "@/lib/provider-accounts"

describe("provider accounts", () => {
  beforeEach(() => invokeMock.mockReset())

  it("lists accounts with the provider scope", async () => {
    invokeMock.mockResolvedValue([])
    await listProviderAccountProfiles("claude")
    expect(invokeMock).toHaveBeenCalledWith("list_provider_account_profiles", {
      providerId: "claude",
    })
  })

  it("imports the current login with the provider scope", async () => {
    invokeMock.mockResolvedValue({ profile: { profileId: "profile-1" }, wasFirstProfile: true })
    const result = await importCurrentProviderAccountProfile("claude")
    expect(invokeMock).toHaveBeenCalledWith("import_current_provider_account_profile", {
      providerId: "claude",
    })
    expect(result.wasFirstProfile).toBe(true)
  })

  it("deletes an account with both identity fields", async () => {
    invokeMock.mockResolvedValue(null)
    await deleteProviderAccountProfile("claude", "profile-1")
    expect(invokeMock).toHaveBeenCalledWith("delete_provider_account_profile", {
      providerId: "claude",
      profileId: "profile-1",
    })
  })
})
