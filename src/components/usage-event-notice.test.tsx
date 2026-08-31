import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { UsageEventNotice } from "@/components/usage-event-notice"
import type { UsageEvent } from "@/lib/notification-events"

const event: UsageEvent = {
  id: "event-1",
  type: "quota",
  providerId: "claude",
  title: "⚠️ Claude: Quota warning",
  body: "Session usage has reached 75% of its limit.",
  createdAt: 10,
}

describe("UsageEventNotice", () => {
  it("announces an event and supports keyboard dismissal", async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()

    render(<UsageEventNotice events={[event]} onDismiss={onDismiss} />)

    expect(screen.getByRole("status")).toHaveTextContent("⚠️ Claude: Quota warning")
    expect(screen.getByRole("status")).toHaveTextContent(
      "Session usage has reached 75% of its limit."
    )

    await user.click(screen.getByRole("button", { name: "Dismiss notifications" }))

    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it("keeps an empty live region mounted", () => {
    render(<UsageEventNotice events={[]} onDismiss={vi.fn()} />)

    expect(screen.getByRole("status")).toBeEmptyDOMElement()
  })
})
