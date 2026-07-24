// Inert text fixture: this file must never be imported or executed.
export default {
  projects: [{ name: "browser-fixture", use: { browserName: "chromium" } }],
  webServer: { command: "node -e 'throw new Error(\"CONFIG_MUST_NOT_EXECUTE\")'", url: "https://fixture.invalid" },
  globalSetup: "./global-setup.js",
  database: "postgres://fixture-secret.invalid/qa",
  migration: "drop table qa_fixture;",
};
