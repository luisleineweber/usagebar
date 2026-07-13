import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { storeGetMock, storeSetMock, storeSaveMock } = vi.hoisted(() => ({
  storeGetMock: vi.fn(),
  storeSetMock: vi.fn(),
  storeSaveMock: vi.fn(),
}))

vi.mock("@tauri-apps/plugin-store", () => ({
  LazyStore: function () {
    return {
      get: storeGetMock,
      set: storeSetMock,
      save: storeSaveMock,
    }
  },
}))

import {
  clearProviderSecretMetadata,
  getProviderSettingsDefinition,
  getProviderSourceLabel,
  hasProviderSecret,
  loadProviderConfigs,
  normalizeProviderConfigs,
  saveProviderConfigs,
  setProviderSecretMetadata,
  updateProviderConfig,
  type ProviderConfig,
  type ProviderConfigs,
} from "@/lib/provider-settings"

describe("getProviderSettingsDefinition", () => {
  it("returns definition for known provider", () => {
    const def = getProviderSettingsDefinition("ollama")
    expect(def.mode).toBe("editable")
    expect(def.title).toBe("Ollama Setup")
    expect(def.secretField?.key).toBe("cookieHeader")
  })

  it("returns definition for opencode provider", () => {
    const def = getProviderSettingsDefinition("opencode")
    expect(def.mode).toBe("editable")
    expect(def.sourceOptions).toHaveLength(2)
    expect(def.sourceOptions![0].value).toBe("manual")
    expect(def.textField?.key).toBe("workspaceId")
  })

  it("returns automatic fallback for unknown provider", () => {
    const def = getProviderSettingsDefinition("unknown-provider")
    expect(def.mode).toBe("automatic")
    expect(def.title).toBe("Provider Setup")
    expect(def.summary).toBe("This provider currently relies on local auto-detection.")
  })

  it("returns definition for detected-mode provider (cursor)", () => {
    const def = getProviderSettingsDefinition("cursor")
    expect(def.mode).toBe("detected")
  })

  it("returns definition for automatic-mode provider (gemini)", () => {
    const def = getProviderSettingsDefinition("gemini")
    expect(def.mode).toBe("automatic")
  })

  it("returns definition for codex with secret field and no source options", () => {
    const def = getProviderSettingsDefinition("codex")
    expect(def.mode).toBe("editable")
    expect(def.secretField?.key).toBe("cookieHeader")
    expect(def.sourceOptions).toBeUndefined()
  })

  it("defines reusable guided cookie login metadata for Zed", () => {
    const def = getProviderSettingsDefinition("zed")

    expect(def.guidedCookieLogin).toEqual({
      buttonLabel: "Connect dashboard",
      windowTitle: "Connect Zed dashboard",
      loginUrl: "https://dashboard.zed.dev/account",
      successUrlContains: "/billing/usage",
      cookieUrls: [
        "https://dashboard.zed.dev/account",
        "https://cloud.zed.dev/frontend/billing/usage",
      ],
      secretKey: "cookieHeader",
      successMessage: "Dashboard cookie captured. No email or password was stored.",
    })
  })

  it.each([
    ["abacus", "/chatllm/admin/compute-points-usage"],
    ["perplexity", "/account/details"],
    ["opencode", "/workspace/"],
  ])("defines strict guided cookie login metadata for %s", (providerId, successMarker) => {
    const login = getProviderSettingsDefinition(providerId).guidedCookieLogin
    expect(login?.secretKey).toBe("cookieHeader")
    expect(login?.successUrlContains).toBe(successMarker)
    expect(login?.loginUrl).toMatch(/^https:\/\//)
    expect(login?.cookieUrls.every((url) => url.startsWith("https://"))).toBe(true)
  })

  it("uses an Admin API key field for Mistral", () => {
    expect(getProviderSettingsDefinition("mistral").secretField?.key).toBe("adminApiKey")
  })
})

describe("normalizeProviderConfigs", () => {
  it("returns empty object for null", () => {
    expect(normalizeProviderConfigs(null)).toEqual({})
  })

  it("returns empty object for non-object", () => {
    expect(normalizeProviderConfigs("string")).toEqual({})
  })

  it("returns empty object for undefined", () => {
    expect(normalizeProviderConfigs(undefined)).toEqual({})
  })

  it("normalizes valid provider config entries", () => {
    const result = normalizeProviderConfigs({
      codex: {
        source: "manual",
        selectedAccountProfileId: "prof-123",
        workspaceId: "wrk-456",
        updatedAt: 1700000000000,
        secrets: { cookieHeader: { updatedAt: 1700000000000 } },
      },
    })
    expect(result.codex.source).toBe("manual")
    expect(result.codex.selectedAccountProfileId).toBe("prof-123")
    expect(result.codex.workspaceId).toBe("wrk-456")
    expect(result.codex.updatedAt).toBe(1700000000000)
    expect(result.codex.secrets?.cookieHeader?.updatedAt).toBe(1700000000000)
  })

  it("drops invalid source values", () => {
    const result = normalizeProviderConfigs({
      codex: { source: "invalid" },
    })
    expect(result.codex.source).toBeUndefined()
  })

  it("trims whitespace workspaceId", () => {
    const result = normalizeProviderConfigs({
      opencode: { workspaceId: "  wrk-789  " },
    })
    expect(result.opencode.workspaceId).toBe("wrk-789")
  })

  it("drops empty-string workspaceId", () => {
    const result = normalizeProviderConfigs({
      opencode: { workspaceId: "   " },
    })
    expect(result.opencode.workspaceId).toBeUndefined()
  })

  it("drops non-string workspaceId", () => {
    const result = normalizeProviderConfigs({
      opencode: { workspaceId: 123 },
    })
    expect(result.opencode.workspaceId).toBeUndefined()
  })

  it("drops non-finite updatedAt", () => {
    const result = normalizeProviderConfigs({
      codex: { updatedAt: Number.NaN },
    })
    expect(result.codex.updatedAt).toBeUndefined()
  })

  it("drops non-number updatedAt", () => {
    const result = normalizeProviderConfigs({
      codex: { updatedAt: "not-a-number" },
    })
    expect(result.codex.updatedAt).toBeUndefined()
  })

  it("strips invalid secret metadata entries", () => {
    const result = normalizeProviderConfigs({
      codex: {
        secrets: {
          valid: { updatedAt: 1000 },
          invalid: { notUpdatedAt: 1 },
          nonObject: "string",
        },
      },
    })
    expect(result.codex.secrets?.valid?.updatedAt).toBe(1000)
    expect(result.codex.secrets?.invalid).toBeUndefined()
    expect(result.codex.secrets?.nonObject).toBeUndefined()
  })

  it("drops empty secrets object after normalization", () => {
    const result = normalizeProviderConfigs({
      codex: {
        secrets: { invalid: { notUpdatedAt: 1 } },
      },
    })
    expect(result.codex.secrets).toBeUndefined()
  })

  it("handles missing fields gracefully", () => {
    const result = normalizeProviderConfigs({
      codex: {},
    })
    expect(result.codex).toEqual({})
  })
})

describe("updateProviderConfig", () => {
  it("updates an existing config", () => {
    const configs: ProviderConfigs = {
      codex: { source: "auto", updatedAt: 1000 },
    }
    const result = updateProviderConfig(configs, "codex", { source: "manual" })
    expect(result.codex.source).toBe("manual")
    expect(result.codex.updatedAt).toBeGreaterThan(1000)
  })

  it("creates a new config for unknown provider", () => {
    const configs: ProviderConfigs = {}
    const result = updateProviderConfig(configs, "ollama", { workspaceId: "wrk-1" })
    expect(result.ollama.workspaceId).toBe("wrk-1")
    expect(result.ollama.updatedAt).toBeDefined()
  })

  it("preserves unchanged fields", () => {
    const configs: ProviderConfigs = {
      codex: { source: "manual", workspaceId: "wrk-1" },
    }
    const result = updateProviderConfig(configs, "codex", { selectedAccountProfileId: "prof-1" })
    expect(result.codex.source).toBe("manual")
    expect(result.codex.workspaceId).toBe("wrk-1")
    expect(result.codex.selectedAccountProfileId).toBe("prof-1")
  })

  it("preserves other providers", () => {
    const configs: ProviderConfigs = {
      codex: { source: "auto" },
      ollama: { source: "manual" },
    }
    const result = updateProviderConfig(configs, "codex", { workspaceId: "wrk-1" })
    expect(result.ollama.source).toBe("manual")
    expect(result.codex.workspaceId).toBe("wrk-1")
  })
})

describe("setProviderSecretMetadata", () => {
  it("sets secret metadata on config with no existing secrets", () => {
    const configs: ProviderConfigs = {
      ollama: { source: "manual" },
    }
    const result = setProviderSecretMetadata(configs, "ollama", "cookieHeader")
    expect(result.ollama.secrets?.cookieHeader?.updatedAt).toBeDefined()
    expect(typeof result.ollama.secrets?.cookieHeader?.updatedAt).toBe("number")
  })

  it("adds secret to existing secrets", () => {
    const configs: ProviderConfigs = {
      ollama: { secrets: { apiKey: { updatedAt: 1000 } } },
    }
    const result = setProviderSecretMetadata(configs, "ollama", "cookieHeader")
    expect(result.ollama.secrets?.apiKey?.updatedAt).toBe(1000)
    expect(result.ollama.secrets?.cookieHeader?.updatedAt).toBeDefined()
  })

  it("creates config for unknown provider", () => {
    const configs: ProviderConfigs = {}
    const result = setProviderSecretMetadata(configs, "codex", "cookieHeader")
    expect(result.codex.secrets?.cookieHeader?.updatedAt).toBeDefined()
  })
})

describe("clearProviderSecretMetadata", () => {
  it("removes a secret key", () => {
    const configs: ProviderConfigs = {
      ollama: {
        secrets: {
          cookieHeader: { updatedAt: 1000 },
          apiKey: { updatedAt: 2000 },
        },
      },
    }
    const result = clearProviderSecretMetadata(configs, "ollama", "cookieHeader")
    expect(result.ollama.secrets?.cookieHeader).toBeUndefined()
    expect(result.ollama.secrets?.apiKey?.updatedAt).toBe(2000)
  })

  it("removes secrets entirely when last key is removed", () => {
    const configs: ProviderConfigs = {
      ollama: {
        secrets: { cookieHeader: { updatedAt: 1000 } },
      },
    }
    const result = clearProviderSecretMetadata(configs, "ollama", "cookieHeader")
    expect(result.ollama.secrets).toBeUndefined()
  })

  it("is a no-op for missing provider", () => {
    const configs: ProviderConfigs = {}
    const result = clearProviderSecretMetadata(configs, "unknown", "key")
    expect(result.unknown.secrets).toBeUndefined()
  })

  it("is a no-op for missing secret key", () => {
    const configs: ProviderConfigs = {
      ollama: { secrets: { apiKey: { updatedAt: 1000 } } },
    }
    const result = clearProviderSecretMetadata(configs, "ollama", "cookieHeader")
    expect(result.ollama.secrets?.apiKey?.updatedAt).toBe(1000)
  })
})

describe("hasProviderSecret", () => {
  it("returns false for undefined config", () => {
    expect(hasProviderSecret(undefined, "cookieHeader")).toBe(false)
  })

  it("returns true when secret exists", () => {
    const config: ProviderConfig = {
      secrets: { cookieHeader: { updatedAt: 1000 } },
    }
    expect(hasProviderSecret(config, "cookieHeader")).toBe(true)
  })

  it("returns false when secret key does not exist", () => {
    const config: ProviderConfig = {
      secrets: { apiKey: { updatedAt: 1000 } },
    }
    expect(hasProviderSecret(config, "cookieHeader")).toBe(false)
  })

  it("returns false when config has no secrets", () => {
    const config: ProviderConfig = { source: "manual" }
    expect(hasProviderSecret(config, "cookieHeader")).toBe(false)
  })
})

describe("getProviderSourceLabel", () => {
  it("returns Manual cookie label for opencode manual mode", () => {
    expect(getProviderSourceLabel("opencode", { source: "manual" })).toBe("Manual cookie")
  })

  it("returns Automatic label for opencode auto mode", () => {
    expect(getProviderSourceLabel("opencode", { source: "auto" })).toBe("Automatic")
  })

  it("returns Cloud auth label for ollama with cookie", () => {
    expect(
      getProviderSourceLabel("ollama", {
        secrets: { cookieHeader: { updatedAt: 1000 } },
      })
    ).toBe("Cloud auth + settings cookie")
  })

  it("returns fallback label for ollama without cookie", () => {
    expect(getProviderSourceLabel("ollama", {})).toBe("Cloud auth/cookie")
  })

  it("returns Manual cookie label for perplexity", () => {
    expect(getProviderSourceLabel("perplexity")).toBe("Manual cookie")
  })

  it("returns Manual cookie for abacus", () => {
    expect(getProviderSourceLabel("abacus")).toBe("Manual cookie")
  })

  it("returns stored Admin API key for Mistral", () => {
    expect(
      getProviderSourceLabel("mistral", {
        secrets: { adminApiKey: { updatedAt: 1000 } },
      })
    ).toBe("Stored Mistral Admin API key")
  })

  it("returns Auggie auth label for augment with cookie", () => {
    expect(
      getProviderSourceLabel("augment", {
        secrets: { cookieHeader: { updatedAt: 1000 } },
      })
    ).toBe("Auggie auth + dashboard cookie")
  })

  it("returns fallback label for augment without cookie", () => {
    expect(getProviderSourceLabel("augment", {})).toBe("Auggie auth/cookie")
  })

  it("returns Stored API key label for deepseek with apiKey", () => {
    expect(
      getProviderSourceLabel("deepseek", {
        secrets: { apiKey: { updatedAt: 1000 } },
      })
    ).toBe("Stored DeepSeek API key")
  })

  it("returns fallback label for deepseek without apiKey", () => {
    expect(getProviderSourceLabel("deepseek")).toBe("DeepSeek API key/env")
  })

  it("returns Local Grok CLI auth for grok", () => {
    expect(getProviderSourceLabel("grok")).toBe("Local Grok CLI auth")
  })

  it("returns Stored Codebuff token label for codebuff with apiKey", () => {
    expect(
      getProviderSourceLabel("codebuff", {
        secrets: { apiKey: { updatedAt: 1000 } },
      })
    ).toBe("Stored Codebuff API token")
  })

  it("returns fallback for codebuff without apiKey", () => {
    expect(getProviderSourceLabel("codebuff")).toBe("Codebuff API token/env")
  })

  it("returns Kimi Code OAuth + API key for kimi with apiKey", () => {
    expect(
      getProviderSourceLabel("kimi", {
        secrets: { apiKey: { updatedAt: 1000 } },
      })
    ).toBe("Kimi Code OAuth + Moonshot API key")
  })

  it("returns Kimi Code OAuth for kimi without apiKey", () => {
    expect(getProviderSourceLabel("kimi")).toBe("Kimi Code OAuth")
  })

  it("returns Stored Moonshot API key for kimi-k2 with apiKey", () => {
    expect(
      getProviderSourceLabel("kimi-k2", {
        secrets: { apiKey: { updatedAt: 1000 } },
      })
    ).toBe("Stored Moonshot API key")
  })

  it("returns fallback for kimi-k2 without apiKey", () => {
    expect(getProviderSourceLabel("kimi-k2")).toBe("Moonshot API key/env")
  })

  it("returns Stored Z.ai API key for zai with apiKey", () => {
    expect(
      getProviderSourceLabel("zai", {
        secrets: { apiKey: { updatedAt: 1000 } },
      })
    ).toBe("Stored Z.ai API key")
  })

  it("returns fallback for zai without apiKey", () => {
    expect(getProviderSourceLabel("zai")).toBe("Z.ai API key/env")
  })

  it("returns Stored MiniMax API key for minimax with apiKey", () => {
    expect(
      getProviderSourceLabel("minimax", {
        secrets: { apiKey: { updatedAt: 1000 } },
      })
    ).toBe("Stored MiniMax API key")
  })

  it("returns fallback for minimax without apiKey", () => {
    expect(getProviderSourceLabel("minimax")).toBe("MiniMax API key/env")
  })

  it("returns Stored Amp API key for amp with apiKey", () => {
    expect(
      getProviderSourceLabel("amp", {
        secrets: { apiKey: { updatedAt: 1000 } },
      })
    ).toBe("Stored Amp API key")
  })

  it("returns fallback for amp without apiKey", () => {
    expect(getProviderSourceLabel("amp")).toBe("Amp CLI credentials")
  })

  it("returns GitHub auth + scope for copilot with workspaceId", () => {
    expect(getProviderSourceLabel("copilot", { workspaceId: "org:my-org" })).toBe(
      "GitHub auth + billing scope"
    )
  })

  it("returns GitHub auth for copilot without workspaceId", () => {
    expect(getProviderSourceLabel("copilot")).toBe("GitHub auth")
  })

  it("returns OAuth + web cookie for claude with cookieHeader", () => {
    expect(
      getProviderSourceLabel("claude", {
        secrets: { cookieHeader: { updatedAt: 1000 } },
      })
    ).toBe("OAuth + web cookie")
  })

  it("returns Auto-detected for claude without cookie", () => {
    expect(getProviderSourceLabel("claude")).toBe("Auto-detected")
  })

  it("returns Managed account + dashboard cookie for codex with both", () => {
    expect(
      getProviderSourceLabel("codex", {
        selectedAccountProfileId: "prof-1",
        secrets: { cookieHeader: { updatedAt: 1000 } },
      })
    ).toBe("Managed account + dashboard cookie")
  })

  it("returns Managed account for codex with only profile", () => {
    expect(
      getProviderSourceLabel("codex", {
        selectedAccountProfileId: "prof-1",
      })
    ).toBe("Managed account")
  })

  it("returns Auto-detected + dashboard cookie for codex with only cookie", () => {
    expect(
      getProviderSourceLabel("codex", {
        secrets: { cookieHeader: { updatedAt: 1000 } },
      })
    ).toBe("Auto-detected + dashboard cookie")
  })

  it("returns Auto-detected for codex without config", () => {
    expect(getProviderSourceLabel("codex")).toBe("Auto-detected")
  })

  it("returns Auto-detected for unknown provider", () => {
    expect(getProviderSourceLabel("unknown-provider", { source: "manual" })).toBe("Auto-detected")
  })
})

describe("loadProviderConfigs", () => {
  beforeEach(() => {
    storeGetMock.mockReset()
  })

  it("returns normalized configs from store", async () => {
    storeGetMock.mockResolvedValue({
      codex: { source: "manual" },
    })
    const result = await loadProviderConfigs()
    expect(result.codex.source).toBe("manual")
    expect(storeGetMock).toHaveBeenCalledWith("providerConfigs")
  })

  it("returns empty object when store returns null", async () => {
    storeGetMock.mockResolvedValue(null)
    const result = await loadProviderConfigs()
    expect(result).toEqual({})
  })

  it("returns empty object when store returns non-object", async () => {
    storeGetMock.mockResolvedValue("not-object")
    const result = await loadProviderConfigs()
    expect(result).toEqual({})
  })
})

describe("saveProviderConfigs", () => {
  beforeEach(() => {
    storeSetMock.mockReset()
    storeSaveMock.mockReset()
    storeSetMock.mockResolvedValue(undefined)
    storeSaveMock.mockResolvedValue(undefined)
  })

  it("sets configs on store and saves", async () => {
    const configs: ProviderConfigs = {
      codex: { source: "auto" },
    }
    await saveProviderConfigs(configs)
    expect(storeSetMock).toHaveBeenCalledWith("providerConfigs", configs)
    expect(storeSaveMock).toHaveBeenCalled()
  })
})
