const API_KEY = Symbol.for("pi.users.switch-readiness.api.v1");
const RECEIPT_KEY = Symbol.for("pi.users.context");
const VERSION = 1;
const isThenable = (value) => { try { return !!value && typeof value.then === "function"; } catch { return true; } };

function validReceiptDescriptor(descriptor) {
  try {
    if (!descriptor || !("value" in descriptor) || descriptor.configurable || descriptor.writable) return false;
    const receipt = descriptor.value;
    if (!receipt || typeof receipt !== "object" || !Object.isFrozen(receipt)) return false;
    const profile = Object.getOwnPropertyDescriptor(receipt, "profile");
    const runtime = Object.getOwnPropertyDescriptor(receipt, "modelRuntime");
    return !!profile && "value" in profile && profile.value && typeof profile.value === "object" && Object.isFrozen(profile.value) &&
      !!runtime && "value" in runtime && runtime.value != null && (typeof runtime.value === "object" || typeof runtime.value === "function");
  } catch { return false; }
}

function createSharedApi(processIdentity) {
  const participants = new Map();
  let activeLease;
  let acquiring = false;

  const currentIdentity = () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, RECEIPT_KEY);
    if (!validReceiptDescriptor(descriptor)) return undefined;
    return Object.freeze({ receipt: descriptor.value, processIdentity });
  };
  const matches = (a, b) => {
    try { return !!a && !!b && a.receipt === b.receipt && a.processIdentity === b.processIdentity && b.processIdentity.pid === process.pid; }
    catch { return false; }
  };
  const blocked = (reason) => Object.freeze({ ok: false, acquired: false, reason });

  function registerUserSwitchParticipant(options = {}) {
    let name, owner, isCurrent, acquireFence;
    try { ({ name, owner, isCurrent, acquireFence } = options); } catch { return blocked("invalid-participant"); }
    const identity = currentIdentity();
    if (!identity || typeof name !== "string" || !name || !owner || typeof isCurrent !== "function" || typeof acquireFence !== "function") return blocked("invalid-participant");
    if (activeLease || acquiring) return blocked("readiness-lease-active");
    let current;
    try { current = isCurrent(identity); } catch { return blocked("consumer-unavailable"); }
    if (isThenable(current)) return blocked("async-consumer");
    if (current !== true) return blocked("consumer-stale");
    const prior = participants.get(name);
    if (prior) {
      if (prior.owner !== owner) return blocked("participant-owned");
      if (!matches(prior.identity, identity)) return blocked("consumer-stale");
      return prior.registration;
    }
    const entry = { name, owner, identity, isCurrent, acquireFence, registration: undefined };
    let registered = true;
    const registration = Object.freeze({
      ok: true,
      unregister() {
        if (!registered) return Object.freeze({ ok: true, removed: false });
        if (activeLease || acquiring) return blocked("readiness-lease-active");
        if (participants.get(name) !== entry || !matches(currentIdentity(), identity)) return blocked("participant-owner-mismatch");
        registered = false;
        participants.delete(name);
        return Object.freeze({ ok: true, removed: true });
      },
    });
    entry.registration = registration;
    participants.set(name, entry);
    return registration;
  }

  function lookupUserSwitchParticipants(options = {}) {
    let names, identity;
    try {
      names = options.names;
      identity = options.identity === undefined ? currentIdentity() : options.identity;
    } catch { return blocked("participants-unproved"); }
    if (!matches(identity, currentIdentity()) || !Array.isArray(names) || names.length === 0) return blocked("participants-unproved");
    const seen = new Set();
    const expected = [];
    for (const name of names) {
      if (typeof name !== "string" || !name || seen.has(name)) return blocked("participants-unproved");
      seen.add(name);
      const participant = participants.get(name);
      if (!participant || !matches(participant.identity, identity)) return blocked("participant-unavailable");
      expected.push(Object.freeze({ name, owner: participant.owner }));
    }
    return Object.freeze({ ok: true, expected: Object.freeze(expected) });
  }

  function acquireUserSwitchReadiness(options = {}) {
    let expected, identity;
    try {
      expected = options.expected;
      identity = options.identity === undefined ? currentIdentity() : options.identity;
    } catch { return blocked("participants-unproved"); }
    const current = currentIdentity();
    if (!matches(identity, current)) return blocked("identity-unavailable");
    if (activeLease || acquiring) return blocked("readiness-lease-active");
    acquiring = true;
    const reject = (reason) => { acquiring = false; return blocked(reason); };
    if (!Array.isArray(expected)) return reject("participants-unproved");
    let expectedLength;
    try { expectedLength = expected.length; } catch { return reject("participants-unproved"); }
    if (expectedLength === 0) return reject("participants-unproved");
    const names = new Set();
    const ordered = [];
    for (let index = 0; index < expectedLength; index++) {
      let requirement, name, owner;
      try {
        requirement = expected[index];
        name = requirement?.name;
        owner = requirement?.owner;
      } catch { return reject("participants-unproved"); }
      if (typeof name !== "string" || !name || names.has(name)) return reject("participants-unproved");
      names.add(name);
      const participant = participants.get(name);
      if (!participant || participant.owner !== owner || !matches(participant.identity, identity)) return reject("participant-unavailable");
      let ready;
      try { ready = participant.isCurrent(identity); } catch { return reject("consumer-unavailable"); }
      if (isThenable(ready)) return reject("async-consumer");
      if (ready !== true) return reject("consumer-stale");
      ordered.push(participant);
    }
    if (names.size !== participants.size || [...participants.keys()].some((name) => !names.has(name))) return reject("consumer-unlisted");

    const lease = { identity, releases: [], state: "acquiring" };
    activeLease = lease;
    try {
      for (const participant of ordered) {
        const release = participant.acquireFence(identity);
        if (isThenable(release)) throw Object.assign(new Error(), { code: "async-fence" });
        if (typeof release !== "function") throw Object.assign(new Error(), { code: "fence-refused" });
        lease.releases.push(release);
      }
      lease.state = "active";
      return Object.freeze({
        acquired: true,
        release() {
          if (lease.state === "released") return Object.freeze({ ok: true, released: false });
          if (lease.state !== "active" || !matches(currentIdentity(), identity) || activeLease !== lease) return blocked("lease-owner-mismatch");
          lease.state = "releasing";
          let failed = false;
          for (const release of lease.releases.slice().reverse()) {
            try {
              const result = release();
              if (isThenable(result)) failed = true;
              else if (result !== true && result?.ok !== true) failed = true;
            } catch { failed = true; }
          }
          if (failed) {
            lease.state = "release-failed";
            return blocked("release-unproved");
          }
          lease.state = "released";
          activeLease = undefined;
          return Object.freeze({ ok: true, released: true });
        },
      });
    } catch (error) {
      let failed = false;
      for (const release of lease.releases.slice().reverse()) {
        try {
          const result = release();
          if (isThenable(result)) failed = true;
          else if (result !== true && result?.ok !== true) failed = true;
        } catch { failed = true; }
      }
      if (failed) lease.state = "rollback-failed";
      else activeLease = undefined;
      return blocked(failed ? "rollback-unproved" : error?.code === "async-fence" ? "async-fence" : "fence-refused");
    } finally {
      acquiring = false;
    }
  }

  return Object.freeze({
    version: VERSION,
    processIdentity,
    registerUserSwitchParticipant,
    lookupUserSwitchParticipants,
    acquireUserSwitchReadiness,
  });
}

