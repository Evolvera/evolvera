# Sol comparison driver

Task-specific experiment for historical `evolvera#31`; generic EvoBench files remain untouched. Requires this macOS checkout, installed PI and the validated preflight receipt named in `compare.mjs`. It is not a portable benchmark package.

```sh
OUT="/private/var/tmp/sol-comparison-$(uuidgen)"
node benchmark/sol-comparison/compare.mjs prepare --output "$OUT"
node benchmark/sol-comparison/compare.mjs all --output "$OUT"
```

`prepare` refuses collisions, archives the frozen baseline without history/context, creates six isolated workspaces and records task/config hashes. `all` executes three paired waves, grades synthetic copies after a conservative source check, runs one blind Sol high judge and prints the report. No model retry occurs automatically. `finish --output "$OUT"` waits on an existing manifest's completion events and performs only missing evaluation. Separate `run`, `grade --approved RUN-ID`, `judge` and `report` phases remain available.

Each coding run has its own profile/session/HOME/TMP and a 30-minute timeout. A 60-second check rejects startup without a session receipt. Non-TTY stdin is explicitly closed; judge payloads use ended stdin rather than oversized argv. Orchestrator workers retain normal non-design routing; solo delegation tools are disabled. Root assistant usage plus each worker's latest cumulative rollup are counted once. Missing usage stays unknown.

The macOS sandbox confines writes to the owned root and blocks protected home/reference/other-run reads. Coding allows requested provider inference; grading denies all network. Grading uses the original five-case oracle and harmless default-inventory fixtures, never actual project suites, databases or apps. Original-oracle results and supplemental classification coverage are separate: reduced coverage does not itself prove the real excluded tests were safe. Strict combined results are retained in private receipts.

The judge receives shuffled anonymous IDs, product diffs, acceptance and test context—not mode, workers, timing, spend or transcripts. Its tools are read-only. Scores require all six IDs, the five declared dimensions and file/line citations. Invalid scoring remains blocked, never invented. Judge cost/time and preparation/interrupted attempts are separate from coding averages. PI tariff equivalents are not invoices.

Raw outputs, profile credentials and transient evidence stay in the private output root; never publish or commit it. `PROTOCOL.md` records observed launcher failures and the explicitly disclosed replacement of the interrupted third pair.

## Focused checks

```sh
node --check benchmark/sol-comparison/compare.mjs
node --check benchmark/sol-comparison/default-oracle.mjs
node benchmark/sol-comparison/compare.test.mjs
```

Tests use only run-owned temporary Git/filesystem fixtures and local child processes, with bounded teardown. They do not call providers or execute project suites.
