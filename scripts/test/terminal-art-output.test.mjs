import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createTerminalArtOutput } from "../ui/terminal-art-output.mjs";

class Output extends EventEmitter {
  writes = [];
  blocked = false;
  write(value) { this.writes.push(value); return !this.blocked; }
  drain() { this.blocked = false; this.emit("drain"); }
}

test("owns alternate screen and writes only changed fixed-coordinate rows in one synchronized buffer", () => {
  const output = new Output();
  output.columns = 8; output.rows = 3;
  const writer = createTerminalArtOutput({ output });
  writer.render(() => ["abc", "def"]);
  assert.equal(output.writes.length, 1);
  assert.match(output.writes[0], /^\u001b\[\?1049h\u001b\[\?25l\u001b\[2J\u001b\[\?2026h/u);
  assert.match(output.writes[0], /\r\u001b\[1;1Habc/u);
  assert.match(output.writes[0], /\r\u001b\[2;1Hdef/u);
  assert.match(output.writes[0], /\u001b\[\?2026l$/u);
  writer.render(() => ["abc", "xyz"]);
  assert.equal(output.writes.length, 2);
  assert.doesNotMatch(output.writes[1], /\u001b\[1;1H/u, "identical rows are not rewritten");
  assert.match(output.writes[1], /\r\u001b\[2;1Hxyz/u);
  writer.render(() => ["abc", "xyz"]);
  assert.equal(output.writes.length, 2, "unchanged frames emit no output");
  writer.render(() => ["abc", "q"]);
  assert.match(output.writes[2], /\r\u001b\[2;1Hq {6}/u, "shortened text overwrites its old row tail opaquely");
  assert.doesNotMatch(output.writes[0] + output.writes[1] + output.writes[2], /\u001b\[2K|\n/u);
  writer.dispose();
  assert.equal(output.writes.at(-1), "\u001b[0m\u001b[?2026l\u001b[?25h\u001b[?1049l");
});

test("blocked output retains only a lazy latest render and ignores renders after disposal", () => {
  const output = new Output();
  output.columns = 8; output.rows = 3;
  output.blocked = true;
  const errors = [];
  const writer = createTerminalArtOutput({ output, onError: (error) => errors.push(error) });
  let generated = 0;
  writer.render(() => { generated++; return ["first"]; });
  for (let tick = 0; tick < 120; tick++) writer.render(() => { generated++; return [`obsolete-${tick}`]; });
  writer.render(() => { generated++; return ["latest"]; });
  assert.equal(generated, 1, "blocked frames are not generated");
  assert.equal(output.writes.length, 1);
  output.drain();
  assert.equal(generated, 2);
  assert.equal(output.writes.length, 2);
  assert.match(output.writes[1], /latest/u);
  writer.dispose();
  const count = output.writes.length;
  output.emit("drain");
  assert.equal(output.writes.length, count);
  assert.deepEqual(errors, []);
});

test("resize dimensions apply on the next frame and never expose the terminal's last column", () => {
  const output = new Output();
  let columns = 32;
  let rows = 8;
  const writer = createTerminalArtOutput({ output, getSize: () => ({ columns, rows }) });
  writer.render(({ width, height }) => Array.from({ length: height }, (_, row) => `${width}x${height}-${row}`));
  columns = 16; rows = 5;
  writer.render(({ width, height }) => Array.from({ length: height }, (_, row) => `${width}x${height}-${row}`));
  columns = 40; rows = 10;
  writer.render(({ width, height }) => Array.from({ length: height }, (_, row) => `${width}x${height}-${row}`));
  assert.match(output.writes[0], /31x8/u);
  assert.match(output.writes[1], /15x5/u);
  assert.match(output.writes[1], /\r\u001b\[5;1H/u);
  assert.doesNotMatch(output.writes[1], /\r\u001b\[(?:[6-9]|\d{2,});1H/u, "shrunk viewport is never addressed below its bottom row");
  assert.match(output.writes[2], /39x10/u);
  writer.dispose();
});
