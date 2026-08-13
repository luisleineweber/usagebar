import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  listProfilesMock,
  importProfileMock,
  deleteProfileMock,
} = vi.hoisted(() => ({
  listProfilesMock: vi.fn(),
  importProfileMock: vi.fn(),
  deleteProfileMock: vi.fn(),
}))

vi.mock("@/lib/codex-accounts", () => ({
  listCodexAccountProfiles: listProfilesMock,
  importCurrentCodexAccountProfile: importProfileMock,
  deleteCodexAccountProfile: deleteProfileMock,
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, ...rest }: Record<string, unknown>) => (
    <button onClick={onClick as () => void} disabled={disabled as boolean} {...rest}>
      {children as React.ReactNode}
    </button>
  ),
}))

import { CodexAccountsSection } from "@/components/settings/codex-accounts-section"

const mockProfiles = [
  { profileId: "p1", label: "Profile A", email: "user@example.com", accountId: "acct1", sourceKind: "cli", lastImportedAt: 1000 },
  { profileId: "p2", label: "Profile B", email: "other@example.com", sourceKind: "cli", lastImportedAt: 2000 },
]

describe("CodexAccountsSection", () => {
  beforeEach(() => {
    listProfilesMock.mockReset()
    importProfileMock.mockReset()
    deleteProfileMock.mockReset()
    listProfilesMock.mockResolvedValue([])
  })

  it("renders the section heading", async () => {
    render(<CodexAccountsSection />)
    await waitFor(() => {
      expect(screen.getByText("Codex Accounts")).toBeInTheDocument()
    })
  })

  it("loads and displays profiles on mount", async () => {
    listProfilesMock.mockResolvedValue(mockProfiles)
    render(<CodexAccountsSection />)

    await waitFor(() => {
      expect(screen.getByText("Profile A")).toBeInTheDocument()
      expect(screen.getByText("Profile B")).toBeInTheDocument()
    })
  })

  it("shows empty state when no profiles exist", async () => {
    render(<CodexAccountsSection />)

    await waitFor(() => {
      expect(screen.getByText(/No imported Codex accounts yet/)).toBeInTheDocument()
    })
  })

  it("shows error message when loading fails", async () => {
    listProfilesMock.mockRejectedValue(new Error("load failed"))
    render(<CodexAccountsSection />)

    await waitFor(() => {
      expect(screen.getByText("load failed")).toHaveAttribute("role", "alert")
    })
  })

  it("shows Active badge for selected profile", async () => {
    listProfilesMock.mockResolvedValue(mockProfiles)
    render(<CodexAccountsSection config={{ selectedAccountProfileId: "p1" }} />)

    await waitFor(() => {
      expect(screen.getByText("Active")).toBeInTheDocument()
    })
  })

  it("imports current login on button click", async () => {
    listProfilesMock.mockResolvedValue([])
    importProfileMock.mockResolvedValue({
      profile: mockProfiles[0],
      wasFirstProfile: true,
    })
    const onConfigChange = vi.fn().mockResolvedValue(undefined)

    render(<CodexAccountsSection onConfigChange={onConfigChange} />)

    await waitFor(() => {
      expect(screen.getByText("Import current login")).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(screen.getByText("Import current login"))
    })

    await waitFor(() => {
      expect(importProfileMock).toHaveBeenCalled()
      expect(onConfigChange).toHaveBeenCalledWith("codex", {
        selectedAccountProfileId: "p1",
      })
    })

    await waitFor(() => {
      expect(screen.getByText(/Imported/)).toHaveAttribute("role", "status")
    })
  })

  it("shows error when import fails", async () => {
    listProfilesMock.mockResolvedValue([])
    importProfileMock.mockRejectedValue(new Error("import failed"))

    render(<CodexAccountsSection />)

    await waitFor(() => {
      expect(screen.getByText("Import current login")).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(screen.getByText("Import current login"))
    })

    await waitFor(() => {
      expect(screen.getByText("import failed")).toBeInTheDocument()
    })
  })

  it("selects a profile on click", async () => {
    listProfilesMock.mockResolvedValue(mockProfiles)
    const onConfigChange = vi.fn().mockResolvedValue(undefined)

    render(<CodexAccountsSection onConfigChange={onConfigChange} />)

    await waitFor(() => {
      expect(screen.getByText("Profile A")).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(screen.getByText("Profile A"))
    })

    await waitFor(() => {
      expect(onConfigChange).toHaveBeenCalledWith("codex", {
        selectedAccountProfileId: "p1",
      })
      expect(screen.getByText("Active Codex account updated.")).toHaveAttribute(
        "role",
        "status"
      )
    })
  })

  it("shows error when selection fails", async () => {
    listProfilesMock.mockResolvedValue(mockProfiles)
    const onConfigChange = vi.fn().mockRejectedValue(new Error("select failed"))

    render(<CodexAccountsSection onConfigChange={onConfigChange} />)

    await waitFor(() => {
      expect(screen.getByText("Profile A")).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(screen.getByText("Profile A"))
    })

    await waitFor(() => {
      expect(screen.getByText("select failed")).toHaveAttribute("role", "alert")
    })
  })

  it("select is a no-op when onConfigChange is not provided", async () => {
    listProfilesMock.mockResolvedValue(mockProfiles)

    render(<CodexAccountsSection />)

    await waitFor(() => {
      expect(screen.getByText("Profile A")).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(screen.getByText("Profile A"))
    })

    await waitFor(() => {
      expect(screen.queryByText("Active Codex account updated.")).toBeNull()
    })
  })

  it("deletes a profile and clears selection when active is deleted", async () => {
    listProfilesMock.mockResolvedValue(mockProfiles)
    deleteProfileMock.mockResolvedValue(undefined)
    const onConfigChange = vi.fn().mockResolvedValue(undefined)

    render(
      <CodexAccountsSection
        config={{ selectedAccountProfileId: "p1" }}
        onConfigChange={onConfigChange}
      />
    )

    await waitFor(() => {
      expect(screen.getByText("Active")).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByText("Delete")
    await act(async () => {
      fireEvent.click(deleteButtons[0])
    })

    await waitFor(() => {
      expect(deleteProfileMock).toHaveBeenCalledWith("p1")
      expect(onConfigChange).toHaveBeenCalledWith("codex", {
        selectedAccountProfileId: undefined,
      })
      expect(screen.getByText("Codex account removed.")).toBeInTheDocument()
    })
  })

  it("deletes a profile without clearing selection when inactive is deleted", async () => {
    listProfilesMock.mockResolvedValue(mockProfiles)
    deleteProfileMock.mockResolvedValue(undefined)
    const onConfigChange = vi.fn().mockResolvedValue(undefined)

    render(
      <CodexAccountsSection
        config={{ selectedAccountProfileId: "p1" }}
        onConfigChange={onConfigChange}
      />
    )

    await waitFor(() => {
      const deleteButtons = screen.getAllByText("Delete")
      expect(deleteButtons).toHaveLength(2)
    })

    const deleteButtons = screen.getAllByText("Delete")
    await act(async () => {
      fireEvent.click(deleteButtons[1])
    })

    await waitFor(() => {
      expect(deleteProfileMock).toHaveBeenCalledWith("p2")
      expect(screen.getByText("Codex account removed.")).toBeInTheDocument()
    })
  })

  it("shows error when deletion fails", async () => {
    listProfilesMock.mockResolvedValue(mockProfiles)
    deleteProfileMock.mockRejectedValue(new Error("delete failed"))

    render(<CodexAccountsSection />)

    await waitFor(() => {
      const deleteButtons = screen.getAllByText("Delete")
      expect(deleteButtons).toHaveLength(2)
    })

    const deleteButtons = screen.getAllByText("Delete")
    await act(async () => {
      fireEvent.click(deleteButtons[0])
    })

    await waitFor(() => {
      expect(screen.getByText("delete failed")).toBeInTheDocument()
    })
  })

  it("clears stale selected account when profile disappears", async () => {
    listProfilesMock.mockResolvedValue([mockProfiles[1]])
    const onConfigChange = vi.fn().mockResolvedValue(undefined)

    render(
      <CodexAccountsSection
        config={{ selectedAccountProfileId: "p1" }}
        onConfigChange={onConfigChange}
      />
    )

    await waitFor(() => {
      expect(onConfigChange).toHaveBeenCalledWith("codex", {
        selectedAccountProfileId: undefined,
      })
    })
  })

  it("does not render stale clear call when onConfigChange is missing", async () => {
    listProfilesMock.mockResolvedValue([mockProfiles[1]])

    render(
      <CodexAccountsSection config={{ selectedAccountProfileId: "p1" }} />
    )

    await waitFor(() => {
      expect(screen.getByText("Profile B")).toBeInTheDocument()
    })
  })
})
