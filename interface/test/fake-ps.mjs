#!/usr/bin/env node
// Deterministic process-listing stand-in; its only output is fixture JSON for tests.
import { appendFileSync, readFileSync } from "node:fs";
if (process.env.FAKE_PS_COUNT) appendFileSync(process.env.FAKE_PS_COUNT, "spawn\n");
if (process.env.FAKE_PS_MODE === "hang") setInterval(() => {}, 1000);
else if (process.env.FAKE_PS_MODE === "fail") process.exit(3);
else if (process.env.FAKE_PS_MODE === "malformed") process.stdout.write("{oops");
else if (process.env.FAKE_PS_MODE === "large") process.stdout.write("x".repeat(17 * 1024 * 1024));
else {
  const rows = JSON.parse(readFileSync(process.env.FAKE_PS_ROWS, "utf8"));
  process.stdout.write(JSON.stringify(rows));
}
