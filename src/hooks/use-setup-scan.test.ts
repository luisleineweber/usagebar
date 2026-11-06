import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SetupDetection } from "@/lib/plugin-types"

const { scanProviderSetup, stateUpdates } = vi.hoisted(() => ({
  scanProviderSetup: vi.fn(),
  stateUpdates: { count: 0 },
}))

vi.mock("@/lib/setup-scan", () => ({ scanProviderSetup }))

// Count every state setter call of the hook, so a test can prove that no update happens.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>()
  return {
    ...actual,
    useState: <T>(initial: T | (() => T)) => {
      const [value, setValue] = actual.useState(initial)
      const countedSetValue: typeof setValue = (next) => {
        stateUpdates.count += 1
        setValue(next)
      }
      return [value, countedSetValue] as const
    },
  }
})

const { useSetupScan } = await import("@/hooks/use-setup-scan")

const noProbeDetections: SetupDetection[] = []
const found: SetupDetection[] = [{ id: "kimi-api-key", state: "found" }]

function deferredScan() {
  let resolve: (detections: SetupDetection[]) => void = () => {}
  // Tauri invoke rejects with the command's error string.
  let reject: (message: string) => void = () => {}
  scanProviderSetup.mockImplementationOnce(
    () =>
      new Promise<SetupDetection[]>((done, fail) => {
        resolve = done
        reject = fail
      })
  )
  return {
    resolve: (value: SetupDetection[]) => resolve(value),
    reject: (message: string) => reject(message),
  }
}

function renderScan(accountId: string) {
  return renderHook(
    (props: { accountId: string }) =>
      useSetupScan({
        providerId: "kimi",
        accountId: props.accountId,
        probeDetections: noProbeDetections,
      }),
    { initialProps: { accountId } }
  )
}

describe("useSetupScan", () => {
  beforeEach(() => {
    scanProviderSetup.mockReset()
    stateUpdates.count = 0
  })

  it("does not keep a stale scan pending after a switch from A to B and back to A", async () => {
    const staleScan = deferredScan()
    const { result, rerender } = renderScan("account-a")

    act(() => {
      void result.current.scan()
    })
    expect(result.current.scanning).toBe(true)

    rerender({ accountId: "account-b" })
    rerender({ accountId: "account-a" })
    expect(result.current.scanning).toBe(false)

    scanProviderSetup.mockResolvedValueOnce(found)
    await act(async () => {
      await result.current.scan()
    })
    expect(scanProviderSetup).toHaveBeenCalledTimes(2)
    expect(result.current.scanning).toBe(false)
    expect(result.current.detections).toEqual(found)

    // The invalidated first scan finishes last and must not replace the new result.
    await act(async () => staleScan.resolve([{ id: "kimi-api-key", state: "missing" }]))
    expect(result.current.detections).toEqual(found)
  })

  it("changes no state when a scan resolves after unmount", async () => {
    const lateScan = deferredScan()
    const { result, unmount } = renderScan("account-a")
    act(() => {
      void result.current.scan()
    })

    unmount()
    stateUpdates.count = 0
    await act(async () => lateScan.resolve(found))

    expect(stateUpdates.count).toBe(0)
  })

  it("changes no state when a scan fails after unmount", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const lateScan = deferredScan()
    const { result, unmount } = renderScan("account-a")
    act(() => {
      void result.current.scan()
    })

    unmount()
    stateUpdates.count = 0
    await act(async () => lateScan.reject("setup scan timed out after 15s"))

    expect(stateUpdates.count).toBe(0)
    expect(consoleError).toHaveBeenCalledWith(
      "Setup scan failed:",
      "setup scan timed out after 15s"
    )
    consoleError.mockRestore()
  })
})
