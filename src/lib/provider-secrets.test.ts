import { beforeEach, describe, expect, it, vi } from "vitest"

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}))

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}))

import { deleteProviderSecret, setProviderSecret } from "@/lib/provider-secrets"

describe("provider-secrets", () => {
  beforeEach(() => {
    invokeMock.mockReset()
    invokeMock.mockResolvedValue(undefined)
  })

  describe("setProviderSecret", () => {
    it("calls invoke with providerId, secretKey, and value", async () => {
      await setProviderSecret("opencode", "cookieHeader", "secret-value")
      expect(invokeMock).toHaveBeenCalledWith("set_provider_secret", {
        providerId: "opencode",
        secretKey: "cookieHeader",
        value: "secret-value",
      })
    })
  })

  describe("deleteProviderSecret", () => {
    it("calls invoke with providerId and secretKey", async () => {
      await deleteProviderSecret("ollama", "apiKey")
      expect(invokeMock).toHaveBeenCalledWith("delete_provider_secret", {
        providerId: "ollama",
        secretKey: "apiKey",
      })
    })
  })
})
