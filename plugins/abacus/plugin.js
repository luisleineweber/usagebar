(function () {
  const COMPUTE_POINTS_URL = "https://apps.abacus.ai/api/_getOrganizationComputePoints"
  const BILLING_INFO_URL = "https://apps.abacus.ai/api/_getBillingInfo"

  function readString(value) {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed || null
  }

  function readEnv(ctx, name) {
    if (!ctx.host.env || typeof ctx.host.env.get !== "function") return null
    try {
      return readString(ctx.host.env.get(name))
    } catch (e) {
      ctx.host.log.warn("env read failed (" + name + "): " + String(e))
      return null
    }
  }

  function readStoredCookieHeader(ctx) {
    if (!ctx.host.providerSecrets || typeof ctx.host.providerSecrets.read !== "function") return null
    try {
      return readString(ctx.host.providerSecrets.read("cookieHeader"))
    } catch (e) {
      const message = String(e)
      if (/not found/i.test(message)) return null
      ctx.host.log.warn("stored Abacus cookie header read failed: " + message)
      return null
    }
  }

  function loadCookieHeader(ctx) {
    const stored = readStoredCookieHeader(ctx)
    if (stored) return { value: stored, source: "Stored Cookie header" }

    const directHeader = readEnv(ctx, "ABACUS_COOKIE_HEADER")
    if (directHeader) return { value: directHeader, source: "ABACUS_COOKIE_HEADER" }

    const rawCookie = readEnv(ctx, "ABACUS_COOKIE")
    if (rawCookie) return { value: rawCookie, source: "ABACUS_COOKIE" }

    return null
  }

  function readNumber(value) {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }

  function formatCredits(value) {
    const n = readNumber(value)
    if (n === null) return null
    if (Number.isInteger(n)) return n.toLocaleString("en-US")
    return n.toLocaleString("en-US", { maximumFractionDigits: 2 })
  }

  function requestJson(ctx, opts, authMessage) {
    let resp
    try {
      resp = ctx.util.request(opts)
    } catch (e) {
      ctx.host.log.error("Abacus request failed: " + String(e))
      throw "Usage request failed. Check your connection."
    }

    if (ctx.util.isAuthStatus(resp.status)) {
      throw authMessage
    }
    if (resp.status < 200 || resp.status >= 300) {
      throw "Usage request failed (HTTP " + String(resp.status) + "). Try again later."
    }

    const payload = ctx.util.tryParseJson(resp.bodyText)
    if (!payload || typeof payload !== "object") {
      throw "Usage response invalid. Try again later."
    }
    if (payload.success !== true || !payload.result || typeof payload.result !== "object") {
      const errorText = String(payload.error || "").toLowerCase()
      if (/expired|session|login|auth|unauthorized|forbidden/.test(errorText)) {
        throw authMessage
      }
      throw "Usage response missing Abacus result data. Try again later."
    }
    return payload.result
  }

  function fetchComputePoints(ctx, cookieHeader) {
    return requestJson(ctx, {
      method: "GET",
      url: COMPUTE_POINTS_URL,
      headers: {
        Accept: "application/json",
        Cookie: cookieHeader,
        "User-Agent": "UsageBar",
      },
      timeoutMs: 15000,
    }, "Session expired. Update your Abacus AI cookie and try again.")
  }

  function fetchBillingInfo(ctx, cookieHeader) {
    try {
      return requestJson(ctx, {
        method: "POST",
        url: BILLING_INFO_URL,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Cookie: cookieHeader,
          "User-Agent": "UsageBar",
        },
        bodyText: "{}",
        timeoutMs: 5000,
      }, "Session expired. Update your Abacus AI cookie and try again.")
    } catch (e) {
      ctx.host.log.warn("Abacus billing info unavailable: " + String(e))
      return {}
    }
  }

  function buildOutput(ctx, computePoints, billingInfo, authSource) {
    const total = readNumber(computePoints.totalComputePoints)
    const left = readNumber(computePoints.computePointsLeft)
    if (total === null || left === null) {
      throw "Usage response missing credit fields. Try again later."
    }

    const safeTotal = Math.max(0, total)
    const used = Math.max(0, safeTotal - Math.max(0, left))
    const resetIso = ctx.util.toIso(billingInfo.nextBillingDate)
    const lines = []
    if (safeTotal > 0) {
      const line = {
        label: "Credits",
        used,
        limit: safeTotal,
        format: { kind: "count", suffix: "credits" },
      }
      if (resetIso) {
        line.resetsAt = resetIso
        line.periodDurationMs = 30 * 24 * 60 * 60 * 1000
      }
      lines.push(ctx.line.progress(line))
    } else {
      lines.push(ctx.line.text({ label: "Credits", value: "0 credits" }))
    }

    const usedLabel = formatCredits(used)
    const totalLabel = formatCredits(safeTotal)
    if (usedLabel && totalLabel) {
      lines.push(ctx.line.text({ label: "Billing", value: usedLabel + " / " + totalLabel + " credits" }))
    }

    lines.push(ctx.line.text({
      label: "Source",
      value: "Abacus dashboard compute-points session",
    }))

    lines.push(ctx.line.text({
      label: "Auth source",
      value: authSource,
    }))

    lines.push(ctx.line.text({
      label: "Endpoint",
      value: COMPUTE_POINTS_URL,
    }))

    const plan = readString(billingInfo.currentTier)
    return plan ? { plan, lines } : { lines }
  }

  function probe(ctx) {
    const cookieHeader = loadCookieHeader(ctx)
    if (!cookieHeader) {
      throw "Not logged in. Save an Abacus AI Cookie header or set ABACUS_COOKIE_HEADER."
    }

    const computePoints = fetchComputePoints(ctx, cookieHeader.value)
    const billingInfo = fetchBillingInfo(ctx, cookieHeader.value)
    return buildOutput(ctx, computePoints, billingInfo, cookieHeader.source)
  }

  globalThis.__openusage_plugin = { id: "abacus", probe }
})()
