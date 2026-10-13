import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import path from "node:path";
import { wrapModelsStore } from "../users/sdk-auth-source.mjs";

const registry = path.resolve("synthetic-registry-a", "registry.json");
const registryHash = createHash("sha256").update(process.platform === "win32" ? registry.toLowerCase() : registry).digest("hex");
const cacheKey = (id) => `pi.account/${registryHash}/${id}/openrouter`;

function fakeStore() {
  const values = new Map();
  const calls = [];
  return {
    values,
    calls,
    async read(key, options) { calls.push(["read", key, options]); return values.get(key); },
    async write(key, value, options) { calls.push(["write", key, value, options]); values.set(key, value); },
    async delete(key, options) { calls.push(["delete", key, options]); values.delete(key); },
  };
}

test("OpenRouter personalized catalogs are isolated per account while native providers stay shared", async () => {
  const native = fakeStore();
  const alpha = wrapModelsStore(native, "alpha", registry);
  const beta = wrapModelsStore(native, "beta", registry);
  const unmanagedCatalog = { models: ["unmanaged-openrouter-catalog"] };
  native.values.set("openrouter", unmanagedCatalog);
  const alphaCatalog = { models: ["alpha-private-catalog"] };
  const betaCatalog = { models: ["beta-private-catalog"] };

  assert.equal(await alpha.read("openrouter"), undefined, "selected accounts never restore the unmanaged OpenRouter entry");
  assert.equal(await beta.read("openrouter"), undefined);
  await alpha.write("openrouter", alphaCatalog);
  assert.equal(await beta.read("openrouter"), undefined);
  await beta.write("openrouter", betaCatalog);
  assert.equal(await alpha.read("openrouter"), alphaCatalog);
  assert.equal(await beta.read("openrouter"), betaCatalog);
  assert.deepEqual([...native.values.keys()].sort(), ["openrouter", cacheKey("alpha"), cacheKey("beta")]);

  const shared = { models: ["shared"] };
  await alpha.write("anthropic", shared);
  assert.equal(await beta.read("anthropic"), shared);
  assert.equal(native.values.has("anthropic"), true);

  const unscoped = wrapModelsStore(native, undefined);
  assert.equal(await unscoped.read("openrouter"), undefined);
  await assert.rejects(() => unscoped.write("openrouter", { models: ["must-not-store"] }), /read-only/);
  await assert.rejects(() => unscoped.delete("openrouter"), /read-only/);
  assert.equal(await alpha.read("openrouter"), alphaCatalog);
  assert.equal(await beta.read("openrouter"), betaCatalog);
  assert.equal(native.values.get("openrouter"), unmanagedCatalog, "unmanaged OpenRouter entry remains untouched");
});

test("store scoping forwards signals/options unchanged and delegates unrelated provider operations", async () => {
  const native = fakeStore();
  const wrapped = wrapModelsStore(native, "alpha", registry);
  const signal = new AbortController().signal;
  const options = { signal, marker: "same-options" };
  const entry = { models: ["x"] };

  await wrapped.write("openrouter", entry, options);
  await wrapped.read("openrouter", options);
  await wrapped.delete("openrouter", options);
  await wrapped.write("anthropic", entry, options);
  await wrapped.read("anthropic", options);
  await wrapped.delete("anthropic", options);

  assert.deepEqual(native.calls, [
    ["write", cacheKey("alpha"), entry, options],
    ["read", cacheKey("alpha"), options],
    ["delete", cacheKey("alpha"), options],
    ["write", "anthropic", entry, options],
    ["read", "anthropic", options],
    ["delete", "anthropic", options],
  ]);
  assert.equal(native.calls[0][3].signal, signal);
});

test("invalid native store contracts and account identifiers fail closed", () => {
  assert.throws(() => wrapModelsStore({}, "alpha", registry), /implement read, write and delete/);
  assert.throws(() => wrapModelsStore({ read() {}, write() {} }, "alpha", registry), /implement read, write and delete/);
  for (const accountId of ["A", "a", "../alpha", "alpha/beta", "alpha\0beta", 7, null]) {
    assert.throws(() => wrapModelsStore(fakeStore(), accountId, registry), /account id is invalid/);
  }
  assert.doesNotThrow(() => wrapModelsStore(fakeStore(), undefined));
});

// IDs are registry-local: two independent launchers may both own an account named alpha.
test("same account ID in different registries does not share personalized catalogs", async () => {
  const native = fakeStore();
  const first = wrapModelsStore(native, "alpha", registry);
  const second = wrapModelsStore(native, "alpha", path.resolve("synthetic-registry-b", "registry.json"));
  await first.write("openrouter", { models: ["first-registry"] });
  assert.equal(await second.read("openrouter"), undefined);
  await second.write("openrouter", { models: ["second-registry"] });
  assert.deepEqual(await first.read("openrouter"), { models: ["first-registry"] });
  assert.throws(() => wrapModelsStore(native, "alpha"), /registry path is required/);
  const metadata = wrapModelsStore(native);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(metadata.read("openrouter", { signal: controller.signal }), { name: "AbortError" });
});
