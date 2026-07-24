# QA and Prompt Runtime Research

Accessed 2026-07-24. This is provenance and design evidence, not mandatory runtime context. Publication/version dates are `UNKNOWN` unless independently reliable; retrieved future-dated metadata is not treated as a publication date.

## Prompt runtime

- Maker: OpenAI.
- Host/runtime: ChatGPT Codex, `openai-codex-responses`.
- Model: `openai-codex/gpt-5.6-sol`; context: 300k; tool use enabled; selected effort: `high`.
- Current official GPT-5.6 model guidance: <https://developers.openai.com/api/docs/guides/latest-model#prompting-best-practices> (accessed 2026-07-24). It identifies Sol as the flagship-capability variant, recommends preserving domain context, hard constraints, approval boundaries, and success criteria, says intent understanding often removes the need to prescribe ordinary steps, and recommends lean prompts with instructions stated once. Effort choices are workload/evaluation dependent; `high` is this agent's baseline, not a claim that xhigh/max is superior.
- Official OpenAI prompt guidance: <https://platform.openai.com/docs/guides/prompt-engineering> (accessed 2026-07-24). It supports explicit authority/task/context/tool/output contracts and representative evaluation. The retrieval displayed future-dated publication metadata; that metadata is unreliable here, so only current access/applicability is recorded.

Design decision: the `qa` prompt keeps level, state, action, evidence, and verdict invariants always loaded; ordinary techniques live in conditional level references. It requests concise observable artifacts, not visible chain-of-thought.

## Direct evidence excerpts

- OpenAI GPT-5.6 model guidance: “GPT-5.6 can better infer the user’s underlying goal and intended level of work from context, so you often do not need to prescribe every step.” Applicability: keep QA outcome, safety, evidence, and approval boundaries explicit while leaving repository-specific test selection to grounded judgment.
- OpenAI GPT-5.6 model guidance: “Removing repeated instructions and examples and simplifying tool descriptions can improve task performance and token efficiency.” Applicability: keep conditional CORE/FULL technique detail out of the always-loaded agent prompt. The accompanying internal-eval percentages are directional, not a universal release threshold.
- OpenAI prompt guidance: “Even different snapshots of models within the same family could produce different results.” Applicability: preserve model/runtime identity and rerun representative QA prompt evaluations after routing or model changes.
- Playwright isolation guidance: “Every test runs independently from any other test. This means that each test has its own local storage, session storage, cookies etc.” Applicability: BrowserContext supports browser-state isolation only; it does not prove backend-resource isolation.
- Testcontainers for Node.js: “lightweight, throwaway instances of common databases, Selenium web browsers, or anything else that can run in a Docker container.” Applicability: disposable services are a candidate mechanism where the project supports them, never proof of ownership/no-fallback by themselves.
- Playwright retry guidance classifies tests that fail first and pass on retry as “flaky.” Applicability: retain first-failure evidence and do not convert a retry pass into clean QA PASS.

## QA foundations and bounded applicability

- Playwright isolation and browser contexts: <https://playwright.dev/docs/browser-contexts>; best practices: <https://playwright.dev/docs/best-practices>; network/mocking: <https://playwright.dev/docs/network>; authentication: <https://playwright.dev/docs/auth>; retries: <https://playwright.dev/docs/test-retries>; trace viewer: <https://playwright.dev/docs/trace-viewer>. These support fresh browser state, real-browser journeys, network controls, sensitive auth-state handling, first-failure/retry labeling, and trace-based diagnosis. Caveat: browser isolation does not establish backend-resource isolation; mocks and traces do not prove an unexercised critical path.
- Testcontainers: <https://testcontainers.com/guides/getting-started-with-testcontainers-for-nodejs/>. Supports disposable service instances as a technique. Caveat: a container label alone does not prove unique ownership, no fallback, synthetic data, or bounded cleanup.
- Pact: <https://docs.pact.io/>. Consumer-driven contract evidence can cover selected service interfaces. Caveat: contracts do not replace required provider verification or integrated acceptance.
- QuickCheck paper: Koen Claessen and John Hughes, *QuickCheck: A Lightweight Tool for Random Testing of Haskell Programs*, <https://www.cs.tufts.edu/~nr/cs257/archive/john-hughes/quick.pdf>. Supports generated property checks and shrinking when meaningful invariants exist; not a universal substitute for examples/integration.
- pytest flaky tests: <https://docs.pytest.org/en/stable/explanation/flaky.html>. Supports treating intermittency as evidence to diagnose, not erasing the first failure.
- Django testing overview: <https://docs.djangoproject.com/en/stable/topics/testing/overview/>. Supports framework-native isolated test techniques. Caveat: framework defaults still require project-specific command/resource inspection.
- OWASP authorization testing: <https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/README>. Supports explicit authorization-role/object boundary scenarios. It does not authorize testing live/shared targets.
- Jest snapshot testing: <https://jestjs.io/docs/snapshot-testing>. Snapshots are reviewable regression oracles. Caveat: updating a snapshot is not evidence that a behavior change was approved.
- Stryker mutation testing: <https://stryker-mutator.io/docs/>. Mutation scores can diagnose test sensitivity. They are not a universal threshold or proof of correctness.
- Google coverage guidance: <https://testing.googleblog.com/2020/08/code-coverage-best-practices.html>; E2E guidance: <https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html>. These support using coverage diagnostically and a balanced test portfolio rather than universal percentages or E2E-only policy. Historical guidance is applied proportionally, not as a current framework mandate.

## Evaluated policy choices

Five scenario groups define the structural regression oracle: bounded CORE, safely isolated FULL with a real browser, unsafe FULL, mocked browser, and harness-build/fresh-run separation. PASS remains scope- and SHA-bound; unsafe required evidence is `UNVERIFIED`; concrete reproducible mismatch is `BLOCKED`. No source supplies a universal coverage, mutation, retry, or E2E threshold, so none is encoded.
