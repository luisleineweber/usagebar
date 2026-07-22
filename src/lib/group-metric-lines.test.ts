import { describe, expect, it } from "vitest"
import { groupMetricLines } from "@/lib/group-metric-lines"

describe("groupMetricLines", () => {
  it("keeps the typed section labels while ordering populated sections", () => {
    const sections = groupMetricLines([
      {
        type: "text",
        label: "Account",
        value: "team@example.com",
      },
      {
        type: "progress",
        label: "Monthly quota",
        used: 25,
        limit: 100,
        format: { kind: "percent" },
      },
      { type: "badge", label: "Region", text: "EU" },
    ])

    expect(sections.map((section) => section.label)).toEqual(["Quota", "Account & plan", "Details"])
  })
})
