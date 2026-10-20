import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { createAccount } from "../users/account-session.mjs";
import { parseNewAccountInput } from "../users/launcher.mjs";

const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), "auth-only-launcher-create-account-"));
const registryPath = path.join(runRoot, "registry", "users.json");
after(() => fs.rmSync(runRoot, { recursive: true, force: true }));

test("new-account input parses direct and legacy forms, cancels empty input, and reports invalid ids", () => {
  assert.deepEqual(parseNewAccountInput("kevin"), { id: "kevin", label: "kevin" });
  assert.deepEqual(parseNewAccountInput("kevin Personal Account"), { id: "kevin", label: "Personal Account" });
  assert.deepEqual(parseNewAccountInput("create kevin Personal Account"), { id: "kevin", label: "Personal Account" });
  assert.equal(parseNewAccountInput("  "), null);
  assert.throws(() => parseNewAccountInput("Kevin"), { code: "USER_ID_INVALID", message: "USER_ID_INVALID" });
});

test("an identical existing account is selected idempotently; conflicting registration is clear", () => {
  const first = createAccount({ registryPath, ...parseNewAccountInput("kevin") });
  const same = createAccount({ registryPath, ...parseNewAccountInput("kevin") });
  assert.equal(same.id, first.id);
  assert.throws(() => createAccount({ registryPath, ...parseNewAccountInput("kevin Other Label") }), (error) => {
    assert.equal(error.code, "USER_EXISTS");
    assert.match(error.message, /different data/u);
    return true;
  });
});
