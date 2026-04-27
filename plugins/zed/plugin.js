(function () {
  const PROVIDER_ID = "zed";
  const WINDOWS_CREDENTIAL_TARGET = "zed:url=https://zed.dev";
  const WINDOWS_TELEMETRY_LOG = "~/AppData/Local/Zed/logs/telemetry.log";
  const BILLING_USAGE_URL = "https://cloud.zed.dev/frontend/billing/usage";
  const BILLING_SUBSCRIPTION_URL = "https://cloud.zed.dev/frontend/billing/subscriptions/current";
  const USAGE_EVENT = "Agent Thread Completion Usage Updated";
  const TOKEN_FIELDS = [
    "token",
    "access_token",
    "accessToken",
    "client_token",
    "clientToken",
    "value",
  ];

  function readString(value) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed || null;
  }

  function readNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return null;
    return number;
  }

  function readDashboardCookie(ctx) {
    if (!ctx.host.providerSecrets || typeof ctx.host.providerSecrets.read !== "function") {
      return null;
    }

    try {
      return readString(ctx.host.providerSecrets.read("cookieHeader"));
    } catch (e) {
      ctx.host.log.info("zed cookie read failed: " + String(e));
      return null;
    }
  }

  function isZedHostedUsage(properties) {
    const provider = readString(properties && properties.model_provider);
    if (provider === "zed.dev") return true;
    const model = readString(properties && properties.model);
    return !!(model && model.indexOf("zed.dev/") === 0);
  }

  function extractTokenFromObject(value) {
    if (!value || typeof value !== "object") return null;

    for (let i = 0; i < TOKEN_FIELDS.length; i += 1) {
      const field = TOKEN_FIELDS[i];
      const candidate = readString(value[field]);
      if (candidate) return candidate;
    }

    if (value.credentials && typeof value.credentials === "object") {
      return extractTokenFromObject(value.credentials);
    }

    return null;
  }

  function normalizeCredentialPayload(ctx, raw) {
    const text = readString(raw);
    if (!text) return null;

    const parsed = ctx.util.tryParseJson(text);
    if (parsed && typeof parsed === "object") {
      return extractTokenFromObject(parsed);
    }

    return text;
  }

  function loadLocalCredential(ctx) {
    if (ctx.app.platform !== "windows") {
      throw "Zed currently supports Windows only in this build.";
    }

    if (
      !ctx.host.keychain
      || typeof ctx.host.keychain.readGenericPasswordForTarget !== "function"
    ) {
      throw "Zed credential lookup is unavailable in this build.";
    }

    let raw;
    try {
      raw = ctx.host.keychain.readGenericPasswordForTarget(WINDOWS_CREDENTIAL_TARGET);
    } catch (e) {
      ctx.host.log.info("zed credential read failed: " + String(e));
      throw "Zed not signed in locally. Open Zed and sign in, then retry.";
    }

    const token = normalizeCredentialPayload(ctx, raw);
    if (!token) {
      throw "Zed credential invalid. Open Zed and sign in again.";
    }

    return token;
  }

  function requestBillingJson(ctx, cookieHeader, url, description) {
    if (!ctx.host.browser || typeof ctx.host.browser.requestWithCookies !== "function") {
      throw "Zed browser-backed billing request is unavailable in this build.";
    }

    let response;
    try {
      response = ctx.host.browser.requestWithCookies({
        url,
        cookieHeader,
        sourceUrl: "https://dashboard.zed.dev/account",
        timeoutMs: 15000,
      });
    } catch (e) {
      ctx.host.log.error("zed " + description + " request failed: " + String(e));
      throw "Zed " + description + " request failed: " + String(e);
    }

    if (ctx.util.isAuthStatus(response.status)) {
      throw "Zed dashboard session expired or was rejected. Re-capture the Cookie header from a fresh /frontend/billing/usage request.";
    }
    if (response.status < 200 || response.status >= 300) {
      throw "Zed " + description + " request failed (HTTP " + String(response.status) + "). Try again later.";
    }

    const body = ctx.util.tryParseJson(response.bodyText);
    if (!body || typeof body !== "object") {
      throw "Zed " + description + " response invalid. Refresh the Cookie header or update UsageBar.";
    }

    return body;
  }

  function requestBillingUsage(ctx, cookieHeader) {
    return requestBillingJson(ctx, cookieHeader, BILLING_USAGE_URL, "billing");
  }

  function requestBillingSubscription(ctx, cookieHeader) {
    try {
      return requestBillingJson(ctx, cookieHeader, BILLING_SUBSCRIPTION_URL, "billing subscription");
    } catch (e) {
      ctx.host.log.warn("zed billing subscription unavailable: " + String(e));
      return null;
    }
  }

  function formatBillingPlanLabel(ctx, value) {
    const text = readString(value);
    if (!text) return null;

    const cleaned = text.replace(/^token_based_/i, "").replace(/[_-]+/g, " ");
    const label = ctx.fmt.planLabel(cleaned);
    return label || text;
  }

  function billingPeriod(ctx, subscriptionPayload) {
    const subscription = subscriptionPayload && typeof subscriptionPayload === "object"
      ? subscriptionPayload.subscription
      : null;
    const period = subscription && typeof subscription === "object" ? subscription.period : null;
    if (!period || typeof period !== "object") {
      return { resetsAt: null, periodDurationMs: null };
    }

    const startIso = ctx.util.toIso(period.start_at);
    const endIso = ctx.util.toIso(period.end_at);
    if (!endIso) {
      return { resetsAt: null, periodDurationMs: null };
    }

    let periodDurationMs = null;
    const startMs = ctx.util.parseDateMs(startIso);
    const endMs = ctx.util.parseDateMs(endIso);
    if (startMs !== null && endMs !== null && endMs > startMs) {
      periodDurationMs = endMs - startMs;
    }

    return { resetsAt: endIso, periodDurationMs };
  }

  function buildBillingResult(ctx, payload, subscriptionPayload) {
    const currentUsage = payload.current_usage;
    const tokenSpend = currentUsage && typeof currentUsage === "object" ? currentUsage.token_spend : null;
    if (!currentUsage || typeof currentUsage !== "object") {
      throw "Zed billing response invalid. Refresh the Cookie header or update UsageBar.";
    }

    const spendCents =
      readNumber(currentUsage.token_spend_in_cents) ??
      (tokenSpend && typeof tokenSpend === "object" ? readNumber(tokenSpend.spend_in_cents) : null);
    const limitCents = tokenSpend && typeof tokenSpend === "object" ? readNumber(tokenSpend.limit_in_cents) : null;
    if (spendCents === null || limitCents === null || limitCents <= 0) {
      throw "Zed billing response missing spend data. Refresh the Cookie header or update UsageBar.";
    }

    const updatedAt = tokenSpend && typeof tokenSpend === "object"
      ? ctx.util.toIso(tokenSpend.updated_at)
      : null;
    const plan = formatBillingPlanLabel(ctx, payload.plan);
    const period = billingPeriod(ctx, subscriptionPayload);
    const spendLine = {
      label: "Spend",
      used: ctx.fmt.dollars(spendCents),
      limit: ctx.fmt.dollars(limitCents),
      format: { kind: "dollars" },
    };
    if (period.resetsAt) {
      spendLine.resetsAt = period.resetsAt;
    }
    if (period.periodDurationMs !== null) {
      spendLine.periodDurationMs = period.periodDurationMs;
    }

    return {
      plan: plan ? ctx.fmt.planLabel(plan) : "Billing",
      lines: [
        ctx.line.badge({
          label: "Source",
          text: "Dashboard billing",
          subtitle: "Live browser-backed dashboard request.",
        }),
        ctx.line.progress(spendLine),
        ctx.line.text({
          label: "Limit",
          value: "$" + String(ctx.fmt.dollars(limitCents * 1)),
        }),
        ctx.line.text({
          label: "Updated",
          value: updatedAt || "Unknown",
        }),
      ],
    };
  }

  function telemetryLogPath(ctx) {
    if (ctx.app.platform === "windows") return WINDOWS_TELEMETRY_LOG;
    return null;
  }

  function loadTelemetryLog(ctx) {
    const path = telemetryLogPath(ctx);
    if (!path) {
      throw "Zed telemetry log path unsupported on this platform.";
    }
    if (!ctx.host.fs.exists(path)) {
      throw "Zed telemetry log missing. Use Zed Agent once, then retry.";
    }

    try {
      return ctx.host.fs.readText(path);
    } catch (e) {
      ctx.host.log.warn("zed telemetry read failed: " + String(e));
      throw "Zed telemetry log unreadable. Close Zed and try again.";
    }
  }

  function aggregateTelemetry(ctx, text) {
    const lines = String(text || "").split(/\r?\n/);
    const prompts = {};
    const models = {};
    let matchedUsageEvents = 0;
    let malformedUsageEvents = 0;

    for (let i = 0; i < lines.length; i += 1) {
      const line = readString(lines[i]);
      if (!line) continue;

      const entry = ctx.util.tryParseJson(line);
      if (!entry || typeof entry !== "object") continue;
      if (entry.event_type !== USAGE_EVENT) continue;

      const properties = entry.event_properties;
      if (!properties || typeof properties !== "object") {
        malformedUsageEvents += 1;
        continue;
      }
      if (!isZedHostedUsage(properties)) continue;

      matchedUsageEvents += 1;

      const promptId = readString(properties.prompt_id);
      if (!promptId) {
        malformedUsageEvents += 1;
        continue;
      }

      const inputTokens = readNumber(properties.input_tokens);
      const outputTokens = readNumber(properties.output_tokens);
      const cacheReadTokens = readNumber(properties.cache_read_input_tokens);
      const cacheWriteTokens = readNumber(properties.cache_creation_input_tokens);
      if (
        inputTokens === null
        && outputTokens === null
        && cacheReadTokens === null
        && cacheWriteTokens === null
      ) {
        malformedUsageEvents += 1;
        continue;
      }

      const model = readString(properties.model);
      if (model) models[model] = true;

      if (!prompts[promptId]) {
        prompts[promptId] = {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        };
      }

      const aggregate = prompts[promptId];
      if (inputTokens !== null && inputTokens > aggregate.inputTokens) {
        aggregate.inputTokens = inputTokens;
      }
      if (outputTokens !== null && outputTokens > aggregate.outputTokens) {
        aggregate.outputTokens = outputTokens;
      }
      if (cacheReadTokens !== null && cacheReadTokens > aggregate.cacheReadTokens) {
        aggregate.cacheReadTokens = cacheReadTokens;
      }
      if (cacheWriteTokens !== null && cacheWriteTokens > aggregate.cacheWriteTokens) {
        aggregate.cacheWriteTokens = cacheWriteTokens;
      }
    }

    const promptIds = Object.keys(prompts);
    if (matchedUsageEvents === 0 || promptIds.length === 0) {
      if (malformedUsageEvents > 0) {
        throw "Zed telemetry format changed. Update UsageBar.";
      }
      return {
        promptCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        models: [],
      };
    }

    let inputTotal = 0;
    let outputTotal = 0;
    let cacheReadTotal = 0;
    let cacheWriteTotal = 0;
    for (let i = 0; i < promptIds.length; i += 1) {
      const aggregate = prompts[promptIds[i]];
      inputTotal += aggregate.inputTokens;
      outputTotal += aggregate.outputTokens;
      cacheReadTotal += aggregate.cacheReadTokens;
      cacheWriteTotal += aggregate.cacheWriteTokens;
    }

    return {
      promptCount: promptIds.length,
      inputTokens: inputTotal,
      outputTokens: outputTotal,
      cacheReadTokens: cacheReadTotal,
      cacheWriteTokens: cacheWriteTotal,
      models: Object.keys(models).sort(),
    };
  }

  function formatCount(value) {
    const number = readNumber(value) || 0;
    if (number >= 1000000) {
      return (Math.round((number / 1000000) * 10) / 10).toFixed(number >= 10000000 ? 0 : 1).replace(/\.0$/, "") + "M";
    }
    if (number >= 1000) {
      return (Math.round((number / 1000) * 10) / 10).toFixed(number >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k";
    }
    return String(Math.round(number));
  }

  function formatModels(models) {
    if (!Array.isArray(models) || models.length === 0) return "None";
    if (models.length <= 2) return models.join(", ");
    return models.slice(0, 2).join(", ") + " +" + String(models.length - 2);
  }

  function buildTelemetryResult(ctx, telemetry, subtitle) {
    return {
      plan: "Telemetry",
      lines: [
        ctx.line.badge({
          label: "Source",
          text: "Local telemetry",
          subtitle: subtitle || "Zed-hosted agent usage only.",
        }),
        ctx.line.text({ label: "Prompts", value: formatCount(telemetry.promptCount) }),
        ctx.line.text({ label: "Input", value: formatCount(telemetry.inputTokens) }),
        ctx.line.text({ label: "Output", value: formatCount(telemetry.outputTokens) }),
        ctx.line.text({ label: "Cache read", value: formatCount(telemetry.cacheReadTokens) }),
        ctx.line.text({ label: "Cache write", value: formatCount(telemetry.cacheWriteTokens) }),
        ctx.line.text({ label: "Models", value: formatModels(telemetry.models) }),
      ],
    };
  }

  function probe(ctx) {
    const cookieHeader = readDashboardCookie(ctx);
    if (cookieHeader) {
      return buildBillingResult(
        ctx,
        requestBillingUsage(ctx, cookieHeader),
        requestBillingSubscription(ctx, cookieHeader)
      );
    }

    loadLocalCredential(ctx);
    const telemetry = aggregateTelemetry(ctx, loadTelemetryLog(ctx));
    return buildTelemetryResult(
      ctx,
      telemetry,
      telemetry.promptCount > 0
        ? "Billing cookie not configured."
        : "Add a billing cookie for spend, or use Zed Agent once."
    );
  }

  globalThis.__openusage_plugin = { id: PROVIDER_ID, probe };
})();
