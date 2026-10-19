import { createInterface } from "node:readline";
const mode = process.env.PI_STUDIO_FAKE_VOICE_MODE || "normal";
if (mode === "slow-load") await new Promise((resolve) => setTimeout(resolve, 5000));
if (mode === "crash") process.exit(2);
console.log(JSON.stringify({ ready: true, device: "fake", model: "tiny" }));
const lines = createInterface({ input: process.stdin });
lines.on("line", async (line) => {
  const request = JSON.parse(line);
  if (mode === "hang") return;
  if (mode === "crash-request") process.exit(3);
  if (mode === "slow") await new Promise((resolve) => setTimeout(resolve, 200));
  console.log(JSON.stringify({ id: request.id, text: "olá", language: "pt", durationMs: 1000, device: "fake" }));
});
