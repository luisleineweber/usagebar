import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makePluginTestContext } from "../test-helpers.js";

const TELEMETRY_PATH = "~/AppData/Local/Zed/logs/telemetry.log";
const CREDENTIAL_TARGET = "zed:url=https://zed.dev";
const BILLING_URL = "https://cloud.zed.dev/frontend/billing/usage";
const BILLING_SUBSCRIPTION_URL = "https://cloud.zed.dev/frontend/billing/subscriptions/current";

const loadPlugin = async () => {
  await import("./plugin.js");
  return globalThis.__openusage_plugin;
};

function setWindows(ctx) {
  ctx.app.platform = "windows";
}

function setCredential(ctx, rawValue) {
  ctx.host.keychain.readGenericPasswordForTarget.mockImplementation((target) => {
    if (target === CREDENTIAL_TARGET) return rawValue;
    return null;
  });
}

function setCookie(ctx, value) {
  ctx.host.providerSecrets.read.mockImplementation((key) => {
    if (key === "cookieHeader") return value;
    return null;
  });
}

function setTelemetry(ctx, entries) {
  const text = entries.map((entry) => JSON.stringify(entry)).join("\n");
  ctx.host.fs.writeText(TELEMETRY_PATH, text);
}

function usageEntry(promptId, overrides = {}) {
  return {
    event_type: "Agent Thread Completion Usage Updated",
    event_properties: {
      prompt_id: promptId,
      model_provider: "zed.dev",
      model: "zed.dev/claude-sonnet-4-6",
      input_tokens: 3,
      output_tokens: 8,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 1200,
      ...overrides,
    },
  };
}

function billingPayload(overrides = {}) {
  return {
    plan: "token_based_zed_student",
    current_usage: {
      token_spend_in_cents: 1000,
      token_spend: {
        spend_in_cents: 1000,
        limit_in_cents: 1000,
        updated_at: "2026-04-03T14:33:11.104Z",
      },
    },
    ...overrides,
  };
}

function subscriptionPayload(overrides = {}) {
  return {
    subscription: {
      id: 1596962,
      name: "Zed Student",
      is_token_based: true,
      status: "active",
      period: {
        start_at: "2026-04-10T00:00:00.000Z",
        end_at: "2026-05-10T00:00:00.000Z",
      },
      ...overrides,
    },
  };
}

