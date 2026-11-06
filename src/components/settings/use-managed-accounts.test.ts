import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useManagedAccounts } from "@/components/settings/use-managed-accounts"

const pinned = { profileId: "p1", label: "Work", email: "dev@example.com" }
const other = { profileId: "p2", label: "Home", email: null }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function setup(list: () => Promise<(typeof pinned)[]>) {
  const onConfigChange = vi.fn(async () => undefined)
  const api = { list, importCurrent: vi.fn(), remove: vi.fn() }
  const hook = renderHook(() =>
    useManagedAccounts({
      providerId: "claude",
      providerName: "Claude",
      api,
      config: { selectedAccountProfileId: "p1" },
      onConfigChange,
    })
  )
  return { ...hook, onConfigChange }
}

describe("useManagedAccounts", () => {
  it("keeps the pinned profile while the list is still loading", async () => {
    const response = deferred<(typeof pinned)[]>()
    const { result, onConfigChange } = setup(() => response.promise)

    // Before the list resolves, the selection is unknown and must not be cleared.
    expect(result.current.loading).toBe(true)
    expect(onConfigChange).not.toHaveBeenCalled()

    await act(async () => {
      response.resolve([pinned, other])
    })
    expect(result.current.profiles).toEqual([pinned, other])
    expect(onConfigChange).not.toHaveBeenCalled()
  })

  it("keeps the pinned profile after a failed list load", async () => {
    const response = deferred<(typeof pinned)[]>()
    const { result, onConfigChange } = setup(() => response.promise)

    await act(async () => {
      response.reject(new Error("vault locked"))
    })
    await waitFor(() => expect(result.current.error).toBe("vault locked"))
    expect(onConfigChange).not.toHaveBeenCalled()
  })

  it("clears the pinned profile when a successful list does not contain it", async () => {
    const { onConfigChange } = setup(async () => [other])

    await waitFor(() =>
      expect(onConfigChange).toHaveBeenCalledWith("claude", { selectedAccountProfileId: undefined })
    )
  })
})
