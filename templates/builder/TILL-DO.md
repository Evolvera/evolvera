# Builder TILL-DO — Task {NN}

**Task**: `TASKS/task_{NN}_{agent}.md`
**Started**: [ISO timestamp]
**Builder Version**: v1

---

## ⚠️ Gates (ALL MUST PASS BEFORE IMPLEMENTATION)

**RULE**: Do NOT modify any files until ALL gates below are validated with evidence.

---

## Gate 1: Prerequisite Files Exist

- [ ] **PREREQUISITE FILE EXISTS**: `path/to/file.ts`
  - **Evidence**: [ls or read result]
  
- [ ] **PREREQUISITE FILE EXISTS**: `path/to/other.ts`
  - **Evidence**: [ls or read result]

---

## Gate 2: Success Criteria Understood

By starting implementation, I confirm I understand ALL success criteria:

- [ ] **CRITERION 1**: [Verbatim from task's Success Criteria section]
- [ ] **CRITERION 2**: [Verbatim from task's Success Criteria section]
- [ ] **CRITERION 3**: [Verbatim from task's Success Criteria section]

---

## Gate 3: Scope Defined

I will ONLY modify these files (no others):

### Files to CREATE
- `src/components/New.tsx` — [description]

### Files to MODIFY
- `src/app/Existing.tsx` — [description]

### Files to READ (no modification)
- `src/app/layout.tsx` — [reason]

---

## Gate 4: No Blockers Identified

- [ ] **No missing dependencies**: All imports exist or will be created in this task
- [ ] **No conflicting files**: None of my modifications overlap with other parallel tasks
- [ ] **Environment ready**: [Any environment checks]

---

## Gate Validation Summary

| Gate | Status | Evidence |
|------|--------|----------|
| 1. Prerequisite Files | ✅ / ❌ | [N files verified] |
| 2. Success Criteria | ✅ / ❌ | [N criteria confirmed] |
| 3. Scope Defined | ✅ / ❌ | [N files in scope] |
| 4. No Blockers | ✅ / ❌ | [Any blockers?] |

**If ALL Gates ✅**: Proceed to create `.pi/build/TODO.md`

**If ANY Gate ❌**: STOP. Write HANDOVER with `status: BLOCKED` and include:
- Which gate failed
- Why it failed
- Suggested resolution

---

## Notes

[Any builder notes during gate validation]
