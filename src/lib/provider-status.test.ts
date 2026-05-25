import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  fetchProviderStatus,
  hasProviderStatusIssue,
  normalizeStatusPageUrl,
  providerStatusLabel,
  type ProviderStatus,
} from "@/lib/provider-status"

describe("provider status helpers", () => {
  it("normalizes statuspage browser urls to the API endpoint", () => {
    expect(normalizeStatusPageUrl("https://status.openai.com/")).toBe(
      "https://status.openai.com/api/v2/status.json"
    )
    expect(normalizeStatusPageUrl("https://status.cursor.com")).toBe(
      "https://status.cursor.com/api/v2/status.json"
    )
  })

  it("normalizes url without trailing slash", () => {
    expect(normalizeStatusPageUrl("https://status.example.com")).toBe(
      "https://status.example.com/api/v2/status.json"
    )
  })

  it("returns null for invalid URLs", () => {
    expect(normalizeStatusPageUrl("not-a-url")).toBeNull()
    expect(normalizeStatusPageUrl("")).toBeNull()
  })

  it("returns null for non-http protocols", () => {
    expect(normalizeStatusPageUrl("ftp://status.example.com")).toBeNull()
  })

  it("accepts http URLs", () => {
    expect(normalizeStatusPageUrl("http://status.example.com")).toBe(
      "http://status.example.com/api/v2/status.json"
    )
  })

  it("strips search and hash from input URL", () => {
    expect(normalizeStatusPageUrl("https://status.example.com?page=1#section")).toBe(
      "https://status.example.com/api/v2/status.json"
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

describe("hasProviderStatusIssue", () => {
  it("returns false for undefined status", () => {
    expect(hasProviderStatusIssue(undefined)).toBe(false)
  })

  it("returns false for none indicator", () => {
    expect(hasProviderStatusIssue({ indicator: "none", description: null, updatedAt: null, checkedAt: 1 })).toBe(false)
  })

  it("returns true for minor indicator", () => {
    expect(hasProviderStatusIssue({ indicator: "minor", description: null, updatedAt: null, checkedAt: 1 })).toBe(true)
  })

  it("returns true for major indicator", () => {
    expect(hasProviderStatusIssue({ indicator: "major", description: null, updatedAt: null, checkedAt: 1 })).toBe(true)
  })

  it("returns true for maintenance indicator", () => {
    expect(hasProviderStatusIssue({ indicator: "maintenance", description: null, updatedAt: null, checkedAt: 1 })).toBe(true)
  })

  it("returns true for unknown indicator", () => {
    expect(hasProviderStatusIssue({ indicator: "unknown", description: null, updatedAt: null, checkedAt: 1 })).toBe(true)
  })
})

describe("providerStatusLabel", () => {
  it("returns null for undefined status", () => {
    expect(providerStatusLabel(undefined)).toBeNull()
  })

  it("returns null for none indicator", () => {
    expect(providerStatusLabel({ indicator: "none", description: null, updatedAt: null, checkedAt: 1 })).toBeNull()
  })

  it("returns null for none indicator with description", () => {
    expect(providerStatusLabel({
      indicator: "none",
      description: "All systems operational",
      updatedAt: null,
      checkedAt: 1,
    })).toBeNull()
  })

  it("returns maintenance label for maintenance indicator without description", () => {
    expect(providerStatusLabel({
      indicator: "maintenance",
      description: null,
      updatedAt: null,
      checkedAt: 1,
    })).toBe("Maintenance in progress")
  })

  it("returns major incident label", () => {
    expect(providerStatusLabel({
      indicator: "major",
      description: null,
      updatedAt: null,
      checkedAt: 1,
    })).toBe("Major incident")
  })

  it("returns minor incident label", () => {
    expect(providerStatusLabel({
      indicator: "minor",
      description: null,
      updatedAt: null,
      checkedAt: 1,
    })).toBe("Minor incident")
  })

  it("returns unknown label for unknown indicator", () => {
    expect(providerStatusLabel({
      indicator: "unknown",
      description: null,
      updatedAt: null,
      checkedAt: 1,
    })).toBe("Status unknown")
  })

  it("returns trimmed description when present", () => {
    expect(providerStatusLabel({
      indicator: "maintenance",
      description: "  Planned downtime  ",
      updatedAt: null,
      checkedAt: 1,
    })).toBe("Planned downtime")
  })
})

describe("fetchProviderStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-05-24T12:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns null when plugin has no statusPageUrl", async () => {
    const result = await fetchProviderStatus({})
    expect(result).toBeNull()
  })

  it("returns null when statusPageUrl is empty", async () => {
    const result = await fetchProviderStatus({ statusPageUrl: "" })
    expect(result).toBeNull()
  })

  it("returns null when statusPageUrl is invalid", async () => {
    const result = await fetchProviderStatus({ statusPageUrl: "not-a-url" })
    expect(result).toBeNull()
  })

  it("fetches and normalizes a successful status response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        status: {
          indicator: "minor",
          description: "Elevated error rates",
        },
        page: {
          updated_at: "2026-05-24T11:00:00Z",
        },
      }),
    })
    vi.stubGlobal("fetch", mockFetch)

    const result = await fetchProviderStatus({ statusPageUrl: "https://status.example.com" })

    expect(result).not.toBeNull()
    expect(result!.indicator).toBe("minor")
    expect(result!.description).toBe("Elevated error rates")
    expect(result!.checkedAt).toBe(Date.now())
    expect(result!.updatedAt).not.toBeNull()
    expect(mockFetch).toHaveBeenCalledWith(
      "https://status.example.com/api/v2/status.json",
      { headers: { accept: "application/json" }, cache: "no-store" }
    )

    vi.unstubAllGlobals()
  })

  it("normalizes unknown indicator to unknown", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        status: {
          indicator: "degraded_performance",
          description: null,
        },
      }),
    })
    vi.stubGlobal("fetch", mockFetch)

    const result = await fetchProviderStatus({ statusPageUrl: "https://status.example.com" })

    expect(result!.indicator).toBe("unknown")
    expect(result!.description).toBeNull()

    vi.unstubAllGlobals()
  })

  it("throws on non-ok response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    })
    vi.stubGlobal("fetch", mockFetch)

    await expect(
      fetchProviderStatus({ statusPageUrl: "https://status.example.com" })
    ).rejects.toThrow("Status API returned 503")

    vi.unstubAllGlobals()
  })

  it("handles missing page.updated_at", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        status: {
          indicator: "none",
          description: "All systems operational",
        },
      }),
    })
    vi.stubGlobal("fetch", mockFetch)

    const result = await fetchProviderStatus({ statusPageUrl: "https://status.example.com" })

    expect(result!.updatedAt).toBeNull()

    vi.unstubAllGlobals()
  })

  it("handles null page.updated_at", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        status: {
          indicator: "none",
          description: null,
        },
        page: {
          updated_at: null,
        },
      }),
    })
    vi.stubGlobal("fetch", mockFetch)

    const result = await fetchProviderStatus({ statusPageUrl: "https://status.example.com" })

    expect(result!.updatedAt).toBeNull()

    vi.unstubAllGlobals()
  })
})
