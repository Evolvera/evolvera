import assert from "node:assert/strict";
import { loadJiti } from "./lib/pi-sdk.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Explicit references link issues while bare issue numbers remain unlinked, preventing accidental updates.
const { createJiti } = await loadJiti(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const mod = await createJiti(import.meta.url).import(path.join(root, "extensions/github-kanban-sync.ts"));
// Subject owner/repo#N is accepted because it explicitly names the repository and issue.
assert.equal(mod.parseIssueReference({ subject: "Fix owner/repo#12" }).number, 12);
// A bare #N is rejected because it does not uniquely identify a repository.
assert.equal(mod.parseIssueReference({ subject: "Fix #12" }), undefined);
// Full issue URLs in metadata are accepted and retain their repository.
assert.equal(mod.parseIssueReference({ metadata: { issue: "https://github.com/acme/app/issues/9" } }).repo, "app");
// Numeric metadata.issue plus metadata.repo is accepted as an explicit reference.
assert.deepEqual(mod.parseIssueReference({ metadata: { issue: 13, repo: "acme/project" } }), { owner: "acme", repo: "project", number: 13 });
// Status matching selects the in-progress option by name.
assert.equal(mod.statusOptionId(["Todo", "In Progress", "Done"], "in_progress"), "In Progress");
// Completion selects an available review option, never the Done option.
assert.equal(mod.statusOptionId([{ id: "review-id", name: "In Review" }, { id: "done-id", name: "Done" }], "completed"), "review-id");
// Missing review options leave the field unchanged rather than setting Done.
assert.equal(mod.statusOptionId(["Todo", "Done"], "completed"), undefined);
// Localized blocked status aliases match the provided project option.
assert.equal(mod.statusOptionId(["Backlog", "Bloqueado"], "blocked"), "Bloqueado");
