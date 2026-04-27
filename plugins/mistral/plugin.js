(function () {
  const USAGE_BASE_URL = "https://admin.mistral.ai/api/billing/v2/usage"

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
      ctx.host.log.warn("stored Mistral cookie header read failed: " + message)
      return null
    }
  }

  function loadCookieHeader(ctx) {
    const directHeader = readEnv(ctx, "MISTRAL_COOKIE_HEADER")
    if (directHeader) return directHeader

    const stored = readStoredCookieHeader(ctx)
    if (stored) return stored

    const session = readEnv(ctx, "MISTRAL_SESSION")
    if (session) return "ory_session_mistral=" + session

    return null
  }

  function cookieValue(cookieHeader, name) {
    const parts = String(cookieHeader || "").split(";")
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim()
      const eq = part.indexOf("=")
      if (eq <= 0) continue
      if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim()
    }
    return null
  }

  function readNumber(value) {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }

  function fmtCount(value) {
    const n = Number(value) || 0
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  }

  function monthUsageUrl(now) {
    const date = now instanceof Date ? now : new Date()
    const month = date.getUTCMonth() + 1
    const year = date.getUTCFullYear()
    return USAGE_BASE_URL + "?month=" + encodeURIComponent(String(month)) + "&year=" + encodeURIComponent(String(year))
  }

  function buildPriceIndex(prices) {
    const index = {}
    if (!Array.isArray(prices)) return index
    for (let i = 0; i < prices.length; i++) {
      const price = prices[i]
      if (!price || typeof price !== "object") continue
      const metric = readString(price.billing_metric)
      const group = readString(price.billing_group)
      const value = readNumber(price.price)
      if (!metric || !group || value === null) continue
      index[metric + "::" + group] = value
    }
    return index
  }

  function aggregateModel(modelData, prices) {
    const totals = { input: 0, output: 0, cached: 0, cost: 0 }
    aggregateEntries(modelData && modelData.input, "input", totals, prices)
    aggregateEntries(modelData && modelData.output, "output", totals, prices)
    aggregateEntries(modelData && modelData.cached, "cached", totals, prices)
    return totals
  }

  function aggregateEntries(entries, targetKey, totals, prices) {
    if (!Array.isArray(entries)) return
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      if (!entry || typeof entry !== "object") continue
      const tokens = readNumber(entry.value_paid) ?? readNumber(entry.value) ?? 0
      totals[targetKey] += tokens
      const metric = readString(entry.billing_metric)
      const group = readString(entry.billing_group)
      if (metric && group) {
        totals.cost += tokens * (prices[metric + "::" + group] || 0)
      }
    }
  }

  function aggregateModelMap(models, prices, totals, countModels) {
    if (!models || typeof models !== "object") return
    const keys = Object.keys(models)
    for (let i = 0; i < keys.length; i++) {
      const modelTotals = aggregateModel(models[keys[i]], prices)
      if (countModels) totals.modelCount += 1
      totals.input += modelTotals.input
      totals.output += modelTotals.output
      totals.cached += modelTotals.cached
      totals.cost += modelTotals.cost
    }
  }

  function parseUsagePayload(payload) {
    if (!payload || typeof payload !== "object") return null
    const prices = buildPriceIndex(payload.prices)
    const totals = { input: 0, output: 0, cached: 0, cost: 0, modelCount: 0 }

    aggregateModelMap(payload.completion && payload.completion.models, prices, totals, true)
    aggregateModelMap(payload.ocr && payload.ocr.models, prices, totals, false)
    aggregateModelMap(payload.connectors && payload.connectors.models, prices, totals, false)
    aggregateModelMap(payload.audio && payload.audio.models, prices, totals, false)
    aggregateModelMap(payload.libraries_api && payload.libraries_api.pages && payload.libraries_api.pages.models, prices, totals, false)
    aggregateModelMap(payload.libraries_api && payload.libraries_api.tokens && payload.libraries_api.tokens.models, prices, totals, false)
    aggregateModelMap(payload.fine_tuning && payload.fine_tuning.training, prices, totals, false)
    aggregateModelMap(payload.fine_tuning && payload.fine_tuning.storage, prices, totals, false)

    return {
      totalCost: totals.cost,
      currency: readString(payload.currency) || "EUR",
      currencySymbol: readString(payload.currency_symbol) || "€",
      totalInputTokens: totals.input,
      totalOutputTokens: totals.output,
      totalCachedTokens: totals.cached,
      modelCount: totals.modelCount,
      startDate: payload.start_date || null,
      endDate: payload.end_date || null,
    }
  }

  function fetchUsage(ctx, cookieHeader) {
    const csrfToken = cookieValue(cookieHeader, "csrftoken")
    const headers = {
      Accept: "*/*",
      Cookie: cookieHeader,
      Referer: "https://admin.mistral.ai/organization/usage",
      Origin: "https://admin.mistral.ai",
      "User-Agent": "UsageBar",
    }
    if (csrfToken) headers["X-CSRFTOKEN"] = csrfToken

    let resp
    try {
      resp = ctx.util.request({
        method: "GET",
        url: monthUsageUrl(new Date()),
        headers,
        timeoutMs: 15000,
      })
    } catch (e) {
      ctx.host.log.error("Mistral usage request failed: " + String(e))
      throw "Usage request failed. Check your connection."
    }

    if (ctx.util.isAuthStatus(resp.status)) {
      throw "Session expired. Update your Mistral cookie and try again."
    }
    if (resp.status < 200 || resp.status >= 300) {
      throw "Usage request failed (HTTP " + String(resp.status) + "). Try again later."
    }

    const payload = ctx.util.tryParseJson(resp.bodyText)
    if (!payload || typeof payload !== "object") {
      throw "Usage response invalid. Try again later."
    }
    return payload
  }

  function probe(ctx) {
    const cookieHeader = loadCookieHeader(ctx)
    if (!cookieHeader) {
      throw "Not logged in. Save a Mistral Cookie header or set MISTRAL_COOKIE_HEADER."
    }

    const snapshot = parseUsagePayload(fetchUsage(ctx, cookieHeader))
    if (!snapshot) {
      throw "Usage response invalid. Try again later."
    }

    const spend = snapshot.totalCost > 0
      ? snapshot.currencySymbol + snapshot.totalCost.toFixed(4) + " this month"
      : "No usage this month"
    const lines = [
      ctx.line.text({ label: "Spend", value: spend }),
      ctx.line.text({ label: "Input tokens", value: fmtCount(snapshot.totalInputTokens) }),
      ctx.line.text({ label: "Output tokens", value: fmtCount(snapshot.totalOutputTokens) }),
    ]
    if (snapshot.totalCachedTokens > 0) {
      lines.push(ctx.line.text({ label: "Cached tokens", value: fmtCount(snapshot.totalCachedTokens) }))
    }
    lines.push(ctx.line.text({ label: "Models", value: fmtCount(snapshot.modelCount) }))

    return { plan: snapshot.currency, lines }
  }

  globalThis.__openusage_plugin = { id: "mistral", probe }
})()
