# Builder Handover — Task {task_id}

**Task**: `TASKS/task_{task_id}_{agent}.md`
**Status**: COMPLETE | PARTIAL | BLOCKED | ERROR
**Started**: [ISO timestamp]
**Finished**: [ISO timestamp]
**Duration**: [X minutes]
**Tool Calls Used**: [N]

---

## Summary

[Maximum 5 sentences of what was accomplished. Be specific — not "I implemented the feature" but "Created src/components/Navbar.tsx with 5 props (logo, items, user), responsive mobile menu at 768px breakpoint, and hover states on all navigation items."]

---

## Files Changed

| File | Action | Lines | Notes |
|------|--------|-------|-------|
| `src/components/Navbar.tsx` | created | +65 | Main component with all states |
| `src/components/types.ts` | modified | +12 / -2 | Added NavbarProps interface |
| `src/app/layout.tsx` | modified | +3 / -1 | Imported Navbar |

### Files Created
- `src/components/Navbar.tsx` — Navbar component with mobile support

### Files Modified
- `src/app/layout.tsx` — Added Navbar import

### Files Deleted
*(none)*

---

## Deviations from Task

[Any changes made that were NOT in the task's "Files to Create/Modify" section]

### Scope Violations
- [ ] None — all modifications were in scope
- [ ] WARNING: Modified file not in task scope: `path/to/file.ts`
  - **Reason**: [why it was necessary]
  - **Impact**: [minimal/moderate/significant]

### Deviations
- [ ] None
- [ ] WARNING: Deviated from task specification
  - **What**: [specific deviation]
  - **Why**: [justification]
  - **Alternative**: [what should have been done]

---

## Pending Work

[What remains if status is PARTIAL or BLOCKED — be specific about next actions]

### Not Started
- [ ] [Pending item 1]
- [ ] [Pending item 2]

### Partially Completed
- [ ] [Item]: [where it stopped and why]

### Blockers Encountered
- **Blocker 1**: [Description]
  - **Impact**: Cannot proceed without resolution
  - **Suggestion**: [How to resolve]

---

## Next Step Suggestion

[What the orchestrator should do next — specific guidance]

### If COMPLETE:
```
All tasks finished. Update SCHEDULE.md status to "complete" and proceed to next task or summarize to user.
```

### If PARTIAL:
```
Spawn continuation builder with same task file. Builder will resume from checkpoint: Step [N] — [name]
```

### If BLOCKED:
```
Task is blocked by: [blocker description]
Options:
1. Spawn scout to investigate the blocker
2. Spawn planner to replan around the issue
3. Ask user to resolve manually
```

### If ERROR:
```
Task failed with error: [error description]
Options:
1. [If fixable] Fix error and spawn continuation
2. [If complex] Replan with builder
3. [If blocker] Ask user to resolve
```

---

## Checkpoint

**Last Completed TODO**: [N. step name]
**Completed At**: [ISO timestamp]
**Files Modified At Checkpoint**: [list]

**Next TODO (for resume)**: [N. step name]
**What Remains**: [brief description of remaining steps]

---

## Evidence

[Any verification that success criteria were met — test results, screenshots, etc.]

### Success Criteria Verification
- [ ] **Criterion 1**: [how verified]
- [ ] **Criterion 2**: [how verified]
- [ ] **Criterion 3**: [how verified]

### Test Results
```
[If tests were run, paste results here]
```

---

## Notes for Reviewer

[Any context that might help a reviewer understand the changes]

---

## Raw Metrics

| Metric | Value |
|--------|-------|
| Tool Calls | [N] |
| Files Read | [N] |
| Files Written | [N] |
| Files Modified | [N] |
| Lines Added | [+NN] |
| Lines Removed | [-NN] |
| Duration | [X minutes] |
