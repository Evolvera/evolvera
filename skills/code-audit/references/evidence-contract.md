# Evidence and Publication Contract

## Proof ladder

`OBSERVATION -> CANDIDATE -> PROVEN | DISPROVEN | UNVERIFIED`

- **OBSERVATION:** a source fact, search match, command result, or inconsistency with no defect claim.
- **CANDIDATE:** a falsifiable hypothesis tied to a possible contract and reachable behavior.
- **PROVEN:** the expected contract, reachability, and actual violation are established by deterministic reasoning or a pre-approved, smallest non-destructive falsifying check.
- **DISPROVEN:** inspected counterevidence or a falsifying check shows the hypothesized violation does not hold under its stated preconditions.
- **UNVERIFIED:** proof is incomplete, unavailable, unsafe, conflicting, or outside approval. It is not a defect.

Scout agreement, validator agreement, severity, a keyword hit, or plausibility never advances a candidate to PROVEN.

## Candidate ledger

Assign immutable `AUD-*` IDs. Record: state/classification; title; originating mission; severity; confidence; exact mirror-relative location; expected contract/invariant and authority; reachability/preconditions; smallest safe falsifying check; literal approved command if any; expected result; observed result; reproducibility or deterministic proof; impact; counterevidence and alternative explanations checked; evidence references; disposition rationale; and smallest repair direction. Keep severity (impact if true) separate from confidence (strength of proof).

Evidence receives `EVD-*` IDs and SHA-256 hashes. Preserve exact source excerpts, scout text, command, cwd, timeout, sanitized environment, network policy, exit status, and relevant output beneath the run root. The HTML may summarize receipts but must retain mirror-relative locations and hashes. Never put a raw secret, credential, personal/sensitive payload, exploit payload, or unnecessary source body in the report.

## Contract and reachability

The expected behavior must come from an authoritative repository contract, language/framework guarantee, protocol specification supplied within approved evidence, or an unavoidable internal invariant. Conflicting contracts stop adjudication. Preferences, generic best practice, and imagined requirements are not contracts.

Show a reachable entry point and all material preconditions. For dead code, optional configuration, or unavailable environment, state the limitation. A theoretical sink without a source-to-sink path remains UNVERIFIED.

## Safe security evidence

Use static source-to-sink proof, inert fixtures, local mock boundaries, hashes/metadata, and non-destructive checks. Never probe live systems, expose secrets, use real credentials/data, create persistence, bypass access controls, or publish operational exploit detail. Network is denied by default. If safe proof cannot establish the claim, classify it UNVERIFIED.

## Adjudication and false-positive rejection

A validator may adjudicate only when its exact mission and count were approved. It reviews the candidate contract, reachability, proof, and counterevidence; it does not create new missions or run unapproved commands. Reject or leave UNVERIFIED any candidate with ambiguous contract, missing reachability, non-reproducible result, unsafe proof, evidence only from consensus, environmental failure, or a plausible counterexample not resolved by evidence. Failed/unavailable proof is never evidence of a defect.

## Report language

Only PROVEN entries appear under **Proven defects** or in the defect count. Use direct language: “The approved check observed X; the contract requires Y under Z.” Put UNVERIFIED and DISPROVEN candidates in their own sections with the reason. Say “No proven defects were established in the selected scope,” never “no defects,” “safe,” “complete,” or “bug-free.” State limitations and integrity status prominently.