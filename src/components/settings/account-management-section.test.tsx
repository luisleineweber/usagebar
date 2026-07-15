import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AccountManagementSection } from "@/components/settings/account-management-section"

vi.mock("@/components/settings/codex-accounts-section", () => ({
  CodexAccountsSection: () => null,
}))

const definition = {
  providerId: "claude",
  displayName: "Claude",
  secretField: "cookieHeader",
} as never

describe("AccountManagementSection", () => {
  it("shows connection state and account actions", () => {
    const onPing = vi.fn()
    const onReauthenticate = vi.fn()
    const onRemoveCredential = vi.fn()
    render(
      <AccountManagementSection
        providerId="claude"
        definition={definition}
        connected
        stale
        credentialStored
        onPing={onPing}
        onReauthenticate={onReauthenticate}
        onRemoveCredential={onRemoveCredential}
      />
    )

    expect(screen.getByText("Stale")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Ping now" }))
    fireEvent.click(screen.getByRole("button", { name: "Re-authenticate" }))
    fireEvent.click(screen.getByRole("button", { name: "Remove credential" }))

    expect(onPing).toHaveBeenCalledTimes(1)
    expect(onReauthenticate).toHaveBeenCalledTimes(1)
    expect(onRemoveCredential).toHaveBeenCalledTimes(1)
  })

  it("hides credential removal when no credential is stored", () => {
    render(
      <AccountManagementSection
        providerId="claude"
        definition={definition}
        connected={false}
        stale={false}
        credentialStored={false}
        onPing={vi.fn()}
        onReauthenticate={vi.fn()}
        onRemoveCredential={vi.fn()}
      />
    )

    expect(screen.getByText("Attention needed")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Remove credential" })).not.toBeInTheDocument()
  })
})
