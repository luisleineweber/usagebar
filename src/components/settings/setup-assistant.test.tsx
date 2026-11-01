import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
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
      />
    )

    expect(screen.getByText("Kimi CLI login")).toBeInTheDocument()
    expect(screen.getByText("Found")).toBeInTheDocument()
    expect(screen.getByText("Not found")).toBeInTheDocument()
    expect(screen.getAllByText(/Source:/i)).toHaveLength(2)
    expect(screen.getAllByText(/never uploaded/i)).toHaveLength(2)
  })

  it("reports pending checks while a provider check runs, without its own check action", () => {
    render(<SetupAssistant checks={checks} loading detections={undefined} />)

    expect(screen.getAllByText("Waiting for check")).toHaveLength(2)
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("reports unavailable checks when a detector cannot provide a result", () => {
    render(<SetupAssistant checks={checks} loading={false} detections={[]} />)

    expect(screen.getAllByText("Could not inspect")).toHaveLength(2)
  })
})
