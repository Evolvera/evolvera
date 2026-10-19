import { appendFileSync } from "node:fs";

const callsPath = process.env.PI_KANBAN_FAKE_CALLS;
const args = process.argv.slice(1);
const mode = process.env.PI_KANBAN_FAKE_MODE ?? "ok";
const record = (entry) => { if (callsPath) appendFileSync(callsPath, `${JSON.stringify(entry)}\n`); };
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (!callsPath) {
  process.stderr.write("PI_KANBAN_FAKE_CALLS is required\n");
  process.exit(2);
}
record({ args, mode, phase: "start", at: Date.now() });
if (mode === "hang") await new Promise(() => {});
if (mode === "slow") await pause(100);
if (mode === "auth-missing") {
  process.stderr.write("You are not logged into any GitHub hosts.\n");
  process.exit(1);
}
if (mode === "failure") {
  process.stderr.write("fake gh failure\n");
  process.exit(1);
}

const queryArg = args.find((arg) => arg.startsWith("query=")) ?? "";
const query = queryArg.slice("query=".length);
if (query.includes("updateProjectV2ItemFieldValue")) {
  record({ args, mode, phase: "end", at: Date.now() });
  process.stdout.write(JSON.stringify({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: "item" } } } }));
  process.exit(0);
}
const numberArg = args.find((arg) => arg.startsWith("number="));
const number = numberArg ? Number(numberArg.slice("number=".length)) : 1;
const options = mode === "no-review-option"
  ? [{ id: "todo-id", name: "Todo" }, { id: "done-id", name: "Done" }]
  : [{ id: "progress-id", name: "In Progress" }, { id: "blocked-id", name: "Blocked" }, { id: "review-id", name: "In Review" }, { id: "done-id", name: "Done" }];
const current = mode === "already-in-status" ? "review-id" : "todo-id";
const result = {
  data: {
    repository: {
      issue: {
        projectItems: {
          nodes: [{
            id: `item-${number}`,
            project: { id: `project-${number}`, fields: { nodes: [{ id: `field-${number}`, name: "Status", options }] } },
            fieldValues: { nodes: [{ optionId: current, field: { name: "Status" } }] },
          }],
        },
      },
    },
  },
};
record({ args, mode, phase: "end", at: Date.now() });
process.stdout.write(JSON.stringify(result));
process.exit(0);
