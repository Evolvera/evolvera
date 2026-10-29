// 20-client, 30-second backpressure soak. The slow client is a fake that never drains;
// all sockets/timers are owned by this process and no network listener or PI process is started.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PiRpcSession } from "../server.mjs";

const session = new PiRpcSession({ projectId: "sse-soak", projectName: "sse-soak", cwd: process.cwd() });
const clients = Array.from({ length: 20 }, (_, index) => {
  const client = new EventEmitter();
  client.writes = 0;
  client.writableLength = 0;
  client.writeHead = () => {};
  client.write = (chunk) => {
    client.writes++;
    if (index === 0) client.writableLength += Buffer.byteLength(chunk);
    return index !== 0;
  };
  client.end = () => { client.ended = true; client.emit("close"); };
  session.addClient(client);
  return client;
});
const rssBefore = process.memoryUsage().rss;
const deadline = Date.now() + 30_000;
const payload = { type: "message_update", content: "x".repeat(16 * 1024) };
try {
  while (Date.now() < deadline) {
    session.broadcast("rpc", payload);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const rssGrowth = process.memoryUsage().rss - rssBefore;
  assert.equal(clients[0].ended, true, "paused client should be dropped during the soak");
  assert.ok(clients.slice(1).every((client) => !client.ended && client.writes > 0));
  assert.ok(rssGrowth < 32 * 1024 * 1024, `RSS grew ${rssGrowth} bytes`);
  console.log(`PASS: 20 clients, 30 s; paused client dropped; RSS growth ${Math.round(rssGrowth / 1024 / 1024)} MiB`);
} finally {
  for (const client of clients) client.emit("close");
}
