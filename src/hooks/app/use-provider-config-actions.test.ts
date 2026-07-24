import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ProviderConfigs } from "@/lib/provider-settings"

const {
  clearProviderSecretMetadataMock,
  deleteProviderSecretMock,
  loadProviderConfigsMock,
  saveProviderConfigsMock,
  setProviderSecretMetadataMock,
  setProviderSecretMock,
  updateProviderConfigMock,
} = vi.hoisted(() => ({
  clearProviderSecretMetadataMock: vi.fn(),
  deleteProviderSecretMock: vi.fn(),
  loadProviderConfigsMock: vi.fn(),
  saveProviderConfigsMock: vi.fn(),
  setProviderSecretMetadataMock: vi.fn(),
  setProviderSecretMock: vi.fn(),
  updateProviderConfigMock: vi.fn(),
}))

vi.mock("@/lib/provider-settings", () => ({
  clearProviderSecretMetadata: clearProviderSecretMetadataMock,
  loadProviderConfigs: loadProviderConfigsMock,
  saveProviderConfigs: saveProviderConfigsMock,
  setProviderSecretMetadata: setProviderSecretMetadataMock,
  updateProviderConfig: updateProviderConfigMock,
}))

vi.mock("@/lib/provider-secrets", () => ({
  deleteProviderSecret: deleteProviderSecretMock,
  setProviderSecret: setProviderSecretMock,
}))

import { useProviderConfigActions } from "@/hooks/app/use-provider-config-actions"

describe("useProviderConfigActions", () => {
  const initialConfigs: ProviderConfigs = {
    codex: { source: "auto" },
  }
  const loadedConfigs: ProviderConfigs = {
    claude: { source: "manual" },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    loadProviderConfigsMock.mockResolvedValue(loadedConfigs)
    saveProviderConfigsMock.mockResolvedValue(undefined)
    setProviderSecretMock.mockResolvedValue(undefined)
    deleteProviderSecretMock.mockResolvedValue(undefined)
    updateProviderConfigMock.mockReturnValue({ updated: true })
    setProviderSecretMetadataMock.mockReturnValue({ secret: "set" })
    clearProviderSecretMetadataMock.mockReturnValue({ secret: "cleared" })
  })

  it("loads provider configs and updates the store", async () => {
    const setProviderConfigs = vi.fn()

    renderHook(() =>
      useProviderConfigActions({
        providerConfigs: initialConfigs,
        setProviderConfigs,
      })
    )

    await waitFor(() => expect(setProviderConfigs).toHaveBeenCalledWith(loadedConfigs))
  })

  it("exposes a retryable error when provider configs cannot be loaded", async () => {
    const setProviderConfigs = vi.fn()
    loadProviderConfigsMock.mockRejectedValueOnce(new Error("settings unavailable"))
    const { result } = renderHook(() =>
      useProviderConfigActions({
        providerConfigs: initialConfigs,
        setProviderConfigs,
      })
    )

    await waitFor(() => expect(result.current.providerConfigLoadError).toBe("settings unavailable"))
    loadProviderConfigsMock.mockResolvedValueOnce(loadedConfigs)

    await act(() => result.current.retryProviderConfigs())

    await waitFor(() => {
      expect(result.current.providerConfigLoadError).toBeNull()
      expect(setProviderConfigs).toHaveBeenCalledWith(loadedConfigs)
    })
  })

  it("updates and persists provider config changes", async () => {
    const setProviderConfigs = vi.fn()
    const nextConfigs = { updated: true }
    updateProviderConfigMock.mockReturnValue(nextConfigs)
    const { result } = renderHook(() =>
      useProviderConfigActions({
        providerConfigs: initialConfigs,
        setProviderConfigs,
      })
    )

    await act(() => result.current.handleProviderConfigChange("codex", { source: "manual" }))

    expect(updateProviderConfigMock).toHaveBeenCalledWith(initialConfigs, "codex", {
      source: "manual",
    })
    expect(setProviderConfigs).toHaveBeenCalledWith(nextConfigs)
    expect(saveProviderConfigsMock).toHaveBeenCalledWith(nextConfigs)
  })

  it("saves a provider secret before persisting its metadata", async () => {
    const setProviderConfigs = vi.fn()
    const nextConfigs = { secret: "set" }
    setProviderSecretMetadataMock.mockReturnValue(nextConfigs)
    const { result } = renderHook(() =>
      useProviderConfigActions({
        providerConfigs: initialConfigs,
        setProviderConfigs,
      })
    )

    await act(() => result.current.handleProviderSecretSave("codex", "apiKey", "secret-value"))

    expect(setProviderSecretMock).toHaveBeenCalledWith("codex", "apiKey", "secret-value")
    expect(setProviderSecretMetadataMock).toHaveBeenCalledWith(initialConfigs, "codex", "apiKey")
    expect(saveProviderConfigsMock).toHaveBeenCalledWith(nextConfigs)
  })

  it("deletes a provider secret before persisting cleared metadata", async () => {
    const setProviderConfigs = vi.fn()
    const nextConfigs = { secret: "cleared" }
    clearProviderSecretMetadataMock.mockReturnValue(nextConfigs)
    const { result } = renderHook(() =>
      useProviderConfigActions({
        providerConfigs: initialConfigs,
        setProviderConfigs,
      })
    )

    await act(() => result.current.handleProviderSecretDelete("codex", "apiKey"))

    expect(deleteProviderSecretMock).toHaveBeenCalledWith("codex", "apiKey")
    expect(clearProviderSecretMetadataMock).toHaveBeenCalledWith(initialConfigs, "codex", "apiKey")
    expect(saveProviderConfigsMock).toHaveBeenCalledWith(nextConfigs)
  })

  it("does not persist metadata when secret storage fails", async () => {
    const setProviderConfigs = vi.fn()
    const error = new Error("secret storage failed")
    setProviderSecretMock.mockRejectedValue(error)
    const { result } = renderHook(() =>
      useProviderConfigActions({
        providerConfigs: initialConfigs,
        setProviderConfigs,
      })
    )
    await waitFor(() => expect(setProviderConfigs).toHaveBeenCalledWith(loadedConfigs))
    setProviderConfigs.mockClear()

    await expect(
      act(() => result.current.handleProviderSecretSave("codex", "apiKey", "secret-value"))
    ).rejects.toThrow("secret storage failed")

    expect(saveProviderConfigsMock).not.toHaveBeenCalled()
    expect(setProviderConfigs).not.toHaveBeenCalled()
  })
})
