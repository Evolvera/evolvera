# Engineering Standards

Apply these when writing or reviewing backend/infra/async code.

## Resilience & Concurrency
- **Circuit Breaker**: Fail-fast on OPEN. Log state transitions.
- **Retries**: Exponential backoff + jitter. Transient errors only (429, 5xx). Max 3 attempts. Operations MUST be idempotent.
- **Race Conditions**: Atomic ops > Optimistic lock (version) > Distributed lock > Pessimistic. DBs: `SELECT ... FOR UPDATE` for check-then-act.

## Observability
- **Logs**: Structured JSON. Required: `timestamp`, `level`, `message`, `service`, `trace_id`. Mask PII/secrets as `[REDACTED]`.
- **Metrics/Tracing**: RED pattern (Rate, Errors, Duration). Propagate `trace_id`/`span_id` across boundaries.

## Feature Flags
- Inject as dependencies (stateless eval). Never hardcode `if True/False`.
- Plan cleanup for Release/Experiment toggles.

## Design Principles
- DRY, KISS, YAGNI, SOLID, Clean Architecture, Single Responsibility.
- Strict typing, explicit naming, clear module boundaries.
- State the principle driving any refactoring decision explicitly.
