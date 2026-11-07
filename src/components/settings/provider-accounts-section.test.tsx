import { act, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ProviderAccountsSection } from "@/components/settings/provider-accounts-section"

const listMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/provider-accounts", () => ({
  listProviderAccountProfiles: listMock,
  importCurrentProviderAccountProfile: vi.fn(),
  deleteProviderAccountProfile: vi.fn(),
}))

const pinned = { profileId: "p1", label: "Work", email: "dev@example.com", lastImportedAt: 1 }

describe("ProviderAccountsSection pinned profile", () => {
  beforeEach(() => {
    listMock.mockReset()
  })

  it("does not clear the pinned profile before a delayed list response", async () => {
    let resolveList!: (profiles: (typeof pinned)[]) => void
    listMock.mockReturnValue(new Promise((resolve) => (resolveList = resolve)))
    const onConfigChange = vi.fn(async () => undefined)
    render(
      <ProviderAccountsSection
        providerId="claude"
        providerName="Claude"
        config={{ selectedAccountProfileId: "p1" }}
        onConfigChange={onConfigChange}
      />
    )

    expect(onConfigChange).not.toHaveBeenCalled()
    await act(async () => resolveList([pinned]))

    expect(await screen.findByText("Work")).toBeInTheDocument()
    expect(onConfigChange).not.toHaveBeenCalled()
  })

  it("does not clear the pinned profile after a failed list load", async () => {
    listMock.mockRejectedValue(new Error("Account store unavailable."))
    const onConfigChange = vi.fn(async () => undefined)
    render(
      <ProviderAccountsSection
        providerId="claude"
        providerName="Claude"
        config={{ selectedAccountProfileId: "p1" }}
        onConfigChange={onConfigChange}
      />
    )

    await waitFor(() => expect(screen.getByText("Account store unavailable.")).toBeInTheDocument())
    expect(onConfigChange).not.toHaveBeenCalled()
  })

  describe("after a provider switch", () => {
    const claudeProfile = { profileId: "c1", label: "Claude work", email: null, lastImportedAt: 1 }
    const geminiPin = { profileId: "g1", label: "Gemini work", email: null, lastImportedAt: 1 }

    async function switchToGemini(geminiList: Promise<(typeof geminiPin)[]>) {
      const onConfigChange = vi.fn(async () => undefined)
      listMock.mockImplementation((providerId: string) =>
        providerId === "claude" ? Promise.resolve([claudeProfile]) : geminiList
      )
      const { rerender } = render(
        <ProviderAccountsSection
          providerId="claude"
          providerName="Claude"
          config={{ selectedAccountProfileId: "c1" }}
          onConfigChange={onConfigChange}
        />
      )
      expect(await screen.findByText("Claude work")).toBeInTheDocument()

      // The Claude list is loaded. Gemini's pin is not in it, but that list is not Gemini's.
      rerender(
        <ProviderAccountsSection
          providerId="gemini"
          providerName="Gemini"
          config={{ selectedAccountProfileId: "g1" }}
          onConfigChange={onConfigChange}
        />
      )
      return onConfigChange
    }

    it("keeps the new provider's pin while its list is delayed", async () => {
      let resolveGemini!: (profiles: (typeof geminiPin)[]) => void
      const onConfigChange = await switchToGemini(
        new Promise((resolve) => (resolveGemini = resolve))
      )

      expect(screen.queryByText("Claude work")).not.toBeInTheDocument()
      expect(onConfigChange).not.toHaveBeenCalled()

      await act(async () => resolveGemini([geminiPin]))
      expect(await screen.findByText("Gemini work")).toBeInTheDocument()
      expect(onConfigChange).not.toHaveBeenCalled()
    })

    it("keeps the new provider's pin when its list fails", async () => {
      let rejectGemini!: (reason: Error) => void
      const onConfigChange = await switchToGemini(
        new Promise((_resolve, reject) => (rejectGemini = reject))
      )

      await act(async () => rejectGemini(new Error("Gemini store unavailable.")))
      expect(await screen.findByText("Gemini store unavailable.")).toBeInTheDocument()
      expect(onConfigChange).not.toHaveBeenCalled()
    })

    it("still clears the new provider's pin when its successful list lacks it", async () => {
      const onConfigChange = await switchToGemini(Promise.resolve([]))

      await waitFor(() =>
        expect(onConfigChange).toHaveBeenCalledWith("gemini", {
          selectedAccountProfileId: undefined,
        })
      )
      expect(onConfigChange).toHaveBeenCalledTimes(1)
    })
  })
})
