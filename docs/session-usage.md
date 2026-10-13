# `/usage`

`/usage` reports assistant-message token usage for the **current session branch**, grouped by provider and model. It reads the active branch on each invocation, so branch navigation and model changes are reflected without a persisted counter.

The output includes input, output, cache-read, cache-write, and total tokens, plus the SDK-reported cost components and total. Cache token categories are summed once alongside input/output, matching the SDK usage totals convention. Costs are labeled **estimated SDK cost**: they are values recorded in session usage data, not a provider account quota, billing balance, invoice, or guarantee of final charges.

The command is read-only. It does not contact providers, inspect authentication, read other session branches, or persist usage state. Native `/session` remains unchanged.
