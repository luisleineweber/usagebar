import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import {
  AccountManagementSection,
  hasManagedAccounts,
} from "@/components/settings/account-management-section"
import { getProviderSettingsDefinition } from "@/lib/provider-settings"

vi.mock("@/components/settings/codex-accounts-section", () => ({
  CodexAccountsSection: () => <p>Codex accounts</p>,
}))
vi.mock("@/components/settings/provider-accounts-section", () => ({
  ProviderAccountsSection: ({ providerName }: { providerName: string }) => (
    <p>{providerName} accounts</p>
  ),
}))

describe("AccountManagementSection", () => {
  it("shows only the account list, without a second connection state", () => {
    render(<AccountManagementSection className="" providerId="claude" providerName="Claude" />)

    expect(screen.getByText("Claude accounts")).toBeInTheDocument()
    expect(screen.queryByText("Account & Connection")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /re-authenticate/i })).not.toBeInTheDocument()
  })

  it("uses the Codex account list for Codex", () => {
    render(<AccountManagementSection className="" providerId="codex" providerName="Codex" />)

    expect(screen.getByText("Codex accounts")).toBeInTheDocument()
  })

  it("is available only for providers with managed accounts", () => {
    expect(hasManagedAccounts(getProviderSettingsDefinition("claude"))).toBe(true)
    expect(hasManagedAccounts(getProviderSettingsDefinition("openrouter"))).toBe(false)
  })
})
