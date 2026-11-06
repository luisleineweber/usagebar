import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SetupAssistant } from "@/components/settings/setup-assistant"

const { scanProviderSetup } = vi.hoisted(() => ({ scanProviderSetup: vi.fn() }))
vi.mock("@/lib/setup-scan", () => ({ scanProviderSetup }))

const checks = [
  {
    id: "kimi-cli-login",
    label: "Kimi CLI login",
    source: "Local file",
    description: "The file is checked locally.",
  },
  {
    id: "kimi-api-key",
    label: "Moonshot API key",
    source: "App vault or environment",
    description: "Only key presence is checked.",
  },
]

describe("SetupAssistant", () => {
  beforeEach(() => {
    scanProviderSetup.mockReset()
  })

  it("shows detection state and provenance without credential values", () => {
    render(
      <SetupAssistant
        checks={checks}
        detections={[
          { id: "kimi-cli-login", state: "found" },
          { id: "kimi-api-key", state: "missing" },
        ]}
        loading={false}
        providerId="kimi"
      />
    )

    expect(screen.getByText("Kimi CLI login")).toBeInTheDocument()
    expect(screen.getByText("Found")).toBeInTheDocument()
    expect(screen.getByText("Not found")).toBeInTheDocument()
    expect(screen.getAllByText(/Source:/i)).toHaveLength(2)
    expect(screen.getAllByText(/never uploaded/i)).toHaveLength(2)
  })

  it("reports pending checks while a probe runs and disables the scan action", () => {
    render(<SetupAssistant checks={checks} loading detections={undefined} providerId="kimi" />)

    expect(screen.getAllByText("Waiting for scan")).toHaveLength(2)
    const button = screen.getByRole("button", { name: "Scanning…" })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(scanProviderSetup).not.toHaveBeenCalled()
  })

  it("scans again through the local-only detector and shows its result", async () => {
    scanProviderSetup.mockResolvedValue([
      { id: "kimi-cli-login", state: "missing" },
      { id: "kimi-api-key", state: "found" },
    ])
    const instanceRef = { providerId: "kimi", instanceId: "profile-1" }
    render(
      <SetupAssistant
        checks={checks}
        loading={false}
        detections={[
          { id: "kimi-cli-login", state: "found" },
          { id: "kimi-api-key", state: "missing" },
        ]}
        providerId="kimi"
        instanceRef={instanceRef}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Scan again" }))

    expect(scanProviderSetup).toHaveBeenCalledWith("kimi", instanceRef)
    expect(
      await screen.findByRole("group", { name: "Moonshot API key: Found" })
    ).toBeInTheDocument()
    expect(screen.getByRole("group", { name: "Kimi CLI login: Not found" })).toBeInTheDocument()
  })

  it("shows a visible error when the local scan fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    scanProviderSetup.mockRejectedValue("setup scan timed out after 15s")
    render(<SetupAssistant checks={checks} loading={false} detections={[]} providerId="kimi" />)

    fireEvent.click(screen.getByRole("button", { name: "Scan again" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Setup scan failed: setup scan timed out after 15s"
    )
    await waitFor(() => expect(screen.getByRole("button", { name: "Scan again" })).toBeEnabled())
  })

  it("reports unavailable checks when a detector cannot provide a result", () => {
    render(<SetupAssistant checks={checks} loading={false} detections={[]} providerId="kimi" />)

    expect(screen.getAllByText("Could not inspect")).toHaveLength(2)
  })
})