const existing = Object.getOwnPropertyDescriptor(globalThis, API_KEY);
let sharedApi;
if (existing) {
  sharedApi = existing.value;
  if (!existing.configurable && !existing.writable && sharedApi && Object.isFrozen(sharedApi) &&
      sharedApi.version === VERSION && sharedApi.processIdentity?.pid === process.pid &&
      Object.isFrozen(sharedApi.processIdentity) && Object.isFrozen(sharedApi.processIdentity.token) &&
      typeof sharedApi.registerUserSwitchParticipant === "function" && typeof sharedApi.lookupUserSwitchParticipants === "function" && typeof sharedApi.acquireUserSwitchReadiness === "function") {
    // Native ESM/Jiti instances converge on this exact API and closure-backed registry.
  } else {
    throw new Error("User switch readiness API global is incompatible");
  }
} else {
  const processIdentity = Object.freeze({ pid: process.pid, token: Object.freeze({}) });
  sharedApi = createSharedApi(processIdentity);
  Object.defineProperty(globalThis, API_KEY, { value: sharedApi, enumerable: false, configurable: false, writable: false });
}

/**
 * Task10/11 contract: registerUserSwitchParticipant({name, owner, isCurrent, acquireFence})
 * binds one named root consumer to the exact immutable users receipt and process.
 * The receipt freezes the runtime reference; the native runtime itself stays mutable.
 * Its
 * predicate and fence acquisition are synchronous; the acquirer returns an idempotent
 * synchronous release. acquireUserSwitchReadiness({expected:[{name,owner}], identity?})
 * must enumerate every registered active consumer and acquires all fences atomically.
 * Missing, stale, unknown, async, omitted, or unproved consumers block with sanitized
 * reasons. One process-wide lease is allowed; failed rollback/release keeps it latched.
 */
export const registerUserSwitchParticipant = sharedApi.registerUserSwitchParticipant;
export const lookupUserSwitchParticipants = sharedApi.lookupUserSwitchParticipants;
export const acquireUserSwitchReadiness = sharedApi.acquireUserSwitchReadiness;
