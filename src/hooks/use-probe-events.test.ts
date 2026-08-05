import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const { invokeMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
}))

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }))
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }))

import { useProbeEvents } from "@/hooks/use-probe-events"

describe("useProbeEvents", () => {
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
})
