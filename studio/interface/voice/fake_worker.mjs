import { createInterface } from "node:readline";
const mode = process.env.PI_STUDIO_FAKE_VOICE_MODE || "normal";
if (mode === "slow-load") await new Promise((resolve) => setTimeout(resolve, Number(process.env.PI_STUDIO_FAKE_VOICE_DELAY || 5000)));
if (mode === "crash") process.exit(2);
if (mode === "load-error") { console.log(JSON.stringify({ ready: false, error: "unavailable" })); process.exit(1); }
if (mode === "malformed") console.log("not-json");
console.log(JSON.stringify({ ready: true, ...(mode === "metadata-empty" ? {} : { device: "fake", model: "tiny" }) }));
const lines = createInterface({ input: process.stdin });
lines.on("line", async (line) => {
  const request = JSON.parse(line);
  if (mode === "hang") return;
  if (mode === "crash-request") process.exit(3);
  if (mode === "slow") await new Promise((resolve) => setTimeout(resolve, Number(process.env.PI_STUDIO_FAKE_VOICE_DELAY || 200)));
  if (mode === "response-error" || mode === "response-timeout") { console.log(JSON.stringify({ id: request.id, error: mode === "response-timeout" ? "Tempo limite da transcrição excedido." : "transcription failed" })); return; }
  console.log(JSON.stringify({ id: request.id, text: "olá", language: "pt", durationMs: 1000, ...(mode === "result-no-device" || mode === "metadata-empty" ? {} : { device: "fake" }) }));
});
