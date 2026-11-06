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
})
