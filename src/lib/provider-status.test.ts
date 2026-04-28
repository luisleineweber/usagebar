import { describe, expect, it } from "vitest"
import { normalizeStatusPageUrl, providerStatusLabel, type ProviderStatus } from "@/lib/provider-status"

describe("provider status helpers", () => {
  it("normalizes statuspage browser urls to the API endpoint", () => {
    expect(normalizeStatusPageUrl("https://status.openai.com/")).toBe(
      "https://status.openai.com/api/v2/status.json"
    )
    expect(normalizeStatusPageUrl("https://status.cursor.com")).toBe(
      "https://status.cursor.com/api/v2/status.json"
    )
  })

  it("uses provider descriptions before generic incident labels", () => {
    const status: ProviderStatus = {
      indicator: "major",
      description: "Elevated errors",
      updatedAt: null,
      checkedAt: 1,
    }

    expect(providerStatusLabel(status)).toBe("Elevated errors")
    expect(providerStatusLabel({ ...status, description: null })).toBe("Major incident")
  })
})
