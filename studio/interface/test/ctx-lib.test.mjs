// Pure helpers of the colored Contexto / Arquivos / Worktrees views (public/lib.js). No DOM, no network.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFile } from "node:fs/promises";
import * as lib from "../public/lib.js";

describe("contextTone", () => {
  test("bar color flips exactly at 60 and above 85 (green < 60 <= amber <= 85 < red)", () => {
    // Boundaries of the spec: the color must not change early or late, or the bar lies about the risk.
    assert.equal(lib.contextTone(0), "green");
    assert.equal(lib.contextTone(59.9), "green");
    assert.equal(lib.contextTone(60), "amber");
    assert.equal(lib.contextTone(85), "amber");
    assert.equal(lib.contextTone(85.1), "red");
    assert.equal(lib.contextTone(100), "red");
  });
  test("a non-number keeps the calm color instead of throwing", () => {
    // Stats may arrive without a percent; the bar is not drawn then, but the helper must stay total.
    assert.equal(lib.contextTone(Number.NaN), "green");
    assert.equal(lib.contextTone(undefined), "green");
  });
});

describe("format of resources", () => {
  test("formatMb keeps MB below 1 GiB and switches to GB with one decimal above", () => {
    // 1023 MB is still MB; 1536 MB reads as 1.5 GB; junk shows a dash so the panel never prints NaN.
    assert.equal(lib.formatMb(312.4), "312 MB");
    assert.equal(lib.formatMb(1023.4), "1023 MB");
    assert.equal(lib.formatMb(1536), "1.5 GB");
    assert.equal(lib.formatMb(null), "n/d");
    assert.equal(lib.formatMb(-1), "n/d");
  });
  test("formatCpu rounds, shows <1% for a tiny load and a dash when unknown", () => {
    // Zero is a real answer ("0%"); null means "not measured yet" and must not look like zero.
    assert.equal(lib.formatCpu(4.2), "4%");
    assert.equal(lib.formatCpu(0), "0%");
    assert.equal(lib.formatCpu(0.3), "<1%");
    assert.equal(lib.formatCpu(250), "250%");
    assert.equal(lib.formatCpu(null), "n/d");
    assert.equal(lib.formatCpu(Number.NaN), "n/d");
  });
  test("resourceLine prefers the recent CPU, falls back to the average and is empty without data", () => {
    // The worktree card shows one muted line; nothing for a process we do not own.
    assert.equal(lib.resourceLine({ rssMb: 312, cpuRecentPct: 4, cpuAvgPct: 9 }), "RAM 312 MB · CPU 4%");
    assert.equal(lib.resourceLine({ rssMb: 312, cpuRecentPct: null, cpuAvgPct: 9 }), "RAM 312 MB · CPU 9%");
    assert.equal(lib.resourceLine({ rssMb: 12, cpuRecentPct: null, cpuAvgPct: null }), "RAM 12 MB · CPU n/d");
    assert.equal(lib.resourceLine(null), "");
    assert.equal(lib.resourceLine({}), "");
  });
  test("resourceRows lists RAM, both CPU figures and the process count", () => {
    // The Contexto section is a key/value list like its neighbours; singular/plural of the process count is Portuguese.
    assert.deepEqual(lib.resourceRows({ rssMb: 312, cpuAvgPct: 3.2, cpuRecentPct: 5, children: 3 }), [
      ["Memória (RAM)", "312 MB"], ["CPU média", "3%"], ["CPU (10 s)", "5%"], ["Processos filhos", "3"],
    ]);
    assert.equal(lib.resourceRows({ rssMb: 1, cpuAvgPct: 0, cpuRecentPct: null, children: 0 })[3][1], "0");
    assert.equal(lib.resourceRows({ rssMb: 1 })[3][1], "0");
    assert.deepEqual(lib.resourceRows(null), []);
  });
  test("resourceForPath finds the live Studio session of a worktree by directory, slash and case insensitive", () => {
    // Orca writes C:/x/y while the Studio stores C:\X\y; both must meet.
    const list = [{ cwd: "C:\\Work\\Alpha", rssMb: 1 }, { cwd: "/srv/beta/", rssMb: 2 }];
    assert.equal(lib.resourceForPath(list, "c:/work/alpha").rssMb, 1);
    assert.equal(lib.resourceForPath(list, "/srv/beta").rssMb, 2);
    assert.equal(lib.resourceForPath(list, "/srv/none"), null);
    assert.equal(lib.resourceForPath(null, "/srv/beta"), null);
    assert.equal(lib.resourceForPath(list, ""), null);
  });
});

