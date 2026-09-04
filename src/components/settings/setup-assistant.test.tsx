import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { SetupAssistant } from "@/components/settings/setup-assistant"

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
  it("shows detection state and provenance without credential values", () => {
    render(
      <SetupAssistant
        checks={checks}
        detections={[
          { id: "kimi-cli-login", state: "found" },
          { id: "kimi-api-key", state: "missing" },
        ]}
        loading={false}
        onScan={vi.fn()}
      />
    )

    expect(screen.getByText("Kimi CLI login")).toBeInTheDocument()
    expect(screen.getByText("Found")).toBeInTheDocument()
    expect(screen.getByText("Not found")).toBeInTheDocument()
    expect(screen.getAllByText(/Source:/i)).toHaveLength(2)
    expect(screen.getAllByText(/never uploaded/i)).toHaveLength(2)
  })

  it("reports pending checks while scanning and disables the scan action", () => {
    const onScan = vi.fn()
    render(<SetupAssistant checks={checks} loading detections={undefined} onScan={onScan} />)

    expect(screen.getAllByText("Waiting for scan")).toHaveLength(2)
    const button = screen.getByRole("button", { name: "Scanning…" })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onScan).not.toHaveBeenCalled()
  })

  it("reports unavailable checks when a detector cannot provide a result", () => {
    render(<SetupAssistant checks={checks} loading={false} detections={[]} />)

    expect(screen.getAllByText("Could not inspect")).toHaveLength(2)
  })
})
