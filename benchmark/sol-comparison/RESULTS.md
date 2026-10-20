# Sol high: measured orchestration versus solo

## Conclusion
On this historical issue, solo was 29.3% cheaper and 38.7% faster on average, with a blind-judge mean of 89.7/100 versus 85.7/100. Both modes passed the original five-case oracle in all three samples. This is a small paired case study, not a general model ranking.

## All six completed samples
| Pair | Mode | PI tariff equivalent USD | Coding wall time | Workers | Original oracle | Blind quality | Supplemental coverage |
|---|---|---:|---:|---:|---|---:|---:|
| 1 | orchestrator | 0.8304 | 13m30s | 5 | PASS (5 synthetic cases) | 87/100 | 14/51 |
| 1 | solo | 0.4952 | 5m16s | 0 | PASS (5 synthetic cases) | 87/100 | 10/51 |
| 2 | orchestrator | 0.4744 | 7m19s | 2 | PASS (5 synthetic cases) | 81/100 | 45/51 |
| 2 | solo | 0.4531 | 6m10s | 0 | PASS (5 synthetic cases) | 90/100 | 10/51 |
| 3 | orchestrator | 0.6780 | 7m58s | 2 | PASS (5 synthetic cases) | 89/100 | 10/51 |
| 3 | solo | 0.4533 | 6m12s | 0 | PASS (5 synthetic cases) | 92/100 | 10/51 |

## Aggregates
| Mode | Mean cost USD | Median cost USD | Mean duration | Median duration | Mean quality | Quality range | Original oracle |
|---|---:|---:|---:|---:|---:|---:|---|
| orchestrator | 0.6609 | 0.6780 | 9m36s | 7m58s | 85.7/100 | 81–89 | 3/3 |
| solo | 0.4672 | 0.4533 | 5m53s | 6m10s | 89.7/100 | 87–92 | 3/3 |

## Separate overhead (reported equivalents, not invoices)
- Completed coding samples: USD 3.3843, including workers.
- Blind judge: USD 0.1895, 2m36s; one fresh Sol high evaluation, six anonymous shuffled submissions.
- Preparation/control snapshot: USD 5.1178, based on persisted main-session usage plus known preparatory workers/diagnostics. This includes avoidable setup work; it is outside coding averages. The earlier USD 3.5793 figure was an earlier cutoff, not the final control total.
- Interrupted third pair: USD 0.3487 reported before interruption; omitted/unreported in-flight usage remains unknown. Excluded from completed-sample averages.
- Initial launcher failure: approximately 90 minutes waiting for stdin EOF, before coding sessions started. Preserved as setup failure, not six model-performance samples.
- The additional completed third pair plus judge cost USD 1.3207 equivalent. This excludes coordinator/control calls.
- These are configured PI per-call tariff equivalents. No provider invoice, actual subscription cash charge or complete quota accounting was obtained. Unavailable usage and the final response are not silently treated as free.

## Scope and limitations
- Same historical issue and same archived source baseline; all six fresh local baseline trees equal `4a5a578700f08359fed759a8da3d1f9ee377814b`. No prior implementation history or contestant transcripts supplied.
- Actual lead receipts verify `openai-codex/gpt-6.1-sol`, `high` in every run. Orchestrator workers used normal routing: observed Luna in all three pairs and Sol additionally in pair 1; solo had zero workers.
- Model-catalog bytes match across all profiles. Default saved model/provider values varied, but the explicit lead model/high flags and actual lead receipts match.
- Important deviation: global SYSTEM.md gained a launcher/fail-fast rule before pair 3. Each pair has matching SYSTEM.md between arms, but all six profiles are not a single fully frozen harness. The pilot is matched within pairs, not a strictly constant six-run experiment.
- Pair 3 replaced an interrupted pair only after the disclosed additional-cost gate; old artifacts and partial reported usage remain preserved. No contestant source repairs or selection on quality occurred.
- The primary oracle covers five synthetic cases: discovery/classification, cwd/process isolation, timeout, output bound and unknown tests. It is not the entire real test suite or a proof of production safety.
- Supplemental coverage replaces historical test contents with harmless scripts. Counts expose filtering differences, not proof that the original excluded tests were safe. All strict combined receipts were FAIL on this probe; original-oracle PASS is deliberately a separate measure.
- The blind judge is subjective and from the same model family. All thirty cited dimension entries were checked for existing file/line addresses; this is not independent human verification of every claim.
- Main quality separation was test quality: mean 18.7/20 solo versus 16.7/20 orchestrator. One orchestrated submission omitted the fixed interface exclusion; the strongest solo submission added monotonic deadlines, combined-output boundary tests and POSIX process-group termination.
- State execution used private grading copies, synthetic fixtures and unique HOME/TMP roots. Grading sandbox denied network and writes outside owned roots. No actual project suites, apps, migrations, provider charges for product operations, remote publication or deployments were performed.

## Reproducibility identifiers
- Task: `evolvera#31` / historical issue https://github.com/Evolvera/evolvera/issues/6 / accepted PR 31.
- Baseline: `b3ed83c6b8dc7e8bbc86f379be9c262b76d723ba`; reference: `74ee0f3501169d2a27ac0176be60fcd498d469a8`.
- PI: `0.83.0`; initial harness head: `72c686c70fc1326069da5233fc58859aa458a7ec`; later SYSTEM.md change: `49edbd8`.
- Initial protocol SHA-256: `e77648b2c4231fe4d8582733fc4833acc6c1bc8b8daddcf66e5f4cc4ccf91c73`; problem SHA-256: `98a6e64dbd45baaa75901cb44f4e10e7c8f8eacca27d8388e34531e3e6269296`.
- Oracle SHA-256: `28a2b0580102fc9d9a7205e88d53e2daf131d5e7cd4f38e9dcda239a44e369c1`; baseline fails, accepted reference passes.
- Private evidence: `/private/var/tmp/sol-benchmark-20261013-r3`; raw credential-bearing profiles/transcripts must not be published.
- Public driver: `compare.mjs`; focused synthetic tests pass in 0.21 seconds with one local worker. EOF, piped judge input, worker-cost deduplication, blindness/schema and delayed completion notifications are exercised.