describe("git file states", () => {
  test("gitStateInfo gives each colored state its label, tone and group; uncolored states give null", () => {
    // modified and staged share "alterado"; ignored/outside/unknown get no color at all.
    assert.deepEqual(lib.gitStateInfo("pushed"), { group: "pushed", label: "enviado", tone: "green" });
    assert.deepEqual(lib.gitStateInfo("committed"), { group: "committed", label: "commitado", tone: "blue" });
    assert.deepEqual(lib.gitStateInfo("modified"), { group: "changed", label: "alterado", tone: "amber" });
    assert.deepEqual(lib.gitStateInfo("staged"), { group: "changed", label: "alterado", tone: "amber" });
    assert.deepEqual(lib.gitStateInfo("untracked"), { group: "untracked", label: "novo", tone: "teal" });
    assert.deepEqual(lib.gitStateInfo("deleted"), { group: "deleted", label: "apagado", tone: "red" });
    for (const none of ["ignored", "outside", "weird", undefined, null]) assert.equal(lib.gitStateInfo(none), null, String(none));
  });

  test("gitFilesUrl repeats path=, encodes unicode and spaces, caps the count and skips huge paths", () => {
    // The conversation's files travel in the query; the cap keeps the URL far below the server's header limit.
    assert.equal(lib.gitFilesUrl("s 1", []), "/api/sessions/s%201/git-files");
    assert.equal(lib.gitFilesUrl("s", ["a b.txt", "ção/é.md"]), "/api/sessions/s/git-files?path=a%20b.txt&path=%C3%A7%C3%A3o%2F%C3%A9.md");
    const many = Array.from({ length: 100 }, (_, i) => `f${i}`);
    assert.equal((lib.gitFilesUrl("s", many).match(/path=/g) || []).length, 60);
    assert.equal(lib.gitFilesUrl("s", ["x".repeat(401), "ok"]), "/api/sessions/s/git-files?path=ok");
    assert.equal(lib.gitFilesUrl("s", [null, 5, "z"]), "/api/sessions/s/git-files?path=z");
  });

  const output = (p, extra = {}) => ({ path: p, name: p.split("/").pop(), kind: "edit", added: 1, removed: 0, toolIds: ["t"], ...extra });

  test("groupGitFiles merges conversation files with repo changes, dedups by repo path and orders groups", () => {
    // One list, grouped by state; a conversation file also reported by the repo appears once, with its diff counts.
    const data = {
      git: true, root: "C:/repo",
      files: [{ path: "src/a.js", state: "modified" }, { path: "new.txt", state: "untracked" }, { path: "old.txt", state: "deleted" }, { path: "c.js", state: "committed" }, { path: "st.js", state: "staged" }],
      requested: { "C:/repo/src/a.js": { state: "modified", path: "src/a.js" }, "docs/p.md": { state: "pushed", path: "docs/p.md" }, "/tmp/out.txt": { state: "outside", path: null }, "ign.log": { state: "ignored", path: "ign.log" } },
    };
    const groups = lib.groupGitFiles([output("C:/repo/src/a.js"), output("docs/p.md"), output("/tmp/out.txt"), output("ign.log")], data);
    assert.deepEqual(groups.map((group) => [group.key, group.label, group.tone, group.count]), [
      ["changed", "alterado", "amber", 2], ["untracked", "novo", "teal", 1], ["deleted", "apagado", "red", 1],
      ["committed", "commitado", "blue", 1], ["pushed", "enviado", "green", 1], ["other", "outros", "", 2],
    ]);
    const changed = groups[0].items;
    assert.deepEqual(changed.map((item) => [item.path, item.name, Boolean(item.output)]), [["C:/repo/src/a.js", "a.js", true], ["C:/repo/st.js", "st.js", false]]);
    assert.equal(groups[1].items[0].path, "C:/repo/new.txt");
    assert.equal(groups[5].items.map((item) => item.name).join(), "out.txt,ign.log");
  });

  test("groupGitFiles without git data keeps the plain list, marks nothing and survives odd payloads", () => {
    // git:false, a failed request (null) or a malformed payload must degrade to today's behavior, never throw.
    const outputs = [output("a.js"), output("b.js")];
    for (const data of [null, undefined, { git: false }, { git: true }, { git: true, files: "x", requested: 5 }]) {
      const groups = lib.groupGitFiles(outputs, data);
      assert.deepEqual(groups.map((group) => [group.key, group.count]), [["other", 2]], JSON.stringify(data));
    }
    assert.deepEqual(lib.groupGitFiles([], null), []);
    assert.deepEqual(lib.groupGitFiles(null, null), []);
    assert.deepEqual(lib.groupGitFiles(undefined, { git: true, root: "/r", files: [{ path: "x", state: "untracked" }] }).map((group) => group.items[0].path), ["/r/x"]);
  });

  test("groupGitFiles caps rows per group but keeps the true count, and ignores repo rows with unknown states or paths", () => {
    // 2000 untracked files must not become 2000 DOM rows: the group shows the first N and says how many are hidden.
    const files = Array.from({ length: 500 }, (_, i) => ({ path: `n${i}.txt`, state: "untracked" })).concat([{ path: "x", state: "weird" }, { path: 7, state: "untracked" }, null]);
    const [group] = lib.groupGitFiles([], { git: true, root: "/r", files }, { limit: 120 });
    assert.deepEqual([group.count, group.items.length, group.more], [500, 120, 380]);
    assert.equal(lib.groupGitFiles([], { git: true, root: "/r", files }, { limit: 0 })[0].items.length, 0);
    assert.equal(lib.groupGitFiles([], { git: true, root: "", files: [{ path: "a", state: "untracked" }] })[0].items[0].path, "a");
  });

  test("gitLegend lists the five colored states once each, in display order", () => {
    // The one-line legend at the top of the tab.
    assert.deepEqual(lib.gitLegend().map((entry) => [entry.label, entry.tone]), [["enviado", "green"], ["commitado", "blue"], ["alterado", "amber"], ["novo", "teal"], ["apagado", "red"]]);
  });
});

describe("app.js wiring", () => {
  test("every lib helper of the colored views is imported by app.js and exists in lib.js", async () => {
    // app.js is not loaded by any test; a missing import only fails in the browser (ReferenceError when the tab renders).
    const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
    const imported = app.slice(app.indexOf("import {"), app.indexOf('} from "./lib.js"'));
    for (const name of ["contextTone", "gitFilesUrl", "gitLegend", "groupGitFiles", "resourceForPath", "resourceLine", "resourceRows"]) {
      assert.ok(imported.includes(`  ${name},`), name);
      assert.equal(typeof lib[name], "function", name);
    }
  });
});
