import test from "node:test";
import assert from "node:assert/strict";
import { startArtAnimation } from "../ui/terminal-art-animation.mjs";

function fakeClock() {
  let time = 0;
  let next = 0;
  const timers = new Map();
  return {
    timers,
    clock: {
      now: () => time,
      setInterval(fn, ms) { const id = ++next; timers.set(id, { fn, ms }); return id; },
      clearInterval(id) { timers.delete(id); },
    },
    tick(ms) { time += ms; for (const { fn } of [...timers.values()]) fn(); },
    set(ms) { time = ms; for (const { fn } of [...timers.values()]) fn(); },
  };
}

test("animation emits bounded monotonic progress and a final frame before clearing its timer", () => {
  const fake = fakeClock();
  const frames = [];
  const stop = startArtAnimation({ clock: fake.clock, durationMs: 1000, intervalMs: 50, onFrame: (p) => frames.push(p) });
  assert.deepEqual(frames, [0]);
  fake.tick(400);
  fake.tick(800);
  assert.deepEqual(frames, [0, 0.4, 1]);
  assert.equal(fake.timers.size, 0);
  stop();
  assert.deepEqual(frames, [0, 0.4, 1]);
});

test("clock regressions cannot make progress decrease", () => {
  const fake = fakeClock();
  const frames = [];
  startArtAnimation({ clock: fake.clock, durationMs: 1000, onFrame: (p) => frames.push(p) });
  fake.set(400);
  fake.set(200);
  fake.set(1000);
  assert.deepEqual(frames, [0, 0.4, 0.4, 1]);
});

test("early stop is idempotent and callback errors cancel before reporting", () => {
  const fake = fakeClock();
  const frames = [];
  const stop = startArtAnimation({ clock: fake.clock, onFrame: (p) => frames.push(p) });
  stop(); stop(); fake.tick(2000);
  assert.deepEqual(frames, [0]);
  assert.equal(fake.timers.size, 0);

  const errors = [];
  startArtAnimation({ clock: fake.clock, onFrame: (p) => { if (p > 0) throw new Error("frame"); }, onError: (e) => errors.push(e.message) });
  fake.tick(100);
  assert.deepEqual(errors, ["frame"]);
  assert.equal(fake.timers.size, 0);
});

test("initial callback failure never schedules and invalid durations are rejected", () => {
  const fake = fakeClock();
  let reported;
  const stop = startArtAnimation({ clock: fake.clock, onFrame: () => { throw new Error("initial"); }, onError: (e) => { reported = e.message; } });
  assert.equal(reported, "initial");
  assert.equal(fake.timers.size, 0);
  stop();
  assert.throws(() => startArtAnimation({ onFrame() {}, durationMs: Infinity }), /durationMs/u);
});
