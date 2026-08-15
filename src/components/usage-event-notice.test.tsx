import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { UsageEventNotice } from "@/components/usage-event-notice"
import type { UsageEvent } from "@/lib/notification-events"

const event: UsageEvent = {
  id: "event-1",
  type: "quota",
  providerId: "claude",
  title: "Claude quota warning",
  body: "Session reached 75% used.",
  createdAt: 10,
}

describe("UsageEventNotice", () => {
  it("announces an event and supports keyboard dismissal", async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()

    render(<UsageEventNotice events={[event]} onDismiss={onDismiss} />)

    expect(screen.getByRole("status")).toHaveTextContent("Claude quota warning")
    expect(screen.getByRole("status")).toHaveTextContent("Session reached 75% used.")

    await user.click(screen.getByRole("button", { name: "Dismiss notifications" }))

    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it("keeps an empty live region mounted", () => {
    render(<UsageEventNotice events={[]} onDismiss={vi.fn()} />)

    expect(screen.getByRole("status")).toBeEmptyDOMElement()
  })
})
