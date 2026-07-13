;(function () {
  const BASE_URL = "https://api.openai.com"
  const COSTS_PATH = "/v1/organization/costs"
  const COMPLETIONS_USAGE_PATH = "/v1/organization/usage/completions"
  const TIMEOUT_MS = 15000
  const DAY_SECONDS = 24 * 60 * 60

  function readString(value) {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed || null
  }

  function readNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null
    const text = readString(value)
    if (!text) return null
    const number = Number(text)
    return Number.isFinite(number) ? number : null
  }

  function loadApiKey(ctx) {
    if (ctx.host.providerSecrets && typeof ctx.host.providerSecrets.read === "function") {
      try {
        const stored = readString(ctx.host.providerSecrets.read("apiKey"))
        if (stored) return stored
      } catch (e) {
        ctx.host.log.warn("OpenAI API secret read failed: " + String(e))
      }
    }

    if (ctx.host.env && typeof ctx.host.env.get === "function") {
      try {
        return (
          readString(ctx.host.env.get("OPENAI_ADMIN_API_KEY")) ||
          readString(ctx.host.env.get("OPENAI_API_KEY"))
        )
      } catch (e) {
        ctx.host.log.warn("OpenAI API env read failed: " + String(e))
      }
    }

    return null
  }

  function nowSeconds(ctx) {
    const parsed = Date.parse(ctx.nowIso || "")
    const ms = Number.isFinite(parsed) ? parsed : Date.now()
    return Math.floor(ms / 1000)
  }

  function startOfUtcDaySeconds(seconds) {
    const date = new Date(seconds * 1000)
    return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000)
  }

  function buildUrl(path, params) {
    const query = []
    const keys = Object.keys(params)
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i]
      const value = params[key]
      if (value === null || value === undefined) continue
      if (Array.isArray(value)) {
        for (let j = 0; j < value.length; j += 1) {
          query.push(encodeURIComponent(key) + "[]=" + encodeURIComponent(value[j]))
        }
      } else {
        query.push(encodeURIComponent(key) + "=" + encodeURIComponent(value))
      }
    }
    return BASE_URL + path + (query.length ? "?" + query.join("&") : "")
  }

  function requestJson(ctx, apiKey, path, params) {
    const response = ctx.host.http.request({
      method: "GET",
      url: buildUrl(path, params),
      headers: {
        Authorization: "Bearer " + apiKey,
        Accept: "application/json",
      },
      timeoutMs: TIMEOUT_MS,
    })

    if (ctx.util.isAuthStatus(response.status)) {
      throw "OpenAI Admin API key is invalid or lacks organization usage permissions."
    }
    if (response.status < 200 || response.status >= 300) {
      throw "OpenAI usage request failed (HTTP " + response.status + ")."
    }

    const parsed = ctx.util.tryParseJson(response.bodyText)
    if (!parsed || typeof parsed !== "object") {
      throw "OpenAI usage response was not valid JSON."
    }
    return parsed
  }

  function readCostAmount(result) {
    if (!result || typeof result !== "object") return 0
    const amount =
      result.amount && typeof result.amount === "object"
        ? readNumber(result.amount.value)
        : readNumber(result.amount)
    return amount === null ? 0 : amount
  }

  function readBuckets(payload) {
    if (!payload || typeof payload !== "object") return []
    return Array.isArray(payload.data) ? payload.data : []
  }

  function sumCosts(buckets, startSeconds, endSeconds) {
    let total = 0
    for (let i = 0; i < buckets.length; i += 1) {
      const bucket = buckets[i]
      if (!bucket || typeof bucket !== "object") continue
      const bucketStart = readNumber(bucket.start_time)
      if (bucketStart === null || bucketStart < startSeconds || bucketStart >= endSeconds) continue
      const results = Array.isArray(bucket.results) ? bucket.results : []
      for (let j = 0; j < results.length; j += 1) total += readCostAmount(results[j])
    }
    return total
  }

  function readUsageResult(result) {
    if (!result || typeof result !== "object") return null
    const inputTokens = readNumber(result.input_tokens) || 0
    const outputTokens = readNumber(result.output_tokens) || 0
    const requests = readNumber(result.num_model_requests) || readNumber(result.requests) || 0
    const model = readString(result.model) || "unknown"
    return { model, inputTokens, outputTokens, requests }
  }

  function summarizeUsage(payload) {
    const totals = { inputTokens: 0, outputTokens: 0, requests: 0 }
    const byModel = new Map()
    const buckets = readBuckets(payload)
    for (let i = 0; i < buckets.length; i += 1) {
      const results = Array.isArray(buckets[i].results) ? buckets[i].results : []
      for (let j = 0; j < results.length; j += 1) {
        const row = readUsageResult(results[j])
        if (!row) continue
        totals.inputTokens += row.inputTokens
        totals.outputTokens += row.outputTokens
        totals.requests += row.requests
        const existing = byModel.get(row.model) || { model: row.model, tokens: 0, requests: 0 }
        existing.tokens += row.inputTokens + row.outputTokens
        existing.requests += row.requests
        byModel.set(row.model, existing)
      }
    }
    const models = Array.from(byModel.values()).sort((a, b) => b.tokens - a.tokens)
    return { totals, models }
  }

  function bucketPeriod(bucket) {
    if (!bucket || typeof bucket !== "object") return null
    const startSeconds = readNumber(bucket.start_time)
    if (startSeconds === null) return null
    const endSeconds = readNumber(bucket.end_time) || startSeconds + DAY_SECONDS
    if (endSeconds <= startSeconds) return null
    return {
      periodStart: new Date(startSeconds * 1000).toISOString(),
      periodEnd: new Date(endSeconds * 1000).toISOString(),
    }
  }

  function buildUsageHistory(costPayload, usagePayload) {
    const entries = []
    const costBuckets = readBuckets(costPayload)
    for (let i = 0; i < costBuckets.length; i += 1) {
      const bucket = costBuckets[i]
      const period = bucketPeriod(bucket)
      if (!period) continue
      const results = Array.isArray(bucket.results) ? bucket.results : []
      if (results.length === 0) continue
      let costUsd = 0
      for (let j = 0; j < results.length; j += 1) costUsd += readCostAmount(results[j])
      entries.push({ ...period, costUsd })
    }

    const usageBuckets = readBuckets(usagePayload)
    for (let i = 0; i < usageBuckets.length; i += 1) {
      const bucket = usageBuckets[i]
      const period = bucketPeriod(bucket)
      if (!period) continue
      const results = Array.isArray(bucket.results) ? bucket.results : []
      for (let j = 0; j < results.length; j += 1) {
        const row = readUsageResult(results[j])
        if (!row) continue
        const totalTokens = row.inputTokens + row.outputTokens
        if (totalTokens === 0 && row.requests === 0) continue
        entries.push({
          ...period,
          model: row.model,
          inputTokens: row.inputTokens,
          outputTokens: row.outputTokens,
          totalTokens,
          requests: row.requests,
        })
      }
    }

    return {
      version: 1,
      source: "openai-organization",
      timeZone: "UTC",
      entries,
    }
  }

  function formatMoney(value) {
    return "$" + (Math.round(value * 100) / 100).toFixed(2)
  }

  function formatCompactNumber(value) {
    const number = Number(value) || 0
    if (number >= 1000000) return (number / 1000000).toFixed(number >= 10000000 ? 0 : 1) + "M"
    if (number >= 1000) return (number / 1000).toFixed(number >= 10000 ? 0 : 1) + "K"
    return String(Math.round(number))
  }

  function probe(ctx) {
    const apiKey = loadApiKey(ctx)
    if (!apiKey) throw "OpenAI Admin API key missing. Save it in Setup or set OPENAI_ADMIN_API_KEY."

    const currentDayStart = startOfUtcDaySeconds(nowSeconds(ctx))
    const endSeconds = currentDayStart + DAY_SECONDS
    const start30 = currentDayStart - 29 * DAY_SECONDS
    const start7 = currentDayStart - 6 * DAY_SECONDS

    const costs = requestJson(ctx, apiKey, COSTS_PATH, {
      start_time: start30,
      end_time: endSeconds,
      bucket_width: "1d",
      limit: 31,
    })
    const usage = requestJson(ctx, apiKey, COMPLETIONS_USAGE_PATH, {
      start_time: start30,
      end_time: endSeconds,
      bucket_width: "1d",
      group_by: ["model"],
      limit: 31,
    })

    const costBuckets = readBuckets(costs)
    const usageSummary = summarizeUsage(usage)
    const today = sumCosts(costBuckets, currentDayStart, endSeconds)
    const sevenDays = sumCosts(costBuckets, start7, endSeconds)
    const thirtyDays = sumCosts(costBuckets, start30, endSeconds)
    const topModel = usageSummary.models[0]

    const lines = [
      ctx.line.text({ label: "Today", value: formatMoney(today), subtitle: "OpenAI API spend" }),
      ctx.line.text({
        label: "7 days",
        value: formatMoney(sevenDays),
        subtitle: "OpenAI API spend",
      }),
      ctx.line.text({
        label: "30 days",
        value: formatMoney(thirtyDays),
        subtitle: "OpenAI API spend",
      }),
      ctx.line.text({
        label: "Tokens",
        value:
          formatCompactNumber(usageSummary.totals.inputTokens + usageSummary.totals.outputTokens) +
          " total",
        subtitle:
          formatCompactNumber(usageSummary.totals.inputTokens) +
          " in / " +
          formatCompactNumber(usageSummary.totals.outputTokens) +
          " out",
      }),
      ctx.line.text({
        label: "Requests",
        value: formatCompactNumber(usageSummary.totals.requests),
        subtitle: "Completions usage API",
      }),
    ]

    if (topModel) {
      lines.push(
        ctx.line.text({
          label: "Top model",
          value: topModel.model,
          subtitle: formatCompactNumber(topModel.tokens) + " tokens",
        })
      )
    }

    return {
      plan: "API spend: " + formatMoney(thirtyDays) + " / 30 days",
      lines,
      history: buildUsageHistory(costs, usage),
    }
  }

  globalThis.__openusage_plugin = { id: "openai-api", probe }
})()
