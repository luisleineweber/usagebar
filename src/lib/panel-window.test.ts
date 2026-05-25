import { beforeEach, describe, expect, it, vi } from "vitest"

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}))

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}))

import { showPanelForView, syncPanelView } from "@/lib/panel-window"

describe("panel-window", () => {
  beforeEach(() => {
    invokeMock.mockReset()
    invokeMock.mockResolvedValue(undefined)
  })

  describe("showPanelForView", () => {
    it("calls invoke with view parameter", async () => {
      await showPanelForView("home")
      expect(invokeMock).toHaveBeenCalledWith("show_panel_for_view", { view: "home" })
    })
  })

  describe("syncPanelView", () => {
    it("calls invoke with view parameter", async () => {
      await syncPanelView("codex")
      expect(invokeMock).toHaveBeenCalledWith("sync_panel_view", { view: "codex" })
    })
  })
})
