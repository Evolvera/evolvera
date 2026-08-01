import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// STATEFUL RESOURCE PROOF: NO_STATEFUL_RESOURCES. Static policy/frontmatter inspection only.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (relativePath) => readFile(resolve(root, relativePath), "utf8");
const workers = ["creative", "critical", "explorer", "methodical", "skeptical"];

const [skill, system, systemMirror, dataAgent, auditor, ...workerTexts] = await Promise.all([
  read("skills/deep-research/SKILL.md"),
  read("SYSTEM.md"),
  read("config/SYSTEM.md"),
  read("agents/deep-research-data.md"),
  read("agents/deep-research-auditor.md"),
  ...workers.map((name) => read(`agents/deep-research-${name}.md`)),
]);

assert.equal(system, systemMirror, "SYSTEM mirrors must remain byte-identical");
assert.match(system, /Six parallel researchers—including a public official-API\/data ETL specialist/i);
assert.match(skill, /Six Researchers, One Auditor/);
assert.match(skill, /deep-research-data/);
assert.match(skill, /all six with `run_in_background: true`/);
assert.match(skill, /public `GET`\/`HEAD`/);
assert.match(skill, /unique `mktemp -d` scratch/);
assert.match(skill, /RESEARCH_DIR=<PROJECT_ROOT>\/\.pi\/research\/<slug>/);
assert.match(skill, /ETL_DIR=<RESEARCH_DIR>\/etl/);
assert.match(skill, /exactly `pipeline\.py`, `derived\.json`, and `manifest\.json`/);
assert.match(skill, /data agent never writes the narrative final report/i);
assert.match(skill, /final report cites official sources.*not local artifact paths/i);
assert.match(skill, /no credentials\/project data\/package installs/i);

assert.match(dataAgent, /^name: deep-research-data$/m);
assert.match(dataAgent, /^model: openai-codex\/gpt-5\.6-luna$/m);
assert.match(dataAgent, /^thinking: xhigh$/m);
assert.match(dataAgent, /^max_turns: 70$/m);
assert.match(dataAgent, /^tools: jina_read, bash, write, read$/m);
assert.match(dataAgent, /official public APIs, open datasets, downloadable CSV\/JSON\/XLSX/i);
assert.match(dataAgent, /read-only retrieval: `GET`\/`HEAD`/);
assert.match(dataAgent, /mktemp -d/);
assert.match(dataAgent, /absolute, unique, project-owned `ETL_DIR`/);
assert.match(dataAgent, /Create exactly these durable ETL artifacts in `ETL_DIR`.*`pipeline\.py`, `derived\.json`, and `manifest\.json`/s);
assert.match(dataAgent, /Execute the pipeline once against the public source/);
assert.match(dataAgent, /Never read `\.env`, credentials, auth stores, project files except the supplied empty `ETL_DIR`/i);
assert.match(dataAgent, /Never send authentication, cookies, tokens, API keys, POST\/PUT\/PATCH\/DELETE requests/i);
assert.match(dataAgent, /etl_artifacts:/);
assert.match(dataAgent, /pipeline_path: null/);
assert.match(dataAgent, /manifest_path: null/);
assert.match(dataAgent, /agent_id: "data"/);

assert.match(auditor, /ETL_DIR\/pipeline\.py/);
assert.match(auditor, /read the supplied `pipeline\.py`, `derived\.json`, and `manifest\.json`/);
assert.match(auditor, /Cite the official source URL, never a local ETL artifact path/);

for (let index = 0; index < workers.length; index += 1) {
  const text = workerTexts[index];
  assert.match(text, /^tools: jina_read, bash, write$/m, workers[index]);
  assert.match(text, /## Structured Data Retrieval/, workers[index]);
  assert.match(text, /public `GET`\/`HEAD` requests only/, workers[index]);
  assert.match(text, /unique `mktemp -d` directory/, workers[index]);
  assert.match(text, /Never read `\.env`, credentials, auth stores, project files/i, workers[index]);
  assert.match(text, /If structured retrieval is blocked, undocumented, or needs unsupported assumptions, record the gap/i, workers[index]);
}

console.log("deep-research data workflow smoke: PASS");
