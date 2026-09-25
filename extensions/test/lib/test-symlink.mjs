import { symlinkSync } from "node:fs";

export function createTestSymlink(target, linkPath, type) {
  symlinkSync(target, linkPath, process.platform === "win32" && type === "dir" ? "junction" : type);
}

export function trySymlinkFile(target, linkPath, testCase) {
  try {
    symlinkSync(target, linkPath, "file");
    return true;
  } catch (error) {
    if (process.platform !== "win32" || error.code !== "EPERM") throw error;
    console.log(`SKIP (Windows sem privilégio de symlink): ${testCase}`);
    return false;
  }
}
