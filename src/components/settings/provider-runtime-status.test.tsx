import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ProviderRuntimeStatus } from "./provider-runtime-status"

const error = "OpenCode Go API key invalid. Log into OpenCode Go again."

function renderStatus(tone: "error" | "success" = "error") {
  render(
    <ProviderRuntimeStatus
      providerName="OpenCode Go"
      sourceLabel="Local credentials"
      lastSuccessAt={null}
      status={{ tone, label: error }}
      className=""
    />
  )
}

describe("ProviderRuntimeStatus agent instructions", () => {
  it("copies a recovery task with provider context and confirms the copy", async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, "writeText")
    renderStatus()

    await user.click(screen.getByRole("button", { name: "Copy instructions for an agent" }))

    const prompt = writeText.mock.calls[0][0]
    expect(prompt).toContain("Provider: OpenCode Go")
    expect(prompt).toContain("Source: Local credentials")
    expect(prompt).toContain(error)
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
