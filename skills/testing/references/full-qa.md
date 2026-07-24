# FULL QA Reference

Load this reference only when the selected QA level is `FULL`.

## Admission and Claim Boundary

FULL is selected only when acceptance materially requires integrated runtime, real-browser, persistence, authorization/session, async, logging, or cross-boundary evidence. `FULL PASS` requires every required acceptance surface to be safely exercised at the exact SHA. An unavailable or unsafe required surface remains `UNVERIFIED`; do not shrink the claim after execution.

A browser claim requires a real browser. jsdom, DOM/component simulation, request stubs, route interception, and mocked critical paths are partial evidence and cannot establish FULL browser behavior. A Playwright/Cypress BrowserContext can isolate cookies, storage, and browser sessions, but does not isolate a database, cache, queue, bucket/object store, search index, filesystem, device, or external service.

## Surface Matrix

Tailor the matrix to approved acceptance; do not invent universal requirements:

- **UI:** real rendered journey, interaction, accessibility-relevant state, browser console, failed resources/actions.
- **API:** actual request/response, error contract, and authorization boundary.
- **Auth/session:** distinct identities/contexts and server-side authorization; stored auth state is sensitive.
- **Persistence:** observable writes/reads only in uniquely run-owned disposable storage.
- **Async:** run-owned queue/topic/job evidence, bounded completion/failure, no shared drain/purge.
- **Logs/state:** expected sanitized event/error and protected-resource postcheck.

Network mocks can isolate third-party traffic and test client behavior, but mocked critical paths must be labeled partial. Contract tests can support service-boundary confidence; they do not replace provider verification or an acceptance-required integrated journey. Use retries only to diagnose: preserve the first failure and label pass-after-retry flaky. Traces are debugging evidence, not automatic proof.

## Stateful Runtime Gate

Resolve commands, env precedence, global setup/teardown, fixtures, app startup, migrations/seeds, cleanup, network fallback, and every reachable resource. Execute only with `NO_STATEFUL_RESOURCES` or all resources `DISPOSABLE_VERIFIED`: uniquely created for this run, synthetic/empty by contract, scoped credentials, no fallback, and teardown confined to the owned namespace. Fixed, pre-existing, shared, unknown, user/dev/staging/production resources or destructive/fallback ambiguity mean no execution and `UNVERIFIED`.

After execution, prove protected resources were unreachable/unchanged and cleanup affected only run-owned resources. On suspected mutation, stop; preserve evidence; never retry, restore, reseed, or recreate data without explicit authorization.

## Authorized Harness Construction — Internal FULL Phase

Harness construction is exceptional and never the default QA action. It requires explicit project authorization naming:

1. the exact test-only write set;
2. allowed dependency/lockfile changes, if any, and whether network access is authorized;
3. the harness acceptance it must enable;
4. a selective checkpoint boundary.

The harness-building `qa` session may edit only that exact test-only set. It must not modify product code, rewrite existing tests to bless behavior, run live/external operations, or certify its own harness. After construction it reports exact files and static evidence, then stops for a new checkpoint. A new fresh source-read-only `qa` session bound to the new SHA independently inspects and executes the harness within the resource gate and owns the final `PASS | BLOCKED | UNVERIFIED` verdict.

Coverage and mutation testing are diagnostic, conditional techniques—not universal thresholds. Mutation can assess whether selected tests detect seeded code changes, but it does not prove complete behavior or authorize product/test rewrites.
