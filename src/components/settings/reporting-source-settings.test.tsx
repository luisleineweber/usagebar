import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ReportingSourceSettings } from "@/components/settings/reporting-source-settings"

describe("ReportingSourceSettings", () => {
  it("saves path, pricing mode, and offline pricing changes", async () => {
    const onConfigChange = vi.fn().mockResolvedValue(undefined)
    render(
      <ReportingSourceSettings
        providerId="claude"
        config={{ pricingMode: "auto" }}
        onConfigChange={onConfigChange}
      />
    )

    fireEvent.change(screen.getByRole("textbox", { name: "claude custom history path" }), {
      target: { value: " C:\\custom\\history " },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    fireEvent.change(screen.getByRole("combobox", { name: "claude pricing source" }), {
      target: { value: "calculate" },
    })
    fireEvent.click(screen.getByRole("checkbox"))

    await waitFor(() => {
      expect(onConfigChange).toHaveBeenCalledWith("claude", { historyPath: "C:\\custom\\history" })
      expect(onConfigChange).toHaveBeenCalledWith("claude", { pricingMode: "calculate" })
      expect(onConfigChange).toHaveBeenCalledWith("claude", { offlinePricing: "enabled" })
    })
  })

  it("shows save failures", async () => {
    const onConfigChange = vi.fn().mockRejectedValue(new Error("write failed"))
    render(<ReportingSourceSettings providerId="codex" onConfigChange={onConfigChange} />)

    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(screen.getByText("Reporting settings could not be saved.")).toBeInTheDocument())
  })
})
