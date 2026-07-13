# Competitor Provider Expansion Triage

Date: 2026-06-26

## Executive Summary

- OpenAI API is implemented first because it has direct organization cost and usage endpoints.
- Qwen is a plausible next provider only if we target Alibaba Model Studio / Qwen Code local auth and can verify quota semantics.
- Doubao should wait for a clear Volcano Engine usage/billing endpoint rather than only model-call API docs.
- Manus should wait because the public docs found describe task/workflow APIs, not account quota or usage accounting.

## Candidates

### OpenAI API

Decision: implemented as `openai-api`.

Reason: the provider can expose direct spend windows and usage summaries from authenticated organization APIs, matching the competitor plan's highest-value cost visibility track.

### Qwen

Decision: research next; do not implement in this slice.

Current evidence:

- Alibaba Cloud Model Studio documents Qwen model APIs, including OpenAI-compatible Chat Completions and Responses, Anthropic-compatible Messages, and DashScope native interfaces.
- Qwen Code docs list current auth paths: Alibaba ModelStudio, third-party providers, and custom providers.
- Qwen Code docs say the Qwen OAuth free tier was discontinued on 2026-04-15, so a local OAuth-free provider would be stale.

Implementation bar:

- Find a stable quota, subscription, balance, or billing usage source.
- Prefer a Qwen Code local settings/auth reader only if it can map to real quota/billing state.
- Otherwise implement a Model Studio API-key provider only after official usage/balance docs are identified.

Sources:

- https://www.alibabacloud.com/help/en/model-studio/qwen-api-reference/
- https://qwenlm.github.io/qwen-code-docs/en/users/configuration/auth/

### Doubao

Decision: defer.

Current evidence:

- Public docs and guides point to Volcano Engine / Ark API-key setup, model activation, and OpenAI-compatible model calls.
- The current evidence is enough for model invocation, but not enough for UsageBar's provider goal: reliable account quota, balance, spend, or usage windows.

Implementation bar:

- Locate an official Volcano Engine billing/usage API for Ark/Doubao model consumption.
- Verify API-key permission scope and response shape with fixtures before adding a plugin.

### Manus

Decision: defer.

Current evidence:

- Manus docs describe a REST API for creating projects/tasks, managing files, webhooks, integrations, and agent workflows.
- The fetched docs also mark API v1 as deprecated and point new work toward v2.
- No account quota, credit, cost, or usage endpoint was found in the docs reviewed for this slice.

Implementation bar:

- Use only API v2.
- Find documented usage/credit/billing endpoints, or local account evidence, before plugin work.

Sources:

- https://open.manus.ai/docs/v1/overview
- https://manus.im/docs/integrations/manus-api
