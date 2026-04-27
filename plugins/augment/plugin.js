(function () {
  const BASE_URL = "https://app.augmentcode.com"
  const CREDITS_URL = BASE_URL + "/api/credits"
  const SUBSCRIPTION_URL = BASE_URL + "/api/subscription"

  function readString(value) {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed || null
  }

  function readNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null
    const text = readString(value)
    if (!text) return null
    const n = Number(text.replace(/,/g, ""))
    return Number.isFinite(n) ? n : null
  }

  function readCookieHeader(ctx) {
    if (ctx.host.providerSecrets && typeof ctx.host.providerSecrets.read === "function") {
      try {
        const stored = readString(ctx.host.providerSecrets.read("cookieHeader"))
        if (stored) return stored
      } catch (e) {
        ctx.host.log.info("augment cookie secret read failed: " + String(e))
      }
    }

    if (ctx.host.env && typeof ctx.host.env.get === "function") {
      try {
        const envCookie = readString(ctx.host.env.get("AUGMENT_COOKIE_HEADER"))
        if (envCookie) return envCookie
      } catch (e) {
        ctx.host.log.warn("env read failed for AUGMENT_COOKIE_HEADER: " + String(e))
      }
    }

    return null
  }

  function requestJson(ctx, cookieHeader, url, label, optional) {
    let response
    try {
      response = ctx.host.http.request({
        method: "GET",
        url,
        headers: {
          Accept: "application/json",
          Cookie: cookieHeader,
          "User-Agent": "UsageBar",
        },
        timeoutMs: optional ? 5000 : 15000,
      })
    } catch (e) {
      if (optional) {
        ctx.host.log.warn("augment " + label + " request failed: " + String(e))
        return null
      }
      throw "Augment request failed. Check your connection."
    }

    if (ctx.util.isAuthStatus(response.status)) {
      throw "Augment session expired. Re-capture the Cookie header from app.augmentcode.com."
    }
    if (response.status < 200 || response.status >= 300) {
      if (optional) {
        ctx.host.log.warn("augment " + label + " returned HTTP " + String(response.status))
        return null
      }
      throw "Augment request failed (HTTP " + String(response.status) + "). Try again later."
    }

    const data = ctx.util.tryParseJson(response.bodyText)
    if (!data || typeof data !== "object") {
      if (optional) {
        ctx.host.log.warn("augment " + label + " response invalid")
        return null
      }
      throw "Augment response invalid. Refresh the Cookie header or update UsageBar."
    }
    return data
  }

  function readUsage(credits) {
    const remaining = readNumber(credits.usageUnitsRemaining)
    const used = readNumber(credits.usageUnitsConsumedThisBillingCycle)
    const available = readNumber(credits.usageUnitsAvailable)
    const limit = used !== null && remaining !== null
      ? used + remaining
      : available !== null && used !== null
        ? Math.max(available, used)
        : null

    if (used === null && remaining === null) return null
    if (limit === null || limit <= 0) {
      return {
        used: used !== null ? used : 0,
        limit: Math.max(remaining || 0, used || 0, 1),
        remaining,
      }
    }

    return {
      used: used !== null ? used : Math.max(0, limit - (remaining || 0)),
      limit,
      remaining,
    }
  }

  function formatCount(value) {
    const n = readNumber(value)
    if (n === null) return "Unknown"
    if (Number.isInteger(n)) return n.toLocaleString("en-US")
    return n.toLocaleString("en-US", { maximumFractionDigits: 2 })
  }

  function buildResult(ctx, credits, subscription) {
    const usage = readUsage(credits)
    if (!usage) {
      throw "Augment credits response missing usage fields. Refresh the Cookie header or update UsageBar."
    }

    const resetIso = subscription ? ctx.util.toIso(subscription.billingPeriodEnd) : null
    const progress = {
      label: "Credits",
      used: Math.max(0, usage.used),
      limit: Math.max(usage.limit, usage.used, 1),
      format: { kind: "count", suffix: "credits" },
    }
    if (resetIso) {
      progress.resetsAt = resetIso
      progress.periodDurationMs = 30 * 24 * 60 * 60 * 1000
    }

    const lines = [
      ctx.line.progress(progress),
      ctx.line.text({
        label: "Remaining",
        value: formatCount(usage.remaining),
      }),
    ]

    if (subscription && readString(subscription.email)) {
      lines.push(ctx.line.text({ label: "Account", value: readString(subscription.email) }))
    }
    if (subscription && readString(subscription.organization)) {
      lines.push(ctx.line.text({ label: "Organization", value: readString(subscription.organization) }))
    }

    const plan = subscription && readString(subscription.planName)
      ? ctx.fmt.planLabel(subscription.planName)
      : readString(credits.usageBalanceStatus) || "Augment"

    return { plan, lines }
  }

  function probe(ctx) {
    const cookieHeader = readCookieHeader(ctx)
    if (!cookieHeader) {
      throw "Augment Cookie header missing. Save it in Setup or set AUGMENT_COOKIE_HEADER."
    }

    const credits = requestJson(ctx, cookieHeader, CREDITS_URL, "credits", false)
    const subscription = requestJson(ctx, cookieHeader, SUBSCRIPTION_URL, "subscription", true)
    return buildResult(ctx, credits, subscription)
  }

  globalThis.__openusage_plugin = { id: "augment", probe }
})()
