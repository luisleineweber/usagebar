import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { saveModelPriceOverridesMock } = vi.hoisted(() => ({
  saveModelPriceOverridesMock: vi.fn(),
}))

vi.mock("@/lib/report-pricing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/report-pricing")>()),
  saveModelPriceOverrides: saveModelPriceOverridesMock,
}))

import { ReportPricingEditor } from "@/components/report-pricing-editor"

describe("ReportPricingEditor", () => {
  beforeEach(() => {
    saveModelPriceOverridesMock.mockResolvedValue(undefined)
  })

  it("does not render without models", () => {
    const { container } = render(
      <ReportPricingEditor models={[]} overrides={{}} onChange={vi.fn()} />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it("loads an override, switches models, and saves valid prices", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <ReportPricingEditor
        models={["gpt-5", "gpt-4.1"]}
        overrides={{ "gpt-5": { inputPerMillion: 1.25, outputPerMillion: 10 } }}
        onChange={onChange}
      />
    )
    await user.click(screen.getByText("Model pricing overrides"))

    const input = screen.getByLabelText("Input price per million tokens")
    const output = screen.getByLabelText("Output price per million tokens")
    expect(input).toHaveValue(1.25)
    expect(output).toHaveValue(10)

    await user.selectOptions(screen.getByLabelText("Pricing override model"), "gpt-4.1")
    await waitFor(() => expect(input).toHaveValue(null))
    await user.type(input, "2")
    await user.type(output, "8")
    await user.click(screen.getByRole("button", { name: "Save price" }))

    const next = {
      "gpt-5": { inputPerMillion: 1.25, outputPerMillion: 10 },
      "gpt-4.1": { inputPerMillion: 2, outputPerMillion: 8 },
    }
    expect(onChange).toHaveBeenCalledWith(next)
    await waitFor(() => expect(saveModelPriceOverridesMock).toHaveBeenCalledWith(next))
  })

  it("does not save incomplete numeric input", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ReportPricingEditor models={["gpt-5"]} overrides={{}} onChange={onChange} />)
    await user.click(screen.getByText("Model pricing overrides"))

    await user.type(screen.getByLabelText("Input price per million tokens"), "2")
    await user.click(screen.getByRole("button", { name: "Save price" }))

    expect(onChange).not.toHaveBeenCalled()
    expect(saveModelPriceOverridesMock).not.toHaveBeenCalled()
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter non-negative input and output prices."
    )
    expect(screen.getByLabelText("Output price per million tokens")).toHaveAttribute(
      "aria-describedby",
      "pricing-override-error"
    )
  })

  it("does not save negative prices", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ReportPricingEditor models={["gpt-5"]} overrides={{}} onChange={onChange} />)
    await user.click(screen.getByText("Model pricing overrides"))

    await user.type(screen.getByLabelText("Input price per million tokens"), "-1")
    await user.type(screen.getByLabelText("Output price per million tokens"), "8")
    await user.click(screen.getByRole("button", { name: "Save price" }))

    expect(onChange).not.toHaveBeenCalled()
    expect(saveModelPriceOverridesMock).not.toHaveBeenCalled()
    expect(screen.getByRole("alert")).toBeInTheDocument()
  })

  it("does not save non-finite prices", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ReportPricingEditor models={["gpt-5"]} overrides={{}} onChange={onChange} />)
    await user.click(screen.getByText("Model pricing overrides"))

    fireEvent.change(screen.getByLabelText("Input price per million tokens"), {
      target: { value: "1e309" },
    })
    await user.type(screen.getByLabelText("Output price per million tokens"), "8")
    await user.click(screen.getByRole("button", { name: "Save price" }))

    expect(onChange).not.toHaveBeenCalled()
    expect(saveModelPriceOverridesMock).not.toHaveBeenCalled()
    expect(screen.getByRole("alert")).toBeInTheDocument()
  })

  it("clears the selected model override", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <ReportPricingEditor
        models={["gpt-5", "gpt-4.1"]}
        overrides={{
          "gpt-5": { inputPerMillion: 1.25, outputPerMillion: 10 },
          "gpt-4.1": { inputPerMillion: 2, outputPerMillion: 8 },
        }}
        onChange={onChange}
      />
    )
    await user.click(screen.getByText("Model pricing overrides"))
    await user.click(screen.getByRole("button", { name: "Use source price" }))

    const next = { "gpt-4.1": { inputPerMillion: 2, outputPerMillion: 8 } }
    expect(onChange).toHaveBeenCalledWith(next)
    await waitFor(() => expect(saveModelPriceOverridesMock).toHaveBeenCalledWith(next))
  })

  it("selects the first available model after the model list changes", async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <ReportPricingEditor models={["gpt-5"]} overrides={{}} onChange={vi.fn()} />
    )
    await user.click(screen.getByText("Model pricing overrides"))

    rerender(<ReportPricingEditor models={["gpt-4.1"]} overrides={{}} onChange={vi.fn()} />)

    await waitFor(() =>
      expect(screen.getByLabelText("Pricing override model")).toHaveValue("gpt-4.1")
    )
  })
})
