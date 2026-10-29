// Stops Studio-spawned PIs nobody is using (Miguel: nothing left running that is not used).
// Fail-safe: any doubt (busy, watched, dialog, recent event, active sub-PI, probe error) keeps the PI alive.
import { open, readdir, stat } from "node:fs/promises";
import path from "node:path";

const MINUTE = 60_000;

export function idleThresholdMs(env = process.env) {
  if (env.NODE_ENV === "test") {
    const testMs = Number(env.PI_STUDIO_IDLE_PI_TEST_MS);
    if (Number.isFinite(testMs) && testMs > 0) return testMs;
  }
  const minutes = Number(env.PI_STUDIO_IDLE_PI_MINUTES ?? 15);
  return Number.isFinite(minutes) ? Math.min(240, Math.max(5, minutes)) * MINUTE : 15 * MINUTE;
}

// pinned: the session holds an open Vorcaro request (the conductor still verifies or continues it);
// awaitingUser: its last answer asked the user something. Neither is "unused".
export function isIdleCandidate(s, now, thresholdMs) {
  if (s.exited || s.streaming || s.clientCount > 0 || s.waitingUi || s.pinned || s.awaitingUser) return false;
  return now - s.lastViewedAt >= thresholdMs && now - s.lastEventAt >= thresholdMs;
}

// The header is the first JSONL line (≤ 16 KiB); anything unreadable or malformed is "not a child".
async function readHeader(file, openFile) {
  let handle;
  try { handle = await openFile(file, "r"); } catch { return null; }
  const buffer = Buffer.alloc(16 * 1024);
  // The handle is closed whether the read succeeds or not; a failed read reads as "no header".
  const bytesRead = await handle.read(buffer, 0, buffer.length, 0).then((r) => r.bytesRead, () => 0).finally(() => handle.close());
  try {
    return JSON.parse(buffer.subarray(0, bytesRead).toString("utf8").split(/\r?\n/, 1)[0]);
  } catch {
    return null;
  }
}

const pathKey = (value, platform) => {
  const normal = path.resolve(String(value)).replaceAll("\\", "/");
  return platform === "win32" ? normal.toLowerCase() : normal;
};

// Sub-PIs live next to their parent (same cwd → same sessions folder) and name it in `parentSession`.
export async function hasRecentChildActivity(sessionFile, { now = Date.now(), thresholdMs, platform = process.platform, statFile = stat, openFile = open } = {}) {
  if (!sessionFile) return false;
  const parentKey = pathKey(sessionFile, platform);
  const dir = path.dirname(path.resolve(String(sessionFile)));
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return false; }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
    const file = path.join(dir, entry.name);
    let info;
    try { info = await statFile(file); } catch { continue; }
    if (now - info.mtimeMs >= thresholdMs) continue;
    const header = await readHeader(file, openFile);
    if (header?.parentSession && pathKey(header.parentSession, platform) === parentKey) return true;
  }
  return false;
}

// sessions: [{ id, cwd, sessionFile, snapshot(): {exited, streaming, clientCount, waitingUi, lastViewedAt, lastEventAt}, stop() }]
export async function reapIdle(sessions, { now = Date.now(), thresholdMs, childActive, log }) {
  const reaped = [];
  for (const session of sessions) {
    if (!isIdleCandidate(session.snapshot(), now, thresholdMs)) continue;
    let busyChild;
    try { busyChild = await childActive(session.sessionFile); } catch { continue; }
    // Re-check after the await: the PI may have started work meanwhile.
    if (busyChild || !isIdleCandidate(session.snapshot(), now, thresholdMs)) continue;
    log(`Encerrando PI ocioso do Studio em ${session.cwd} (sem uso há ${Math.round(thresholdMs / MINUTE)} min ou mais)`);
    session.stop();
    reaped.push(session.id);
  }
  return reaped;
}
