import { describe, expect, it, vi } from "vitest"

const renderMock = vi.fn()
const createRootMock = vi.fn(() => ({ render: renderMock }))

vi.mock("react-dom/client", () => ({
  default: {
    createRoot: createRootMock,
  },
}))

vi.mock("@tauri-apps/plugin-log", () => ({
  error: vi.fn(() => Promise.resolve()),
  warn: vi.fn(() => Promise.resolve()),
}))

vi.mock("@/App", () => ({
  App: () => "app",
}))

vi.mock("@/settings-window-app", () => ({
  SettingsWindowApp: () => "settings",
}))

describe("main", () => {
  it("mounts app", async () => {
    vi.resetModules()
    document.body.innerHTML = '<div id="root"></div>'
    await import("@/main")
    expect(createRootMock).toHaveBeenCalled()
    expect(renderMock).toHaveBeenCalled()
  }, 10000)
})