describe("zed plugin", () => {
  beforeEach(() => {
    delete globalThis.__openusage_plugin;
    vi.resetModules();
  });

  it("ships plugin metadata with dashboard-billing support lines", () => {
    const manifest = JSON.parse(readFileSync("plugins/zed/plugin.json", "utf8"));

    expect(manifest.id).toBe("zed");
    expect(manifest.name).toBe("Zed");
    expect(manifest.platformSupport.windows.state).toBe("experimental");
    expect(manifest.lines).toEqual([
      { type: "badge", label: "Source", scope: "detail" },
      { type: "progress", label: "Spend", scope: "overview", primaryOrder: 1 },
      { type: "text", label: "Limit", scope: "detail" },
      { type: "text", label: "Updated", scope: "detail" },
      { type: "text", label: "Prompts", scope: "detail" },
      { type: "text", label: "Input", scope: "detail" },
      { type: "text", label: "Output", scope: "detail" },
      { type: "text", label: "Cache read", scope: "detail" },
      { type: "text", label: "Cache write", scope: "detail" },
      { type: "text", label: "Models", scope: "detail" },
    ]);
  });

  it("uses the dashboard billing cookie header when configured", async () => {
    const ctx = makePluginTestContext();
    setWindows(ctx);
    setCookie(ctx, "session=abc; zed_session=def");
    ctx.host.browser.requestWithCookies.mockImplementation((request) => {
      if (request.url === BILLING_URL) {
        return { status: 200, bodyText: JSON.stringify(billingPayload()) };
      }
      if (request.url === BILLING_SUBSCRIPTION_URL) {
        return { status: 200, bodyText: JSON.stringify(subscriptionPayload()) };
      }
      return { status: 404, bodyText: "" };
    });

    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);

    expect(result.plan).toBe("Zed Student");
    expect(result.lines.find((line) => line.label === "Source")).toEqual({
      type: "badge",
      label: "Source",
      text: "Dashboard billing",
      subtitle: "Live browser-backed dashboard request.",
    });
    expect(result.lines.find((line) => line.label === "Spend")).toEqual({
      type: "progress",
      label: "Spend",
      used: 10,
      limit: 10,
      format: { kind: "dollars" },
      resetsAt: "2026-05-10T00:00:00.000Z",
      periodDurationMs: 30 * 24 * 60 * 60 * 1000,
    });
    expect(result.lines.find((line) => line.label === "Limit")?.value).toBe("$10");
    expect(result.lines.find((line) => line.label === "Updated")?.value).toBe("2026-04-03T14:33:11.104Z");

    const usageRequest = ctx.host.browser.requestWithCookies.mock.calls[0][0];
    expect(usageRequest.url).toBe(BILLING_URL);
    expect(usageRequest.cookieHeader).toBe("session=abc; zed_session=def");
    expect(usageRequest.sourceUrl).toBe("https://dashboard.zed.dev/account");
    const subscriptionRequest = ctx.host.browser.requestWithCookies.mock.calls[1][0];
    expect(subscriptionRequest.url).toBe(BILLING_SUBSCRIPTION_URL);
    expect(subscriptionRequest.cookieHeader).toBe("session=abc; zed_session=def");
    expect(subscriptionRequest.sourceUrl).toBe("https://dashboard.zed.dev/account");
    expect(ctx.host.keychain.readGenericPasswordForTarget).not.toHaveBeenCalled();
  });

  it("keeps billing spend when subscription period is unavailable", async () => {
    const ctx = makePluginTestContext();
    setWindows(ctx);
    setCookie(ctx, "session=abc");
    ctx.host.browser.requestWithCookies.mockImplementation((request) => {
      if (request.url === BILLING_URL) {
        return { status: 200, bodyText: JSON.stringify(billingPayload()) };
      }
      return { status: 500, bodyText: "" };
    });

    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);

    const spend = result.lines.find((line) => line.label === "Spend");
    expect(spend.used).toBe(10);
    expect(spend.resetsAt).toBeUndefined();
    expect(spend.periodDurationMs).toBeUndefined();
    expect(ctx.host.log.warn).toHaveBeenCalledWith(
      "zed billing subscription unavailable: Zed billing subscription request failed (HTTP 500). Try again later."
    );
  });

  it("throws a clear auth error when the billing cookie is stale", async () => {
    const ctx = makePluginTestContext();
    setWindows(ctx);
    setCookie(ctx, "session=abc");
    ctx.host.browser.requestWithCookies.mockReturnValue({ status: 401, bodyText: "" });

    const plugin = await loadPlugin();
    expect(() => plugin.probe(ctx)).toThrow(
      "Zed dashboard session expired or was rejected. Re-capture the Cookie header from a fresh /frontend/billing/usage request."
    );
  });

  it("fails loudly when the billing payload is missing token spend", async () => {
    const ctx = makePluginTestContext();
    setWindows(ctx);
    setCookie(ctx, "session=abc");
    ctx.host.browser.requestWithCookies.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({ plan: "zed pro", current_usage: {} }),
    });

    const plugin = await loadPlugin();
    expect(() => plugin.probe(ctx)).toThrow(
      "Zed billing response missing spend data. Refresh the Cookie header or update UsageBar."
    );
  });

  it("falls back to local telemetry when no billing cookie is configured", async () => {
    const ctx = makePluginTestContext();
    setWindows(ctx);
    setCredential(ctx, "zed-client-token");
    setTelemetry(ctx, [
      usageEntry("prompt-1", { output_tokens: 8, cache_creation_input_tokens: 1200 }),
      usageEntry("prompt-1", { output_tokens: 140, cache_creation_input_tokens: 1200 }),
      usageEntry("prompt-2", {
        model: "zed.dev/gpt-5",
        input_tokens: 12,
        output_tokens: 40,
        cache_read_input_tokens: 800,
        cache_creation_input_tokens: 0,
      }),
    ]);

    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);

    expect(result.plan).toBe("Telemetry");
    expect(result.lines.find((line) => line.label === "Source")).toEqual({
      type: "badge",
      label: "Source",
      text: "Local telemetry",
      subtitle: "Billing cookie not configured.",
    });
    expect(result.lines.find((line) => line.label === "Prompts")?.value).toBe("2");
    expect(result.lines.find((line) => line.label === "Input")?.value).toBe("15");
    expect(result.lines.find((line) => line.label === "Output")?.value).toBe("180");
    expect(result.lines.find((line) => line.label === "Cache read")?.value).toBe("800");
    expect(result.lines.find((line) => line.label === "Cache write")?.value).toBe("1.2k");
    expect(result.lines.find((line) => line.label === "Models")?.value).toBe(
      "zed.dev/claude-sonnet-4-6, zed.dev/gpt-5"
    );
    expect(ctx.host.browser.requestWithCookies).not.toHaveBeenCalled();
  });

  it("extracts the token from Zed's JSON credential wrapper", async () => {
    const ctx = makePluginTestContext();
    setWindows(ctx);
    setCredential(
      ctx,
      JSON.stringify({
        version: 2,
        id: "client_token_01",
        token: "wrapped-zed-token",
      })
    );
    setTelemetry(ctx, [usageEntry("prompt-1")]);

    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);

    expect(result.lines.find((line) => line.label === "Prompts")?.value).toBe("1");
    expect(ctx.host.keychain.readGenericPasswordForTarget).toHaveBeenCalledWith(CREDENTIAL_TARGET);
  });

  it("throws a clear setup error when the local Zed credential is missing", async () => {
    const ctx = makePluginTestContext();
    setWindows(ctx);
    ctx.host.keychain.readGenericPasswordForTarget.mockImplementation(() => {
      throw new Error("credential read failed: os error 1168");
    });

    const plugin = await loadPlugin();
    expect(() => plugin.probe(ctx)).toThrow(
      "Zed not signed in locally. Open Zed and sign in, then retry."
    );
    expect(ctx.host.browser.requestWithCookies).not.toHaveBeenCalled();
  });

  it("throws when the local Zed credential payload is malformed", async () => {
    const ctx = makePluginTestContext();
    setWindows(ctx);
    setCredential(ctx, JSON.stringify({ version: 2, id: "client_token_01" }));

    const plugin = await loadPlugin();
    expect(() => plugin.probe(ctx)).toThrow("Zed credential invalid. Open Zed and sign in again.");
  });

  it("returns a soft empty telemetry state when Zed is signed in but no usage exists yet", async () => {
    const ctx = makePluginTestContext();
    setWindows(ctx);
    setCredential(ctx, "zed-client-token");
    setTelemetry(ctx, [
      {
        event_type: "Agent Thread Started",
        event_properties: { agent: "zed" },
      },
    ]);

    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);

    expect(result.lines.find((line) => line.label === "Source")).toEqual({
      type: "badge",
      label: "Source",
      text: "Local telemetry",
      subtitle: "Add a billing cookie for spend, or use Zed Agent once.",
    });
    expect(result.lines.find((line) => line.label === "Prompts")?.value).toBe("0");
  });

  it("fails loudly when usage events exist but their telemetry shape is no longer parseable", async () => {
    const ctx = makePluginTestContext();
    setWindows(ctx);
    setCredential(ctx, "zed-client-token");
    setTelemetry(ctx, [
      {
        event_type: "Agent Thread Completion Usage Updated",
        event_properties: {
          model_provider: "zed.dev",
          model: "zed.dev/claude-sonnet-4-6",
        },
      },
    ]);

    const plugin = await loadPlugin();
    expect(() => plugin.probe(ctx)).toThrow("Zed telemetry format changed. Update UsageBar.");
  });
});
