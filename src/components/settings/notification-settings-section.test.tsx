import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NotificationSettingsSection } from "@/components/settings/notification-settings-section"

const { loadPreferencesMock, savePreferencesMock, loadEventsMock, clearEventsMock, listenMock } = vi.hoisted(() => ({
  loadPreferencesMock: vi.fn(),
  savePreferencesMock: vi.fn(),
  loadEventsMock: vi.fn(),
  clearEventsMock: vi.fn(),
  listenMock: vi.fn(),
}))

vi.mock("@/lib/notification-settings", () => ({
  loadNotificationPreferences: loadPreferencesMock,
  saveNotificationPreferences: savePreferencesMock,
  loadRecentUsageEvents: loadEventsMock,
  clearRecentUsageEvents: clearEventsMock,
  listenNotificationStateUpdated: listenMock,
}))

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
}))

const defaultPreferences = {
  enabled: false,
  quotaThresholds: [50, 75, 90],
  incidents: true,
  resets: true,
  quietHours: { enabled: false, start: "22:00", end: "07:00" },
}

describe("NotificationSettingsSection", () => {
  beforeEach(() => {
    loadPreferencesMock.mockResolvedValue(defaultPreferences)
    savePreferencesMock.mockResolvedValue(undefined)
    loadEventsMock.mockResolvedValue([])
    clearEventsMock.mockResolvedValue(undefined)
    listenMock.mockResolvedValue(() => {})
  })

  it("updates notification preferences from the settings controls", async () => {
    render(<NotificationSettingsSection />)
    await waitFor(() => expect(screen.getByText("Deliver Windows notifications")).toBeInTheDocument())

    fireEvent.click(screen.getAllByRole("checkbox")[2])
    await waitFor(() => expect(savePreferencesMock).toHaveBeenCalledWith(expect.objectContaining({ quotaThresholds: [50, 90] })))
    fireEvent.click(screen.getAllByRole("checkbox")[6])
    await waitFor(() => expect(savePreferencesMock).toHaveBeenCalledWith(expect.objectContaining({ quietHours: expect.objectContaining({ enabled: true }) })))
    fireEvent.change(screen.getByLabelText("Quiet hours start"), { target: { value: "23:00" } })
    await waitFor(() => expect(savePreferencesMock).toHaveBeenCalledWith(expect.objectContaining({ quietHours: expect.objectContaining({ start: "23:00" }) })))
    fireEvent.click(screen.getAllByRole("checkbox")[0])

    await waitFor(() => {
      expect(savePreferencesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
          quotaThresholds: [50, 90],
          quietHours: { enabled: true, start: "23:00", end: "07:00" },
        })
      )
    })
  })

  it("lists and clears recent events", async () => {
    loadEventsMock.mockResolvedValue([{ id: "event-1", title: "Claude", body: "90% used", createdAt: 1 }])
    render(<NotificationSettingsSection />)

    await waitFor(() => expect(screen.getByText("90% used")).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: "Clear" }))

    expect(clearEventsMock).toHaveBeenCalledTimes(1)
  })

  it("shows a save error", async () => {
    savePreferencesMock.mockRejectedValue(new Error("storage unavailable"))
    render(<NotificationSettingsSection />)

    await waitFor(() => expect(screen.getByText("Incidents and recovery")).toBeInTheDocument())
    fireEvent.click(screen.getAllByRole("checkbox")[4])

    await waitFor(() => expect(screen.getByText("Notification preferences could not be saved.")).toBeInTheDocument())
  })
})
