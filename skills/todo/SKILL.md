---
name: todo
description: Keep the `todo` list true for the whole conversation. Use whenever the work has several asks or steps, spans several turns, the user adds or changes a request mid-work, a milestone lands, or before the final answer, so the list is created, updated as work moves, and pruned of stale items instead of forgotten.
disable-model-invocation: false
---

# Todo hygiene

The `todo` tool (rpiv-todo) is the user's view of what was asked and where it stands. A list that stops moving, keeps finished work open, or carries items nobody wants anymore is worse than no list. The Operating Contract's `todo` rule decides what an item is (one per user request, named by outcome); this skill decides when to touch the list so it stays true.

## Tool contract

- `{"action":"list"}` shows open and completed items (`includeDeleted:true` adds tombstones; `status` filters one status). `{"action":"get","id":N}` reads one item.
- `{"action":"create","subject":"Fazer o ditado funcionar","description":"…","blockedBy":[…]}`: `subject` short, the user's outcome; `description` for detail and blockers.
- `{"action":"update","id":N,"status":"in_progress","activeForm":"corrigindo o ditado"}`, `{"action":"update","id":N,"status":"completed"}`. Update can also change `subject`, `description`, `addBlockedBy`, `removeBlockedBy`; an update with no changed field is rejected.
- `{"action":"delete","id":N}` tombstones an item; `{"action":"clear"}` resets the whole list (only when the user abandons everything).
- States: `pending → in_progress → completed`, plus `deleted`. A mutation answers with one line (`Created #4…`, `Updated #4 (pending → completed)`); only `list`/`get` show items. Keep track from those results and call `list` once per reconciliation, not after every update; an unchanged repeated read can be blocked.

## When to touch the list

1. **New request with more than one ask or step, or a goal that will cross turns:** reconcile before working. Read the current list once, then create the missing items, update the ones the user changed, and merge duplicates. A single quick ask with nothing else open needs no list.
2. **Starting an item:** mark it `in_progress` (with `activeForm`) before its first tool call. Independent items can be `in_progress` together.
3. **Item delivered:** mark it `completed` right away, in the same turn its proof lands (test passed, commit pushed, deploy healthy). Never batch completions at the end, and never complete partial, failing, or unverified work: keep it `in_progress` and write the blocker in its `description`.
4. **Milestone** (a commit, a merge, a deploy, a subagent or worker result, a compaction, a long run of tool calls on one item): check the list against what actually happened. Statuses that drifted get fixed now.
5. **User adds, changes, or drops something mid-work:** a new ask becomes an item; a changed ask updates its item; a dropped or replaced ask is merged into its replacement or deleted. Never let the old version linger.
6. **Before the final answer or a progress report:** make the list match reality. Every open item is delivered (`completed`), still running, or blocked with the reason in its description. The report covers every open item, not only the last one touched.

## Pruning stale items

At each reconciliation, look at every open item and ask whether it still describes something the user wants:

- Finished but still open: complete it.
- Superseded by a newer request, made moot by a decision, or explicitly dropped: merge it into its replacement or delete it, and say so briefly in the answer.
- A step that slipped in as an item ("Diagnosticar…", "Commitar", "Validar"): fold it into the outcome it serves and delete it.
- Still wanted but waiting on the user or a third party: keep it open with the blocker in its description; waiting is not a new item.
- Open for hours with no movement: it was too big; split it into separately verifiable deliveries.

Never silently drop an open item the user still might want: complete it, record its blocker, or ask.

## What the list is not

- Not the deliverable and not a reason to stop: update it in the same turn as the work and keep going.
- Not a per-step plan or execution queue: steps live inside the item they deliver.
- Not something to re-read without new information: reuse the last tool result.
