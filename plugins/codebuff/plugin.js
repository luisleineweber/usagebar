(function () {
  const DEFAULT_BASE_URL = "https://www.codebuff.com"
  const CREDENTIALS_PATH = "~/.config/manicode/credentials.json"

  function readString(value) {
    if (typeof value !== "string") return null
    let trimmed = value.trim()
    if (!trimmed) return null
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      trimmed = trimmed.slice(1, -1).trim()
    }
    return trimmed || null
  }

  function readNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null
    const text = readString(value)
    if (!text) return null
    const n = Number(text)
    return Number.isFinite(n) ? n : null
  }

  function readObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : null
  }

  function loadStoredToken(ctx) {
    if (!ctx.host.providerSecrets || typeof ctx.host.providerSecrets.read !== "function") return null
    try {
      return readString(ctx.host.providerSecrets.read("apiKey")) ||
        readString(ctx.host.providerSecrets.read("token"))
    } catch (e) {
      ctx.host.log.warn("provider secret read failed: " + String(e))
      return null
    }
  }

  function loadEnvToken(ctx) {
    if (!ctx.host.env || typeof ctx.host.env.get !== "function") return null
    try {
      return readString(ctx.host.env.get("CODEBUFF_API_KEY"))
    } catch (e) {
      ctx.host.log.warn("env read failed for CODEBUFF_API_KEY: " + String(e))
      return null
    }
  }

  function loadCredentialsToken(ctx) {
    try {
      const parsed = ctx.util.tryParseJson(ctx.host.fs.readText(CREDENTIALS_PATH))
      const root = readObject(parsed)
      if (!root) return null
      const defaultProfile = readObject(root.default)
      return readString(defaultProfile && defaultProfile.authToken) ||
        readString(root.authToken)
    } catch (e) {
      return null
    }
  }

  function loadToken(ctx) {
    return loadStoredToken(ctx) || loadEnvToken(ctx) || loadCredentialsToken(ctx)
  }

  function joinUrl(baseUrl, path) {
    return String(baseUrl).replace(/\/+$/, "") + path
  }

  function requestJson(ctx, opts, failureMode) {
    let resp
    try {
      resp = ctx.util.request(opts)
    } catch (e) {
      if (failureMode === "soft") {
        ctx.host.log.warn("request failed (" + opts.url + "): " + String(e))
        return null
      }
      ctx.host.log.error("request failed (" + opts.url + "): " + String(e))
      throw "Codebuff request failed. Check your connection."
    }

    if (ctx.util.isAuthStatus(resp.status)) {
      throw "Codebuff API token invalid. Set CODEBUFF_API_KEY or run codebuff login again."
    }
    if (resp.status === 404) {
      if (failureMode === "soft") return null
      throw "Codebuff usage endpoint not found."
    }
    if (resp.status >= 500 && resp.status <= 599) {
      if (failureMode === "soft") return null
      throw "Codebuff API unavailable (HTTP " + String(resp.status) + "). Try again later."
    }
    if (resp.status < 200 || resp.status >= 300) {
      if (failureMode === "soft") return null
      throw "Codebuff request failed (HTTP " + String(resp.status) + "). Try again later."
    }

    const data = ctx.util.tryParseJson(resp.bodyText)
    if (!data || typeof data !== "object") {
      if (failureMode === "soft") return null
      throw "Codebuff response invalid. Try again later."
    }
    return data
  }

  function requestUsage(ctx, baseUrl, token) {
    return requestJson(ctx, {
      method: "POST",
      url: joinUrl(baseUrl, "/api/v1/usage"),
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      bodyText: JSON.stringify({ fingerprintId: "usagebar-usage" }),
      timeoutMs: 15000,
    }, "hard")
  }

  function requestSubscription(ctx, baseUrl, token) {
    return requestJson(ctx, {
      method: "GET",
      url: joinUrl(baseUrl, "/api/user/subscription"),
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/json",
      },
      timeoutMs: 2000,
    }, "soft")
  }

  function parseUsage(ctx, payload) {
    const root = readObject(payload)
    if (!root) return null
    const used = readNumber(root.usage) ?? readNumber(root.used)
    const total = readNumber(root.quota) ?? readNumber(root.limit)
    const remaining = readNumber(root.remainingBalance) ?? readNumber(root.remaining)
    const nextQuotaReset = ctx.util.toIso(root.next_quota_reset)
    const autoTopupEnabled =
      typeof root.autoTopupEnabled === "boolean" ? root.autoTopupEnabled :
        typeof root.auto_topup_enabled === "boolean" ? root.auto_topup_enabled :
          null

    if (used === null && total === null && remaining === null) return null
    return { used, total, remaining, nextQuotaReset, autoTopupEnabled }
  }

  function parseSubscription(ctx, payload) {
    const root = readObject(payload)
    if (!root) return null
    const subscription = readObject(root.subscription)
    const rateLimit = readObject(root.rateLimit)
    const user = readObject(root.user)

    return {
      tier: readString(subscription && subscription.displayName) ||
        readString(root.displayName) ||
        readString(subscription && subscription.tier) ||
        readString(root.tier) ||
        readString(subscription && subscription.scheduledTier),
      status: readString(subscription && subscription.status),
      email: readString(root.email) || readString(user && user.email),
      billingPeriodEnd: ctx.util.toIso(subscription && (subscription.billingPeriodEnd ?? subscription.currentPeriodEnd)),
      weeklyUsed: readNumber(rateLimit && (rateLimit.weeklyUsed ?? rateLimit.used)),
      weeklyLimit: readNumber(rateLimit && (rateLimit.weeklyLimit ?? rateLimit.limit)),
      weeklyResetsAt: ctx.util.toIso(rateLimit && rateLimit.weeklyResetsAt),
    }
  }

  function compactNumber(value) {
    const n = Number(value || 0)
    if (!Number.isFinite(n)) return "0"
    if (Math.abs(n) >= 1000) return Math.round(n).toLocaleString("en-US")
    return (Math.round(n * 10) / 10).toLocaleString("en-US")
  }

  function formatCreditText(used, remaining, total) {
    if (total !== null) return compactNumber(total) + " credits"
    if (remaining !== null) return compactNumber(remaining) + " credits remaining"
    if (used !== null) return compactNumber(used) + " credits used"
    return "No usage data"
  }

  function titleCase(value) {
    const text = readString(value)
    return text ? text.replace(/(^|\s)([a-z])/g, (m, space, letter) => space + letter.toUpperCase()) : null
  }

  function probe(ctx) {
    const token = loadToken(ctx)
    if (!token) {
      throw "Codebuff API token missing. Save it in Setup, set CODEBUFF_API_KEY, or run codebuff login."
    }

    const baseUrl = DEFAULT_BASE_URL
    const usage = parseUsage(ctx, requestUsage(ctx, baseUrl, token))
    if (!usage) {
      throw "Codebuff response missing usage data. Try again later."
    }
    const subscription = parseSubscription(ctx, requestSubscription(ctx, baseUrl, token))

    let total = usage.total
    let used = usage.used
    let remaining = usage.remaining
    if (total === null && used !== null && remaining !== null) total = used + remaining
    if (used === null && total !== null && remaining !== null) used = Math.max(0, total - remaining)
    if (remaining === null && total !== null && used !== null) remaining = Math.max(0, total - used)

    const lines = []
    if (total !== null && total > 0 && used !== null) {
      lines.push(ctx.line.progress({
        label: "Credits",
        used: Math.max(0, used),
        limit: total,
        format: { kind: "count", suffix: "credits" },
        resetsAt: usage.nextQuotaReset || undefined,
      }))
    } else {
      lines.push(ctx.line.text({
        label: "Credits",
        value: formatCreditText(used, remaining, total),
      }))
    }

    if (subscription && subscription.weeklyLimit !== null && subscription.weeklyLimit > 0) {
      lines.push(ctx.line.progress({
        label: "Weekly",
        used: Math.max(0, subscription.weeklyUsed ?? 0),
        limit: subscription.weeklyLimit,
        format: { kind: "count", suffix: "credits" },
        resetsAt: subscription.weeklyResetsAt || undefined,
        periodDurationMs: 7 * 24 * 60 * 60 * 1000,
      }))
    }

    const plan = titleCase(subscription && subscription.tier) || "Codebuff"
    lines.push(ctx.line.badge({ label: "Plan", text: plan }))

    const planParts = [plan]
    if (remaining !== null) planParts.push(compactNumber(remaining) + " remaining")
    if (usage.autoTopupEnabled === true) planParts.push("auto top-up")

    return {
      account: subscription && subscription.email,
      plan: planParts.join(" · "),
      lines,
    }
  }

  globalThis.__openusage_plugin = { id: "codebuff", probe }
})()
