import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { invokeMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
}))

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }))
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }))

import { useProbeEvents } from "@/hooks/use-probe-events"

describe("useProbeEvents", () => {
  beforeEach(() => {
    listenMock.mockResolvedValue(() => {})
  })

  it("sends provider instance refs in camelCase probe requests", async () => {
    listenMock.mockResolvedValue(() => {})
    invokeMock.mockResolvedValue({
      batchId: "batch-1",
      pluginIds: ["codex"],
      instanceRefs: [{ providerId: "codex", instanceId: "profile-a" }],
    })
    const { result } = renderHook(() =>
      useProbeEvents({ onResult: vi.fn(), onBatchComplete: vi.fn() })
    )

    await act(async () => {
      await result.current.startBatch(["codex"], [{ providerId: "codex", instanceId: "profile-a" }])
    })

    expect(invokeMock).toHaveBeenCalledWith(
      "start_probe_batch",
      expect.objectContaining({
        pluginIds: ["codex"],
        instanceRefs: [{ providerId: "codex", instanceId: "profile-a" }],
      })
    )
  })

  it("routes only events for the active batch", async () => {
    const handlers = new Map<string, (event: { payload: unknown }) => void>()
    const unlistenResult = vi.fn()
    const unlistenComplete = vi.fn()
    listenMock.mockImplementation(async (name, handler) => {
      handlers.set(name, handler)
      return name === "probe:result" ? unlistenResult : unlistenComplete
    })
    invokeMock.mockImplementation(async (_command, args) => ({
      batchId: args.batchId,
      pluginIds: ["codex"],
      instanceRefs: [],
    }))
    const onResult = vi.fn()
    const onBatchComplete = vi.fn()
    const { result, unmount } = renderHook(() => useProbeEvents({ onResult, onBatchComplete }))

    let batchId = ""
    await act(async () => {
      await result.current.startBatch(["codex"])
      batchId = invokeMock.mock.calls[0][1].batchId
    })
    const output = { providerId: "codex", displayName: "Codex", lines: [], iconUrl: "" }
    act(() => {
      handlers.get("probe:result")?.({ payload: { batchId: "other", output } })
      handlers.get("probe:batch-complete")?.({ payload: { batchId: "other" } })
      handlers.get("probe:result")?.({ payload: { batchId, output } })
      handlers.get("probe:batch-complete")?.({ payload: { batchId } })
      handlers.get("probe:batch-complete")?.({ payload: { batchId } })
    })

    expect(onResult).toHaveBeenCalledOnce()
    expect(onResult).toHaveBeenCalledWith(output)
    expect(onBatchComplete).toHaveBeenCalledOnce()
    unmount()
    expect(unlistenResult).toHaveBeenCalledOnce()
    expect(unlistenComplete).toHaveBeenCalledOnce()
  })

  it("removes a failed batch before later events arrive", async () => {
    const handlers = new Map<string, (event: { payload: unknown }) => void>()
    listenMock.mockImplementation(async (name, handler) => {
      handlers.set(name, handler)
      return () => {}
    })
    invokeMock.mockRejectedValue(new Error("probe failed"))
    const onResult = vi.fn()
    const { result } = renderHook(() => useProbeEvents({ onResult, onBatchComplete: vi.fn() }))

    await expect(
      act(async () => {
        await result.current.startBatch()
      })
    ).rejects.toThrow("probe failed")
    const batchId = invokeMock.mock.calls[0][1].batchId
    act(() => {
      handlers.get("probe:result")?.({
        payload: { batchId, output: { providerId: "codex", lines: [] } },
      })
    })
    expect(onResult).not.toHaveBeenCalled()
  })

  it("disposes a result listener that resolves after unmount", async () => {
    let resolveListen!: (unlisten: () => void) => void
    const lateListener = new Promise<() => void>((resolve) => {
      resolveListen = resolve
    })
    const unlisten = vi.fn()
    listenMock.mockReturnValueOnce(lateListener)
    const { unmount } = renderHook(() =>
      useProbeEvents({ onResult: vi.fn(), onBatchComplete: vi.fn() })
    )

    unmount()
    resolveListen(unlisten)
    await waitFor(() => expect(unlisten).toHaveBeenCalledOnce())
    expect(listenMock).toHaveBeenCalledTimes(1)
  })
})
