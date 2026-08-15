import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ProviderDetailSchema } from "@/components/provider-detail-schema"

describe("ProviderDetailSchema", () => {
  it("renders fields in manifest order without provider-specific branches", () => {
    render(
      <ProviderDetailSchema
        schema={{
          sections: [
            {
              id: "account",
              label: "Account",
              fields: [
                { id: "email", label: "Email", type: "text", visibility: "ifPresent" },
                { id: "status", label: "Status", type: "badge", visibility: "ifPresent" },
              ],
            },
          ],
        }}
        values={[
          { id: "status", type: "badge", text: "Connected" },
          { id: "email", type: "text", value: "user@example.com" },
        ]}
        displayMode="used"
        resetTimerDisplayMode="relative"
      />
    )

    expect(screen.getByRole("heading", { name: "Account" })).toBeInTheDocument()
    expect(screen.getByText("user@example.com")).toBeInTheDocument()
    expect(screen.getByText("Connected")).toBeInTheDocument()
  })

  it("renders a declared quota window and ignores an undeclared value", () => {
    render(
      <ProviderDetailSchema
        schema={{
          sections: [
            {
              id: "quota",
              label: "Quota",
              fields: [
                {
                  id: "monthly",
                  label: "Monthly",
                  type: "window",
                  visibility: "ifPresent",
                },
              ],
            },
          ],
        }}
        values={[
          {
            id: "monthly",
            type: "window",
            used: 25,
            limit: 100,
            format: { kind: "percent" },
          },
          { id: "ignored", type: "text", value: "not shown" },
        ]}
        displayMode="used"
        resetTimerDisplayMode="relative"
      />
    )

    expect(screen.getByText("Monthly")).toBeInTheDocument()
    expect(screen.getByText("25% used")).toBeInTheDocument()
    expect(screen.queryByText("not shown")).not.toBeInTheDocument()
  })

  it("keeps zero, unknown, and unsupported quota windows distinct", () => {
    render(
      <ProviderDetailSchema
        schema={{
          sections: [
            {
              id: "quota",
              label: "Quota",
              fields: [
                { id: "zero", label: "Zero", type: "window", visibility: "ifPresent" },
                { id: "unknown", label: "Unknown", type: "window", visibility: "ifPresent" },
                {
                  id: "unsupported",
                  label: "Unsupported",
                  type: "window",
                  visibility: "ifPresent",
                },
              ],
            },
          ],
        }}
        values={[
          { id: "zero", type: "window", used: 0, limit: 100, format: { kind: "percent" } },
          { id: "unknown", type: "window", used: null, limit: 100, format: { kind: "percent" } },
          {
            id: "unsupported",
            type: "window",
            used: null,
            limit: null,
            availability: "unsupported",
            format: { kind: "percent" },
          },
        ]}
        displayMode="used"
        resetTimerDisplayMode="relative"
      />
    )

    expect(screen.getByText("0% used")).toBeInTheDocument()
    expect(screen.getByTitle("Unknown")).toHaveTextContent("—")
    expect(screen.getByTitle("Not available")).toHaveTextContent("Not available")
  })
})
