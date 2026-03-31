(function () {
  const CREDITS_URL = "https://www.perplexity.ai/rest/billing/credits"

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
      ctx.host.log.warn("stored Perplexity cookie header read failed: " + message)
      return null
    }
  }

  function loadCookieHeader(ctx) {
    const directHeader = readEnv(ctx, "PERPLEXITY_COOKIE_HEADER")
    if (directHeader) return directHeader

    const rawCookie = readEnv(ctx, "PERPLEXITY_COOKIE")
    if (rawCookie) return rawCookie

    const stored = readStoredCookieHeader(ctx)
    if (stored) return stored

    const sessionToken = readEnv(ctx, "PERPLEXITY_SESSION_TOKEN")
    if (sessionToken) return "__Secure-next-auth.session-token=" + sessionToken

    return null
  }

  function readNumber(value) {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }

  function firstNumber(obj, keys) {
    if (!obj || typeof obj !== "object") return null
    for (const key of keys) {
      const n = readNumber(obj[key])
      if (n !== null) return n
    }
    return null
  }

  function bucketName(value) {
    const text = String(value || "").trim().toLowerCase()
    if (!text) return null
    if (/(recurring|subscription|monthly|included|pro|max)/.test(text)) return "recurring"
    if (/(purchased|prepaid|top[\s_-]?up|paid|wallet)/.test(text)) return "purchased"
    if (/(bonus|promo|promotional|gift|credit grant)/.test(text)) return "bonus"
    return null
  }

  function extractGrantBucket(grant) {
    if (!grant || typeof grant !== "object") return null
    return (
      bucketName(grant.kind) ||
      bucketName(grant.type) ||
      bucketName(grant.category) ||
      bucketName(grant.source) ||
      bucketName(grant.name) ||
      bucketName(grant.title)
    )
  }

  function extractGrantTotals(grant) {
    const total = firstNumber(grant, [
      "totalCredits",
      "total_credits",
      "total",
      "limit",
      "credits",
      "granted",
      "startingBalance",
      "starting_balance",
      "amount",
    ])
    const remaining = firstNumber(grant, [
      "remainingCredits",
      "remaining_credits",
      "remaining",
      "available",
      "availableCredits",
      "available_credits",
      "balance",
      "left",
    ])
    const used = firstNumber(grant, ["usedCredits", "used_credits", "used", "consumed", "spent"])
    return {
      total,
      remaining,
      used,
    }
  }

  function extractGrants(payload) {
    if (!payload || typeof payload !== "object") return []
    if (Array.isArray(payload)) return payload

    const directArrays = ["grants", "credit_grants", "credits", "balances", "pools", "items"]
    for (const key of directArrays) {
      if (Array.isArray(payload[key])) return payload[key]
    }

    const nestedObjects = ["data", "result", "billing", "wallet"]
    for (const key of nestedObjects) {
      const nested = payload[key]
      if (!nested || typeof nested !== "object") continue
      const grants = extractGrants(nested)
      if (grants.length > 0) return grants
    }

    return []
  }

  function parseCreditsPayload(payload) {
    const grants = extractGrants(payload)
    if (!Array.isArray(grants) || grants.length === 0) return null

    const buckets = {
      recurring: { total: 0, remaining: 0, present: false },
      purchased: { total: 0, remaining: 0, present: false },
      bonus: { total: 0, remaining: 0, present: false },
    }

    for (const grant of grants) {
      const bucket = extractGrantBucket(grant)
      if (!bucket) continue
      const totals = extractGrantTotals(grant)
      if (totals.total === null && totals.remaining === null && totals.used === null) continue

      const target = buckets[bucket]
      target.present = true
      if (totals.total !== null) target.total += Math.max(0, totals.total)
      if (totals.remaining !== null) {
        target.remaining += Math.max(0, totals.remaining)
      } else if (totals.total !== null && totals.used !== null) {
        target.remaining += Math.max(0, totals.total - totals.used)
      }
    }

    if (!buckets.recurring.present && !buckets.purchased.present && !buckets.bonus.present) {
      return null
    }

    return buckets
  }

  function inferPlanLabel(recurringTotal) {
    if (!Number.isFinite(recurringTotal) || recurringTotal <= 0) return null
    if (recurringTotal >= 10000) return "Max"
    return "Pro"
  }

  function makeCreditsLine(ctx, label, bucket) {
    if (!bucket.present) return null
    const total = Number(bucket.total) || 0
    const remaining = Number(bucket.remaining) || 0
    if (total > 0) {
      const used = Math.max(0, Math.min(total, total - remaining))
      return ctx.line.progress({
        label,
        used,
        limit: total,
        format: { kind: "count", suffix: "credits" },
      })
    }

    return ctx.line.progress({
      label,
      used: 1,
      limit: 1,
      format: { kind: "count", suffix: "credits" },
    })
  }

  function fetchCredits(ctx, cookieHeader) {
    let resp
    try {
      resp = ctx.util.request({
        method: "GET",
        url: CREDITS_URL,
        headers: {
          Accept: "application/json",
          Cookie: cookieHeader,
          "User-Agent": "UsageBar",
        },
        timeoutMs: 10000,
      })
    } catch (e) {
      ctx.host.log.error("Perplexity credits request failed: " + String(e))
      throw "Usage request failed. Check your connection."
    }

    if (ctx.util.isAuthStatus(resp.status)) {
      throw "Session expired. Update your Perplexity cookie and try again."
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
      throw "Not logged in. Save a Perplexity Cookie header or set PERPLEXITY_COOKIE_HEADER."
    }

    const payload = fetchCredits(ctx, cookieHeader)
    const buckets = parseCreditsPayload(payload)
    if (!buckets) {
      throw "Usage response missing credit pools. Try again later."
    }

    const lines = [
      makeCreditsLine(ctx, "Recurring credits", buckets.recurring),
      makeCreditsLine(ctx, "Purchased credits", buckets.purchased),
      makeCreditsLine(ctx, "Bonus credits", buckets.bonus),
    ].filter(Boolean)

    if (lines.length === 0) {
      throw "Usage response missing credit pools. Try again later."
    }

    const plan = inferPlanLabel(buckets.recurring.total)
    return plan ? { plan, lines } : { lines }
  }

  globalThis.__openusage_plugin = { id: "perplexity", probe }
})()
