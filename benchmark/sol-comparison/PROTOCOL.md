# Sol high: normal PI orchestration versus solo

## Requested outcome
Deliver an actual measured comparison table here: 3 fresh repetitions per arm on one historical completed issue, cost, end-to-end coding wall time, independent test completion, and blind coding-quality evaluation by a fresh PI Sol high judge. This is an exploratory case study, not a model leaderboard.

## Frozen task identity
- Historical issue: https://github.com/Evolvera/evolvera/issues/6 (repository now known as Evolvera/Pi).
- Accepted implementation: PR 31, merge `74ee0f3501169d2a27ac0176be60fcd498d469a8`.
- Pre-implementation baseline: `b3ed83c6b8dc7e8bbc86f379be9c262b76d723ba`.
- Benchmark task: existing EvoBench `evolvera#31`, about 228 reference changed lines.
- Problem contract: existing `benchmark/problems/evolvera#31.md`, grounded in the issue and accepted clarification: unknown smokes do not run; interface suite remains excluded until isolated. Original issue CA2 is NOT taken as permission to run the unsafe interface.
- Allowed product writes: `scripts/run-tests.mjs`, `scripts/test/run-tests.smoke.mjs`; transient `.pi/build`/`.pi/recovery` only for normal harness coordination.
- Preserve all other existing source and tests. No frontend, real API, database, installed SDK patch, production/shared filesystem operation, remote issue change, PR, merge or deploy.

## Arms and fairness
- Lead in both arms: `openai-codex/gpt-6.1-sol`, `high`, installed PI `0.83.0`.
- Orchestrator: normal installed PI harness, normal non-design custom agent prompts/models/routing; design/website/SEO/home design agents unavailable and prohibited at any depth. No forced worker model and no forced minimum worker count; report actual delegation. A zero-delegation run is retained and identified, not secretly rerun.
- Solo: same harness and lead, delegation tools disabled and all subprocess/indirect delegation prohibited. Explicit direct-execution exception to normal instructions that require delegation.
- One history-free workspace and isolated writable agent profile/session/temp roots per execution. Archive the same baseline without its `.pi` historical context; do not expose original Git history, remote, accepted implementation, hidden tests, other contestants or earlier results to contestants.
- Same problem, task limits and provider settings. Three paired waves, at most two coding runs concurrently, with fresh sessions; freeze order and record overlap. Maximum 30 minutes per coding run. Terminal/print execution, no custom replacement agent loop.
- No contestant retries or repairs by the benchmark coordinator. Provider/setup failure is distinguished from coding failure; report it rather than inventing a score.
- Judge reads anonymized submissions and contract/evidence, not mode labels, timing, spend or conversation transcripts. Judge cannot write contestant source or execute code. Sol high judge evaluation cost/time is separate.

## Measurement
- Coding duration: monotonic elapsed time from PI launch to final process exit after all subagents are joined; setup and judge excluded, separately recorded.
- Cost: PI reported per-call usage priced with the frozen model catalog, including lead and every worker exactly once. NOT an invoice or incremental subscription cash charge. Missing usage is unknown, never free. Do not sum rolled-up worker usage and worker transcripts together.
- Tokens: distinguish uncached input, cached input and output; preserve raw sanitized usage evidence. No credential values or authorization headers in reports.
- Tests: original hidden oracle on a grading copy, plus independent contract cases where feasible. Establish baseline fails and reference passes before scoring. Contestant-created tests are evidence, not the scoring authority. Report oracle scope and untested live/global behavior.
- Quality: blind judge scores 0–100, with five dimensions 0–20: correctness/contract fidelity, robustness/error handling, maintainability/KISS/SoC, scope/safety preservation, and test quality. Cite concrete file/line findings. Tests and quality remain separate columns; test failure cannot be disguised by a prose completion claim.
- Aggregate: show all six runs and per-arm mean/median cost and wall time, test pass count /3, quality mean and range. Compare the cost/time/quality trade-off without claiming statistical significance from n=3 on one task.

## Stateful resource proof required before any execution
Original oracle `scripts/test/run-tests.smoke.mjs` imports only Node builtins, creates a mkdtemp fake repository, writes synthetic smoke scripts and `.classificacao.json`, invokes runner exclusively with `--root <fakeRoot>`, and removes only its created sandbox. It deliberately does not invoke the real smoke suites, ct or interface. Set TMPDIR/TMP/TEMP to a unique run-owned temp root and HOME to a unique run-owned home. Review each contestant runner before grading for subprocess escapes or writes outside that root; if unsafe, do not execute and report test evidence UNVERIFIED. No npm install or application startup is required. Any additional oracle must meet the same proof. Installed PI startup/provider authentication uses an isolated profile copy; provider inference is the operation explicitly requested by the user. On this macOS run, `sandbox-exec` additionally blocks writes outside each owned root, protected home/other-run reads, and all network during grading. Disposable probes verified permitted owned writes, denied foreign writes and denied reference reads. This is an ordinary isolation check, not a hostile-model security certification.

## Artifact and authority boundary
Existing `benchmark/bench.mjs` remains the generic EvoBench authority; comparison-specific automation belongs under `benchmark/sol-comparison/`, reusing existing task metadata/contracts rather than replacing prior work. Existing untracked benchmark files and results belong to prior work and must not be overwritten, staged, removed or treated as disposable. Only newly created comparison source/protocol files can be selectively committed. Raw execution output and credential-bearing profile copies stay in a fresh private run root, never Git. Final sanitized report records task/harness/protocol SHAs, model rates, run identities, test receipts and limitations.

## Observed execution deviations and disclosure
- The initial six launches stalled before session creation because an asynchronous stdin pipe was left open. The CLI awaits EOF before invoking the model. The batch lost approximately 90 minutes; these launches produced no coding samples. They remain separate setup-failure evidence.
- The launcher now closes/ignores stdin, has an EOF regression test and a 60-second session-start check. Judge input is piped and explicitly ended to avoid OS argument-size limits.
- Four completed coding samples were preserved. The third pair was interrupted with no final process/duration receipt; its artifacts and reported partial usage are preserved under `interruptedRuns`. A fresh third pair was authorized after the disclosed additional-cost gate. There was no contestant code repair or selection on quality.
- The original five-case oracle is reported separately from the supplementary default-coverage probe. The latter substitutes harmless scripts under historical filenames and measures filtering behavior; it cannot establish that the real excluded tests are safe. Combined strict results remain in raw receipts rather than being presented as the original oracle result.
- `prepare --output ROOT`, followed by `all --output ROOT`, performs coding, safety-checked synthetic grading, one blind judge and reporting. `finish --output ROOT` waits for already-running coding receipts and performs only missing grading/judging; it never retries a failed model automatically. Private profiles/raw transcripts must not be published or committed.
