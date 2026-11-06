import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ProviderRuntimeStatus } from "./provider-runtime-status"
import type { ProbeErrorCategory } from "@/lib/plugin-types"

const error = "OpenCode Go API key invalid. Log into OpenCode Go again."

function renderStatus(
  tone: "error" | "success" = "error",
  label = error,
  errorCategory?: ProbeErrorCategory
) {
  render(
    <ProviderRuntimeStatus
      providerName="OpenCode Go"
      errorCategory={errorCategory}
      sourceLabel="Local credentials"
      lastSuccessAt={null}
      status={{ tone, label }}
      className=""
    />
  )
}

describe("ProviderRuntimeStatus agent instructions", () => {
  it.each([
    ["credentialMissing", "Credentials missing"],
    ["credentialUnavailable", "Credentials unavailable"],
    ["credentialUnreadable", "Credentials unreadable"],
    ["credentialInvalid", "Credentials invalid"],
    ["credentialExpired", "Credentials expired"],
    ["providerResponse", "Provider response error"],
    ["unknown", "Unknown"],
    ["private-value", "Unknown"],
  ])("copies only a known category label for %s", async (category, label) => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, "writeText")
    renderStatus("error", error, category as ProbeErrorCategory)
    await user.click(screen.getByRole("button", { name: "Copy instructions for an agent" }))
    expect(writeText.mock.calls[0][0]).toContain(`Error category: ${label}`)
    expect(writeText.mock.calls[0][0]).not.toContain("private-value")
  })

  it.each([
    "access_token%3Dprivate-value",
    "%7B%22api_key%22%3A%22private-value%22%7D",
    JSON.stringify(JSON.stringify({ token: "private-value" })),
    '{"token":"private-value"}',
    "access_token=private-token-value",
    '{"api_key":"private-api-key"}',
    "Cookie: session=private-cookie; other=private-other-cookie",
    "Authorization: Bearer private-bearer-value",
    "eyJhbGciOiJIUzI1NiJ9.privatepayload.privatesignature",
  ])("excludes provider error text from the clipboard: %s", async (message) => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, "writeText")
    renderStatus("error", `Provider request failed: ${message}`)
    await user.click(screen.getByRole("button", { name: "Copy instructions for an agent" }))
    const prompt = writeText.mock.calls[0][0]
    expect(prompt).not.toContain("Provider request failed")
    expect(prompt).not.toContain(message)
    expect(prompt).not.toContain("private")
  })

  it("copies a recovery task with provider context and confirms the copy", async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, "writeText")
    renderStatus()

    await user.click(screen.getByRole("button", { name: "Copy instructions for an agent" }))

    const prompt = writeText.mock.calls[0][0]
    expect(prompt).toContain("Provider: OpenCode Go")
    expect(prompt).toContain("Source: Local credentials")
    expect(prompt).not.toContain(error)
    expect(prompt).toContain("Status: Runtime status")
    expect(prompt).toContain("Error category: Unknown")
    expect(prompt).toContain("UsageBar settings")
    expect(prompt).toContain("Find the cause before making changes")
    expect(prompt).toContain("Never print or copy keys, tokens, or cookies")
    expect(prompt).toContain("Run the provider check again")
    expect(screen.getByText("Agent instructions copied.")).toBeInTheDocument()
  })

  it("shows a copy failure without a success message", async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(new Error("Clipboard denied"))
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    renderStatus()

    await user.click(screen.getByRole("button", { name: "Copy instructions for an agent" }))

    expect(screen.getByText("Could not copy instructions. Try again.")).toBeInTheDocument()
    expect(screen.queryByText("Agent instructions copied.")).not.toBeInTheDocument()
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })

  it("does not offer recovery instructions for a successful status", () => {
    renderStatus("success")
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })
})
