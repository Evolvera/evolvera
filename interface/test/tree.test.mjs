// Tree tests use only synthetic session records and injectable providers so the tree contract is deterministic and isolated.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createTreeService } from "../lib-server/tree.mjs";

// Builds a stable project/environment tree and preserves the same ETag until source data changes.
test("tree service composes project and worktree entries with conditional versions", async () => {
  let changed = 0;
  let activity = 800;
  const service = createTreeService({
    now: () => 1000 + changed,
    getProjects: async () => [{ id: "p", name: "proj", cwd: "C:/repo" }],
    getOrca: async () => ({ available: true, worktrees: [{ path: "C:/repo", repoId: "r", worktreeId: "r", displayName: "main", branch: "main", isMainWorktree: true, status: "working", agents: [] }, { path: "C:/repo/wt", repoId: "r", worktreeId: "w", displayName: "feature", branch: "feature", isMainWorktree: false, status: "inactive", agents: [] }] }),
    getSessions: async () => [{ path: "C:/s/a.jsonl", header: { id: "a", cwd: "C:/repo", timestamp: new Date(10).toISOString() }, stat: { mtimeMs: 900, size: 0 }, title: "A", state: "pronto", lastAssistantAt: activity }],
    getLive: async () => [],
  });
  const first = await service.get();
  assert.equal(first.projects[0].envs.length, 2);
  assert.equal(first.projects[0].envs[0].pis[0].title, "A");
  assert.equal((await service.get(first.version)).notModified, true);
  changed += 1001;
  activity++;
  assert.equal((await service.get(first.version)).notModified, false);
  service.close();
});
