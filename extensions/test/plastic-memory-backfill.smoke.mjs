import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backfill = await import(pathToFileURL(path.join(root, "plastic-memory/session/backfill.ts")).href);
const ids = await import(pathToFileURL(path.join(root, "plastic-memory/common/ids.ts")).href);

function history(turnCount) {
  const binding = {
    sessionId: ids.sessionDigest("backfill-test-session", { generation: 1 }),
    generation: 1,
    branchId: "branch-main",
  };
  const branchEntries = [];
  const historicalPrefixIds = [];
  let parentId = null;
  for (let turn = 0; turn < turnCount; turn += 1) {
    for (const role of ["user", "assistant"]) {
      const id = `entry-${turn}-${role}`;
      branchEntries.push({
        type: "message", id, parentId,
        message: { role, content: role }, tokenCount: 1,
      });
      historicalPrefixIds.push(id);
      parentId = id;
    }
  }
  const records = [];
  return {
    binding, branchEntries, records,
    bootstrap: { activeEntryIds: [], historicalPrefixIds, historicalGap: "historical-unindexed" },
    append(record) { records.push(record); },
  };
}

async function processAllWindows(turnCount) {
  const input = history(turnCount);
  let processorCalls = 0;
  for (let index = 0; index < turnCount; index += 1) {
    const result = await backfill.startBackfill(input, () => {
      processorCalls += 1;
      return { outcome: "complete" };
    });
    assert.equal(result.status, "complete", `window ${index + 1} must publish`);
  }
  const finalReport = backfill.reportBackfill(input);
  assert.equal(finalReport.status, "complete", "all historical windows were processed");
  assert.equal(finalReport.safeWindows.length, 0);
  assert.equal(processorCalls, turnCount);
}

// Dez e dezessete janelas, acima do limite de oito exibidas por relatório,
// devem ser processadas integralmente quando cada execução relê o cursor.
await processAllWindows(10);
await processAllWindows(17);

// Um histórico encerrado exatamente na oitava janela também deve terminar.
await processAllWindows(8);

// Só a primeira janela do relatório atual pode ser publicada; a segunda é
// stale. Isso impede avançar com um relatório antigo ou pular o cursor.
{
  const input = history(10);
  let writes = 0;
  const report = backfill.reportBackfill(input);
  assert.equal(report.status, "ready");
  assert.equal(report.safeWindows.length, 8);
  const result = backfill.publishBackfill(
    { ...input, append() { writes += 1; } },
    report,
    report.safeWindows[1],
    { outcome: "complete" },
  );
  assert.equal(result.status, "stale");
  assert.equal(writes, 0, "a non-head window cannot advance the cursor");
}

console.log("PLASTIC_MEMORY_BACKFILL: PASS (10/17-window resume, exact eight-window completion, stale non-head window)");
