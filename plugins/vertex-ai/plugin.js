(function () {
  const TOKEN_URL = "https://oauth2.googleapis.com/token"
  const MONITORING_BASE_URL = "https://monitoring.googleapis.com/v3/projects"
  const SERVICE_FILTER = 'resource.type="consumer_quota" AND resource.label.service="aiplatform.googleapis.com"'
  const USAGE_FILTER = 'metric.type="serviceruntime.googleapis.com/quota/allocation/usage" AND ' + SERVICE_FILTER
  const LIMIT_FILTER = 'metric.type="serviceruntime.googleapis.com/quota/limit" AND ' + SERVICE_FILTER
  const ONE_DAY_MS = 24 * 60 * 60 * 1000

  function readString(value) {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed || null
  }

  function readNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null
    const text = readString(value)
    if (!text) return null
    const n = Number(text)
    return Number.isFinite(n) ? n : null
  }

  function readEnv(ctx, name) {
    if (!ctx.host.env || typeof ctx.host.env.get !== "function") return null
    try {
      return readString(ctx.host.env.get(name))
    } catch (e) {
      ctx.host.log.warn("env read failed for " + name + ": " + String(e))
      return null
    }
  }

  function joinPath(base, child) {
    return String(base).replace(/[\\/]+$/, "") + "/" + child.replace(/^[\\/]+/, "")
  }

  function gcloudRoots(ctx) {
    const roots = []
    const cloudConfig = readEnv(ctx, "CLOUDSDK_CONFIG")
    if (cloudConfig) roots.push(cloudConfig)
    roots.push("~/AppData/Roaming/gcloud")
    roots.push("~/.config/gcloud")
    return roots
  }

  function readFirstFile(ctx, roots, relativePath) {
    for (let i = 0; i < roots.length; i += 1) {
      const path = joinPath(roots[i], relativePath)
      if (!ctx.host.fs.exists(path)) continue
      try {
        return { path, text: ctx.host.fs.readText(path), root: roots[i] }
      } catch (e) {
        ctx.host.log.warn("vertex-ai failed to read " + path + ": " + String(e))
      }
    }
    return null
  }

  function loadProjectFromConfig(text) {
    const lines = String(text || "").split(/\r?\n/)
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim()
      if (!/^project\s*=/.test(line)) continue
      const parts = line.split("=")
      const value = parts.slice(1).join("=").trim()
      if (value) return value
    }
    return null
  }

  function loadProjectId(ctx, roots) {
    const fromEnv =
      readEnv(ctx, "GOOGLE_CLOUD_PROJECT") ||
      readEnv(ctx, "GCLOUD_PROJECT") ||
      readEnv(ctx, "CLOUDSDK_CORE_PROJECT")
    if (fromEnv) return fromEnv

    const projectFile = readFirstFile(ctx, roots, "configurations/config_default")
    if (!projectFile) return null
    return loadProjectFromConfig(projectFile.text)
  }

  function decodeJwtPayload(ctx, token) {
    const text = readString(token)
    if (!text) return null
    try {
      return ctx.jwt.decodePayload(text)
    } catch {
      return null
    }
  }

  function loadCredentials(ctx) {
    const roots = gcloudRoots(ctx)
    const credentialsFile = readFirstFile(ctx, roots, "application_default_credentials.json")
    if (!credentialsFile) {
      throw "Vertex AI gcloud ADC credentials missing. Run `gcloud auth application-default login`."
    }

    const parsed = ctx.util.tryParseJson(credentialsFile.text)
    if (!parsed || typeof parsed !== "object") {
      throw "Vertex AI gcloud ADC credentials are invalid JSON."
    }
    if (readString(parsed.type) === "service_account" || readString(parsed.private_key)) {
      throw "Vertex AI service-account ADC is not supported yet. Use `gcloud auth application-default login`."
    }

    const clientId = readString(parsed.client_id)
    const clientSecret = readString(parsed.client_secret)
    const refreshToken = readString(parsed.refresh_token)
    if (!clientId || !clientSecret) {
      throw "Vertex AI gcloud ADC credentials are missing OAuth client fields."
    }
    if (!refreshToken) {
      throw "Vertex AI gcloud ADC credentials are missing a refresh token."
    }

    const idTokenPayload = decodeJwtPayload(ctx, parsed.id_token)
    return {
      clientId,
      clientSecret,
      refreshToken,
      accessToken: readString(parsed.access_token),
      expiryIso: ctx.util.toIso(parsed.token_expiry),
      email: idTokenPayload && readString(idTokenPayload.email),
      projectId: loadProjectId(ctx, roots),
      credentialsPath: credentialsFile.path,
    }
  }

  function needsRefresh(ctx, credentials) {
    if (!credentials.accessToken) return true
    const expiryMs = ctx.util.parseDateMs(credentials.expiryIso)
    if (expiryMs === null) return true
    return ctx.util.needsRefreshByExpiry({
      nowMs: ctx.util.parseDateMs(ctx.nowIso),
      expiresAtMs: expiryMs,
      bufferMs: 5 * 60 * 1000,
    })
  }

  function formEncode(params) {
    return Object.keys(params)
      .map((key) => encodeURIComponent(key) + "=" + encodeURIComponent(params[key]))
      .join("&")
  }

  function refreshAccessToken(ctx, credentials) {
    let response
    try {
      response = ctx.host.http.request({
        method: "POST",
        url: TOKEN_URL,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        bodyText: formEncode({
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
          refresh_token: credentials.refreshToken,
          grant_type: "refresh_token",
        }),
        timeoutMs: 15000,
      })
    } catch (e) {
      throw "Vertex AI token refresh failed. Check your connection."
    }

    if (response.status === 400 || response.status === 401) {
      throw "Vertex AI refresh token expired or was revoked. Run `gcloud auth application-default login` again."
    }
    if (response.status < 200 || response.status >= 300) {
      throw "Vertex AI token refresh failed (HTTP " + String(response.status) + ")."
    }

    const data = ctx.util.tryParseJson(response.bodyText)
    const accessToken = data && typeof data === "object" ? readString(data.access_token) : null
    if (!accessToken) {
      throw "Vertex AI token refresh response missing access token."
    }

    const expiresIn = readNumber(data.expires_in) || 3600
    const idTokenPayload = decodeJwtPayload(ctx, data.id_token)
    return {
      ...credentials,
      accessToken,
      expiryIso: new Date((ctx.util.parseDateMs(ctx.nowIso) || Date.now()) + expiresIn * 1000).toISOString(),
      email: (idTokenPayload && readString(idTokenPayload.email)) || credentials.email,
    }
  }

  function monitoringUrl(projectId, filter, pageToken) {
    const now = new Date().toISOString()
    const start = new Date(Date.now() - ONE_DAY_MS).toISOString()
    const params = [
      ["filter", filter],
      ["interval.startTime", start],
      ["interval.endTime", now],
      ["aggregation.alignmentPeriod", "3600s"],
      ["aggregation.perSeriesAligner", "ALIGN_MAX"],
      ["view", "FULL"],
    ]
    if (pageToken) params.push(["pageToken", pageToken])
    return MONITORING_BASE_URL + "/" + encodeURIComponent(projectId) + "/timeSeries?" +
      params.map((entry) => encodeURIComponent(entry[0]) + "=" + encodeURIComponent(entry[1])).join("&")
  }

  function requestMonitoringPage(ctx, credentials, filter, pageToken) {
    let response
    try {
      response = ctx.host.http.request({
        method: "GET",
        url: monitoringUrl(credentials.projectId, filter, pageToken),
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + credentials.accessToken,
        },
        timeoutMs: 30000,
      })
    } catch (e) {
      throw "Vertex AI Cloud Monitoring request failed. Check your connection."
    }

    if (response.status === 401) {
      throw "Vertex AI request unauthorized. Run `gcloud auth application-default login` again."
    }
    if (response.status === 403) {
      throw "Vertex AI access forbidden. Check Cloud Monitoring IAM permissions for the project."
    }
    if (response.status < 200 || response.status >= 300) {
      throw "Vertex AI Cloud Monitoring request failed (HTTP " + String(response.status) + ")."
    }

    const data = ctx.util.tryParseJson(response.bodyText)
    if (!data || typeof data !== "object") {
      throw "Vertex AI Cloud Monitoring response invalid."
    }
    return data
  }

  function fetchTimeSeries(ctx, credentials, filter) {
    const out = []
    let pageToken = null
    do {
      const page = requestMonitoringPage(ctx, credentials, filter, pageToken)
      if (Array.isArray(page.timeSeries)) {
        for (let i = 0; i < page.timeSeries.length; i += 1) out.push(page.timeSeries[i])
      }
      pageToken = readString(page.nextPageToken)
    } while (pageToken)
    return out
  }

  function quotaKey(series) {
    const metricLabels = series && series.metric && typeof series.metric === "object" ? series.metric.labels || {} : {}
    const resourceLabels = series && series.resource && typeof series.resource === "object" ? series.resource.labels || {} : {}
    const quotaMetric = readString(metricLabels.quota_metric) || readString(resourceLabels.quota_id)
    if (!quotaMetric) return null
    const limitName = readString(metricLabels.limit_name) || ""
    const location = readString(resourceLabels.location) || "global"
    return quotaMetric + "|" + limitName + "|" + location
  }

  function pointValue(point) {
    const value = point && point.value && typeof point.value === "object" ? point.value : null
    if (!value) return null
    return readNumber(value.doubleValue) ?? readNumber(value.int64Value)
  }

  function aggregate(seriesList) {
    const buckets = {}
    for (let i = 0; i < seriesList.length; i += 1) {
      const series = seriesList[i]
      const key = quotaKey(series)
      if (!key || !Array.isArray(series.points)) continue
      let maxValue = null
      for (let j = 0; j < series.points.length; j += 1) {
        const value = pointValue(series.points[j])
        if (value !== null) maxValue = Math.max(maxValue === null ? value : maxValue, value)
      }
      if (maxValue !== null) buckets[key] = Math.max(buckets[key] || 0, maxValue)
    }
    return buckets
  }

  function calculateQuotaUsage(ctx, credentials) {
    if (!credentials.projectId) {
      throw "Vertex AI project missing. Run `gcloud config set project PROJECT_ID` or set GOOGLE_CLOUD_PROJECT."
    }

    const usageByKey = aggregate(fetchTimeSeries(ctx, credentials, USAGE_FILTER))
    const limitByKey = aggregate(fetchTimeSeries(ctx, credentials, LIMIT_FILTER))
    let maxPercent = null
    let matched = 0

    for (const key of Object.keys(limitByKey)) {
      const limit = limitByKey[key]
      const usage = usageByKey[key]
      if (!(limit > 0) || usage === undefined) continue
      matched += 1
      const percent = (usage / limit) * 100
      maxPercent = Math.max(maxPercent === null ? percent : maxPercent, percent)
    }

    if (matched === 0 || maxPercent === null) return null
    return Math.max(0, maxPercent)
  }

  function buildResult(ctx, credentials, quotaPercent) {
    const lines = [
      ctx.line.badge({
        label: "Source",
        text: "gcloud ADC",
        subtitle: credentials.projectId || "No project configured",
      }),
      ctx.line.text({ label: "Project", value: credentials.projectId || "Missing" }),
    ]

    if (quotaPercent !== null) {
      lines.splice(1, 0, ctx.line.progress({
        label: "Quota usage",
        used: quotaPercent,
        limit: 100,
        format: { kind: "percent" },
      }))
    } else {
      lines.push(ctx.line.text({ label: "Quota", value: "No recent quota data" }))
    }

    if (credentials.email) {
      lines.push(ctx.line.text({ label: "Account", value: credentials.email }))
    }

    return {
      plan: credentials.projectId || "Vertex AI",
      lines,
    }
  }

  function probe(ctx) {
    let credentials = loadCredentials(ctx)
    if (needsRefresh(ctx, credentials)) {
      credentials = refreshAccessToken(ctx, credentials)
    }
    const quotaPercent = calculateQuotaUsage(ctx, credentials)
    return buildResult(ctx, credentials, quotaPercent)
  }

  globalThis.__openusage_plugin = { id: "vertex-ai", probe }
})()
