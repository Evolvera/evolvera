import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const sdkRoot = process.env.PI_SDK_ROOT;
assert.ok(sdkRoot && path.isAbsolute(sdkRoot), "PI_SDK_ROOT must point to the SDK under test");
const repoRoot = path.resolve(import.meta.dirname, "../..");
const sdkUrl = (relative) => pathToFileURL(path.join(sdkRoot, relative)).href;
const sdk = await import(sdkUrl("dist/index.js"));
const { loadExtensions } = await import(sdkUrl("dist/core/extensions/loader.js"));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "opengateway-smoke-"));
const originalFetch = globalThis.fetch;
const calls = [];
const credential = "synthetic-profile-key";
let catalogUnavailable = true;
try {
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === "https://apis.opengateway.ai/v1/models") {
      if (catalogUnavailable) throw new Error("synthetic catalog outage");
      return Response.json({ data: [
        null,
        {
          id: "maker/model-with-slash",
          modalities: { input: ["text"] },
          endpoints: ["chat_completions"],
          context_window: 32_000,
          pricing: { prompt: "0.000002", completion: "0.000008", input_cache_read: "0.0000005" },
        },
        {
          id: "invalid/blank-price",
          modalities: { input: ["text"] },
          endpoints: ["responses"],
          context_window: 32_000,
          pricing: { prompt: "   ", completion: "0.000008" },
        },
        {
          id: "invalid/overflow-price",
          modalities: { input: ["text"] },
          endpoints: ["responses"],
          context_window: 32_000,
          pricing: { prompt: "1e308", completion: "0.000008" },
        },
        {
          id: "openai/o4-mini",
          modalities: { input: ["text", "image"] },
          endpoints: ["chat_completions", "responses"],
          context_window: 200_000,
          pricing: { prompt: "0.0000011", completion: "0.0000044", input_cache_read: "0.000000275" },
        },
      ] });
    }
    if (url !== "https://apis.opengateway.ai/v1/chat/completions") {
      throw new Error(`Unexpected mocked provider URL: ${url}`);
    }
    assert.equal(new Headers(init.headers).get("authorization"), `Bearer ${credential}`);
    const body = JSON.parse(init.body);
    calls.at(-1).body = body;
    return new Response('data: {"choices":[{"delta":{"content":"offline-smoke-ok"},"finish_reason":null}],"usage":{"prompt_tokens":2,"completion_tokens":3}}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":3}}\n\ndata: [DONE]\n\n', {
      headers: { "content-type": "text/event-stream" },
    });
  };

  const loaded = await loadExtensions([path.join(repoRoot, "extensions/opengateway.ts")], temp);
  assert.equal(loaded.diagnostics?.length ?? 0, 0);
  assert.equal(loaded.runtime.pendingProviderRegistrations.length, 1);
  const registration = loaded.runtime.pendingProviderRegistrations[0];
  assert.equal(registration.name, "opengateway");
  assert.equal(registration.config.name, "OpenGateway");
  assert.equal(registration.config.models[0].reasoning, true);

  let storedCredential;
  const credentials = {
    async read(providerId) { return providerId === "opengateway" ? storedCredential : undefined; },
    async list() { return storedCredential ? [{ providerId: "opengateway", type: "api_key" }] : []; },
    async modify(_providerId, update) { storedCredential = await update(storedCredential); return storedCredential; },
    async delete() { storedCredential = undefined; },
  };
  const runtime = await sdk.ModelRuntime.create({ credentials, modelsPath: null, refreshOnCreate: false });
  runtime.registerProvider(registration.name, registration.config);
  const loginCredential = await runtime.login("opengateway", "api_key", {
    async prompt() { return credential; },
    notify() {},
  });
  assert.equal(loginCredential.type, "api_key");
  assert.equal(storedCredential.key, credential);
  assert.equal((await runtime.checkAuth("opengateway")).type, "api_key");

  let refresh = await runtime.refresh({ providers: ["opengateway"], allowNetwork: true, force: true });
  assert.equal(refresh.errors.has("opengateway"), false);
  assert.equal(runtime.getModels("opengateway").length, 1);
  assert.equal(runtime.getModel("opengateway", "openai/o4-mini").reasoning, true);

  catalogUnavailable = false;
  refresh = await runtime.refresh({ providers: ["opengateway"], allowNetwork: true, force: true });
  assert.equal(refresh.errors.has("opengateway"), false);
  const ids = runtime.getModels("opengateway").map((model) => model.id).sort();
  assert.deepEqual(ids, ["maker/model-with-slash", "openai/o4-mini"]);
  const catalogRequests = calls.filter((call) => call.url === "https://apis.opengateway.ai/v1/models");
  assert.ok(catalogRequests.length > 0, "the catalog was requested");
  for (const request of catalogRequests) {
    assert.equal(new Headers(request.init.headers).get("authorization"), `Bearer ${credential}`,
      "the catalog must be key-scoped so only callable models are advertised");
  }
  const model = runtime.getModel("opengateway", "maker/model-with-slash");
  assert.ok(model, "catalog model is selectable through the native model runtime");
  assert.equal(model.reasoning, false, "unknown reasoning capability remains conservative");
  assert.equal(model.maxTokens, 8_192);

  const stream = runtime.streamSimple(model, { messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }] }, { fetch: globalThis.fetch });
  const events = [];
  for await (const event of stream) events.push(event);
  const request = calls.find((call) => call.url === "https://apis.opengateway.ai/v1/chat/completions");
  assert.ok(request, `native request endpoint was not called: ${calls.map((call) => call.url).join(", ")}`);
  assert.equal(request.body.model, "maker/model-with-slash");
  assert.equal(events.at(-1).type, "done", JSON.stringify(events.at(-1)));
  assert.equal(events.at(-1).message.content[0].text, "offline-smoke-ok");

  const fetchCountBeforeOffline = calls.length;
  refresh = await runtime.refresh({ providers: ["opengateway"], allowNetwork: false, force: true });
  assert.equal(calls.length, fetchCountBeforeOffline, "an offline cached refresh does not fetch");
  assert.deepEqual(runtime.getModels("opengateway").map((entry) => entry.id).sort(), ids, "an offline refresh preserves the discovered catalog");

  const fetchCountBeforeAbort = calls.length;
  const aborted = new AbortController();
  aborted.abort();
  refresh = await runtime.refresh({ providers: ["opengateway"], allowNetwork: true, force: true, signal: aborted.signal });
  assert.equal(calls.length, fetchCountBeforeAbort, "a pre-aborted cached refresh does not fetch");
  assert.deepEqual(runtime.getModels("opengateway").map((entry) => entry.id).sort(), ids, "a pre-aborted refresh preserves the discovered catalog");

  catalogUnavailable = true;
  refresh = await runtime.refresh({ providers: ["opengateway"], allowNetwork: true, force: true });
  assert.equal(refresh.errors.has("opengateway"), true, "a later catalog failure is reported rather than hidden");
  assert.deepEqual(runtime.getModels("opengateway").map((entry) => entry.id).sort(), ids, "cached discovered models survive transient catalog failure");
  assert.equal(calls.every(({ url }) => ["https://apis.opengateway.ai/v1/models", "https://apis.opengateway.ai/v1/chat/completions"].includes(url)), true);
} finally {
  globalThis.fetch = originalFetch;
  fs.rmSync(temp, { recursive: true, force: true });
}
