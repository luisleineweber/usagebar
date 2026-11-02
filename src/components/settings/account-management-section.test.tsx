import type { ComponentProps } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AccountManagementSection } from "@/components/settings/account-management-section"
import { getProviderSettingsDefinition } from "@/lib/provider-settings"

vi.mock("@/components/settings/codex-accounts-section", () => ({
  CodexAccountsSection: () => null,
}))
vi.mock("@/components/settings/provider-accounts-section", () => ({
  ProviderAccountsSection: () => null,
}))

const openrouter = getProviderSettingsDefinition("openrouter")

function renderSection(props: Partial<ComponentProps<typeof AccountManagementSection>> = {}) {
  const onReauthenticate = vi.fn()
  const onRemoveCredential = vi.fn()
  render(
    <AccountManagementSection
      providerId="openrouter"
      providerName="OpenRouter"
      definition={openrouter}
      connectionState="connected"
      unsupportedMessage="Coming soon on Windows."
      stale={false}
      credentialStored
      onReauthenticate={onReauthenticate}
      onRemoveCredential={onRemoveCredential}
      {...props}
    />
  )
  return { onReauthenticate, onRemoveCredential }
}

describe("AccountManagementSection", () => {
  it("shows credential actions when an app-stored credential exists", () => {
    const { onReauthenticate, onRemoveCredential } = renderSection({ stale: true })

    expect(screen.getByText("Connected")).toBeInTheDocument()
    expect(screen.getByText(/more than 30 minutes ago/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Re-authenticate" }))
    fireEvent.click(screen.getByRole("button", { name: "Remove credential" }))

    expect(onReauthenticate).toHaveBeenCalledTimes(1)
    expect(onRemoveCredential).toHaveBeenCalledTimes(1)
  })

  it("offers no re-authentication or removal without a stored credential", () => {
    renderSection({ connectionState: "setupNeeded", credentialStored: false })

    expect(screen.getByText("Setup needed")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Re-authenticate" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Remove credential" })).not.toBeInTheDocument()
  })

  it.each([
    ["error", "Error"],
    ["disabled", "Disabled"],
  ] as const)("reuses the shared %s state label", (connectionState, label) => {
    renderSection({ connectionState })

    expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.queryByText("Attention needed")).not.toBeInTheDocument()
  })

  it("has no separate check action because the header owns it", () => {
    renderSection()

    expect(screen.queryByRole("button", { name: /ping|retry|check/i })).not.toBeInTheDocument()
  })
})
