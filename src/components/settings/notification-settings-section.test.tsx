import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NotificationSettingsSection } from "@/components/settings/notification-settings-section"

const {
  clearEventsMock,
  isPermissionGrantedMock,
  isTauriMock,
  listenMock,
  loadEventsMock,
  loadPreferencesMock,
  requestPermissionMock,
  savePreferencesMock,
} = vi.hoisted(() => ({
  clearEventsMock: vi.fn(),
  isPermissionGrantedMock: vi.fn(),
  isTauriMock: vi.fn(),
  listenMock: vi.fn(),
  loadEventsMock: vi.fn(),
  loadPreferencesMock: vi.fn(),
  requestPermissionMock: vi.fn(),
  savePreferencesMock: vi.fn(),
}))

vi.mock("@tauri-apps/api/core", () => ({ isTauri: isTauriMock }))

vi.mock("@/lib/notification-settings", () => ({
  loadNotificationPreferences: loadPreferencesMock,
  saveNotificationPreferences: savePreferencesMock,
  loadRecentUsageEvents: loadEventsMock,
  clearRecentUsageEvents: clearEventsMock,
  listenNotificationStateUpdated: listenMock,
}))

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: isPermissionGrantedMock,
  requestPermission: requestPermissionMock,
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
    vi.clearAllMocks()
    isTauriMock.mockReturnValue(false)
    isPermissionGrantedMock.mockResolvedValue(true)
    requestPermissionMock.mockResolvedValue("granted")
    loadPreferencesMock.mockResolvedValue(defaultPreferences)
    savePreferencesMock.mockResolvedValue(undefined)
    loadEventsMock.mockResolvedValue([])
    clearEventsMock.mockResolvedValue(undefined)
    listenMock.mockResolvedValue(() => {})
  })

  it("updates quota thresholds by accessible name", async () => {
    const user = userEvent.setup()
    render(<NotificationSettingsSection />)
    const threshold = await screen.findByRole("checkbox", { name: "75% used" })
    await waitFor(() => expect(threshold).toBeChecked())

    await user.click(threshold)
    await waitFor(() =>
      expect(savePreferencesMock).toHaveBeenCalledWith(
        expect.objectContaining({ quotaThresholds: [50, 90] })
      )
    )
  })

  it("updates quiet hours after initialization", async () => {
    const user = userEvent.setup()
    render(<NotificationSettingsSection />)

    const quietHours = await screen.findByRole("checkbox", { name: "Quiet hours" })
    await waitFor(() => expect(quietHours).not.toBeChecked())
    await user.click(quietHours)
    await waitFor(() =>
      expect(savePreferencesMock).toHaveBeenCalledWith(
        expect.objectContaining({ quietHours: expect.objectContaining({ enabled: true }) })
      )
    )
    const start = screen.getByLabelText("Quiet hours start")
    fireEvent.change(start, { target: { value: "23:00" } })
    await waitFor(() =>
      expect(savePreferencesMock).toHaveBeenCalledWith(
        expect.objectContaining({ quietHours: expect.objectContaining({ start: "23:00" }) })
      )
    )
  })

  it("enables delivery after initialization", async () => {
    const user = userEvent.setup()
    render(<NotificationSettingsSection />)

    const delivery = await screen.findByRole("checkbox", {
      name: "Deliver Windows notifications",
    })
    await waitFor(() => expect(delivery).not.toBeChecked())
    await user.click(delivery)

    await waitFor(() => {
      expect(savePreferencesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
        })
      )
    })
  })

  it("lists and clears recent events", async () => {
    const user = userEvent.setup()
    loadEventsMock.mockResolvedValue([
      { id: "event-1", title: "Claude", body: "90% used", createdAt: 1 },
    ])
    render(<NotificationSettingsSection />)

    expect(await screen.findByText("90% used")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Clear" }))

    await waitFor(() => expect(clearEventsMock).toHaveBeenCalledOnce())
  })

  it("shows a save error", async () => {
    const user = userEvent.setup()
    savePreferencesMock.mockRejectedValue(new Error("storage unavailable"))
    vi.spyOn(console, "error").mockImplementation(() => {})
    render(<NotificationSettingsSection />)

    const incidents = await screen.findByRole("checkbox", { name: "Incidents and recovery" })
    await waitFor(() => expect(incidents).toBeChecked())
    await user.click(incidents)

    await waitFor(() =>
      expect(screen.getByText("Notification preferences could not be saved.")).toBeInTheDocument()
    )
  })

  it("does not enable native delivery when permission is denied", async () => {
    const user = userEvent.setup()
    isTauriMock.mockReturnValue(true)
    isPermissionGrantedMock.mockResolvedValue(false)
    requestPermissionMock.mockResolvedValue("denied")
    render(<NotificationSettingsSection />)

    const delivery = await screen.findByRole("checkbox", {
      name: "Deliver Windows notifications",
    })
    await user.click(delivery)

    expect(
      await screen.findByText("Windows notification permission was not granted.")
    ).toBeInTheDocument()
    expect(savePreferencesMock).not.toHaveBeenCalled()
  })
})
