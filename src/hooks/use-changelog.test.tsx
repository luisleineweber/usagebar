import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { type Release, useChangelog } from "@/hooks/use-changelog"
import { PROJECT_RELEASE_TAG_API_URL_PREFIX, PROJECT_RELEASES_URL } from "@/lib/project-metadata"

describe("useChangelog", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn() as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("fetches a release by the exact current version tag", async () => {
    const release: Release = {
      id: 1,
      tag_name: "v1.2.3",
      name: "v1.2.3",
      body: "notes",
      published_at: "2024-01-02T00:00:00Z",
      html_url: `${PROJECT_RELEASES_URL}/tag/v1.2.3`,
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => release,
    })
    globalThis.fetch = fetchMock as typeof fetch

    const { result } = renderHook(() => useChangelog("v1.2.3"))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.error).toBeNull()
      expect(result.current.releases).toEqual([release])
    })

    expect(fetchMock).toHaveBeenCalledWith(`${PROJECT_RELEASE_TAG_API_URL_PREFIX}v1.2.3`)
  })

  it("falls back between prefixed and non-prefixed tags", async () => {
    const release: Release = {
      id: 2,
      tag_name: "v1.0.0",
      name: "v1.0.0",
      body: "older",
      published_at: "2023-01-01T00:00:00Z",
      html_url: `${PROJECT_RELEASES_URL}/tag/v1.0.0`,
    }

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => release })
    globalThis.fetch = fetchMock as typeof fetch

    const { result } = renderHook(() => useChangelog("1.0.0"))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.error).toBeNull()
      expect(result.current.releases).toEqual([release])
    })

    expect(fetchMock).toHaveBeenNthCalledWith(1, `${PROJECT_RELEASE_TAG_API_URL_PREFIX}v1.0.0`)
    expect(fetchMock).toHaveBeenNthCalledWith(2, `${PROJECT_RELEASE_TAG_API_URL_PREFIX}1.0.0`)
  })

  it("returns empty releases when neither tag variant exists", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) })
    globalThis.fetch = fetchMock as typeof fetch

    const { result } = renderHook(() => useChangelog("9.9.9"))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.error).toBeNull()
      expect(result.current.releases).toHaveLength(0)
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("sets an error on non-404 failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    globalThis.fetch = fetchMock as typeof fetch

    const { result } = renderHook(() => useChangelog("1.0.0"))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.releases).toHaveLength(0)
      expect(result.current.error).toBe("Failed to fetch releases")
    })
  })
})
