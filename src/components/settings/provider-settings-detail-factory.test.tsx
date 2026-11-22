import type { ComponentProps } from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ProviderSettingsDetail } from "@/components/settings/provider-settings-detail"
import type { PluginState } from "@/hooks/app/types"

vi.mock("@/lib/provider-accounts", () => ({
  listProviderAccountProfiles: vi.fn(async () => []),
  importCurrentProviderAccountProfile: vi.fn(),
  deleteProviderAccountProfile: vi.fn(),
}))

const WINDOWS_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0"
const SYNTHETIC_KEY = "fk-synthetic-0123456789"
const factory = { id: "factory", name: "Factory", iconUrl: "", lines: [], primaryCandidates: [] }
const storedKey = { secrets: { apiKey: { updatedAt: Date.now() } } }

function pluginState(patch: Partial<PluginState> = {}): PluginState {
  return {
    data: null,
    loading: false,
    error: null,
    lastManualRefreshAt: null,
    lastSuccessAt: null,
    ...patch,
  }
}

function settledError(message: string, category: PluginState["errorCategory"]): PluginState {
  return pluginState({ error: message, errorCategory: category, lastSettledError: message })
}

function renderFactory(props: Partial<ComponentProps<typeof ProviderSettingsDetail>> = {}) {
  return render(
    <ProviderSettingsDetail
      plugin={factory}
      enabled
      state={pluginState()}
      onEnabledChange={vi.fn()}
      {...props}
    />
  )
}

function headingOrder(): string[] {
  return screen.getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent ?? "")
}

describe("ProviderSettingsDetail Factory API key", () => {
  describe("in the Windows app", () => {
    beforeEach(() => {
      vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(WINDOWS_USER_AGENT)
    })
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it("masks the key on screen while it is typed, then saves it", async () => {
      const onSecretSave = vi.fn(async () => undefined)
      renderFactory({ onSecretSave })

      const field = screen.getByLabelText("API key")
      expect(field.tagName).toBe("INPUT")
      expect(field).toHaveAttribute("type", "password")
      expect(field).toHaveAttribute("autocomplete", "off")
      expect(screen.queryByRole("textbox", { name: "API key" })).toBeNull()

      await userEvent.type(field, SYNTHETIC_KEY)
      expect(screen.queryByText(SYNTHETIC_KEY)).toBeNull()
      await userEvent.click(screen.getByRole("button", { name: "Save secret" }))

      await waitFor(() => {
        expect(onSecretSave).toHaveBeenCalledWith("factory", "apiKey", SYNTHETIC_KEY)
      })
      expect(field).toHaveValue("")
    })

    it("shows Factory as signed in with a stored key and a successful refresh", () => {
      renderFactory({ config: storedKey, state: pluginState({ lastSuccessAt: Date.now() }) })

      expect(screen.getByRole("heading", { name: "Signed in" })).toBeInTheDocument()
      expect(screen.getByText("Stored Factory API key")).toBeInTheDocument()
    })

    it("shows Factory as signed out after the stored key is rejected", () => {
      renderFactory({
        config: storedKey,
        state: settledError(
          "Factory API key was rejected (HTTP 401). Replace it in Setup, or remove it to use the local droid login.",
          "credentialInvalid"
        ),
      })

      expect(headingOrder()[0]).toBe("Sign in")
      expect(screen.queryByRole("heading", { name: "Signed in" })).not.toBeInTheDocument()
      // The key can be replaced or removed from the sign-in view.
      expect(screen.getByLabelText("API key")).toHaveAttribute("type", "password")
      expect(screen.getByRole("button", { name: "Clear secret" })).toBeInTheDocument()
    })

    it("keeps Factory signed in when a refresh fails without a credential problem", () => {
      renderFactory({
        config: storedKey,
        state: settledError("Usage request failed. Check your connection.", "unknown"),
      })

      expect(screen.getByRole("heading", { name: "Signed in" })).toBeInTheDocument()
    })

    it("removes the stored key so the local droid login is used again", async () => {
      const onSecretDelete = vi.fn(async () => undefined)
      renderFactory({ config: storedKey, onSecretDelete })

      await userEvent.click(screen.getByRole("button", { name: "Change sign-in" }))
      await userEvent.click(screen.getByRole("button", { name: "Clear secret" }))

      await waitFor(() => {
        expect(onSecretDelete).toHaveBeenCalledWith("factory", "apiKey")
      })
    })
  })

  it("does not offer a Factory API key outside the Windows app", () => {
    renderFactory()

    expect(screen.queryByLabelText("API key")).toBeNull()
    expect(screen.getByText(/Factory API keys can be stored only in the Windows app/)).toBeVisible()
  })
})
