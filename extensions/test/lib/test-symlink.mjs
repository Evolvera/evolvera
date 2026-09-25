import { symlinkSync } from "node:fs";

export function createTestSymlink(target, linkPath, type) {
  symlinkSync(target, linkPath, process.platform === "win32" && type === "dir" ? "junction" : type);
}
