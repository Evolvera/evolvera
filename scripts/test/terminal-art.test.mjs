import test from "node:test";
import assert from "node:assert/strict";
import { isEvolveraLabel, renderTerminalArt } from "../ui/terminal-art.mjs";
import { EVOLVERA_MASK } from "../ui/terminal-art-masks.mjs";

const SGR = /\u001b\[[0-9;]*m/gu;
const plain = (lines) => lines.map((line) => line.replace(SGR, ""));
const WIDTH_ONE = /^[\x20-\x7e▓▀▄█]*$/u;
const BLUE = /(?:38|48);2;(?:33;148;208|18;75;133)/u;

function assertBounds(options, width, height) {
  const lines = renderTerminalArt(options);
  assert.equal(lines.length, height);
  for (const line of plain(lines)) {
    assert.match(line, WIDTH_ONE);
    assert.equal([...line].length, width);
  }
  return lines;
}

test("only the exact normalized string label selects Evolvera; PI never appears", () => {
  for (const label of ["EVOLVERA", "Evolvera", "evolvera", " evolvera "]) {
    assert.equal(isEvolveraLabel(label), true);
    assert.match(renderTerminalArt({ label }).join(""), BLUE);
  }
  for (const label of ["Eveolvera", "Evolvera Labs", "my evolvera", "evolvera-id", undefined,
    null, false, 0, {}, ["evolvera"], { label: "evolvera" }, new String("evolvera")]) {
    assert.equal(isEvolveraLabel(label), false);
    const lines = renderTerminalArt({ label });
    assert.doesNotMatch(lines.join(""), BLUE);
    assert.doesNotMatch(plain(lines).join("\n"), /PI|evolvera|π/u);
  }
});

test("safe finite dimensions, full supplied area and a 240 x 40 allocation cap", () => {
  for (const value of [0, -1, -Infinity, Infinity, NaN, null, "80", {}]) {
    assert.deepEqual(renderTerminalArt({ width: value }), []);
    assert.deepEqual(renderTerminalArt({ height: value }), []);
  }
  for (const label of ["", "evolvera"]) {
    for (const [width, height] of [[1, 1], [2, 8], [12, 3], [39, 5], [40, 8],
      [80, 16], [100, 26], [120, 28], [200, 36], [240, 40], [80.9, 8.9]]) {
      assertBounds({ width, height, label }, Math.floor(width), Math.floor(height));
    }
    assertBounds({ width: Number.MAX_VALUE, height: Number.MAX_VALUE, label }, 240, 40);
  }
  assert.equal(renderTerminalArt().length, 24);
});

test("all layered frames are deterministic, bounded, and consume no ambient RNG", () => {
  const original = Math.random;
  Math.random = () => { throw new Error("ambient RNG"); };
  try {
    for (const progress of [0, .3, .6, 1]) {
      for (const [width, height] of [[40, 8], [80, 16], [120, 28], [200, 36]]) {
        for (const label of ["evolvera", "Other"]) {
          const options = { width, height, label, progress };
          const lines = assertBounds(options, width, height);
          assert.deepEqual(lines, renderTerminalArt(options));
        }
      }
    }
    assert.deepEqual(renderTerminalArt({ label: "Evolvera" }), renderTerminalArt({ label: " evolvera " }));
    assert.deepEqual(renderTerminalArt({ label: "Other" }), renderTerminalArt({ label: "" }));
  } finally { Math.random = original; }
  assert.deepEqual(renderTerminalArt({ progress: -1 }), renderTerminalArt({ progress: 0 }));
  for (const progress of [2, NaN, Infinity, undefined]) {
    assert.deepEqual(renderTerminalArt({ progress }), renderTerminalArt({ progress: 1 }));
  }
  const frames = [0, .3, .6, 1].map((progress) => renderTerminalArt({ progress }).join(""));
  assert.equal(new Set(frames).size, 4);
  assert.doesNotMatch(renderTerminalArt({ label: "Evolvera", progress: .6 }).join(""), BLUE);
});

test("colored frames emit SGR only and reset every line; tonal fields use backgrounds", () => {
  const lines = renderTerminalArt({ width: 120, height: 28, label: "evolvera" });
  for (const line of lines) {
    assert.ok(line.endsWith("\u001b[0m"));
    assert.ok(!line.replace(SGR, "").includes("\u001b"));
  }
  const scene = lines.join("\n");
  for (const rgb of ["29;21;53", "75;42;115", "154;79;158", "233;196;255", "242;140;106", "90;47;120"]) {
    assert.ok(scene.includes(`48;2;${rgb}`), `background field ${rgb}`);
  }
  assert.match(scene, /230;230;30/u, "acid halo accents");
  assert.ok(plain(lines).slice(0, 4).some((line) => / {20}/u.test(line)), "solid spaces not noisy glyphs");
});

test("monochrome is meaningful and escape-free with near, mid and water layers", () => {
  for (const label of ["", "evolvera"]) {
    for (const height of [8, 16, 28]) {
      const lines = assertBounds({ width: 120, height, label, color: false }, 120, height);
      assert.ok(!lines.join("").includes("\u001b"));
      assert.match(lines.join("\n"), /▓/u);
      assert.match(lines.join("\n"), /[#%]/u);
      assert.match(lines.at(-1), /[~=]/u, "water reaches final supplied row");
    }
  }
});

test("SVG-derived 40-pixel folded silhouette preserves the broken left shoulder and open center", () => {
  assert.equal(EVOLVERA_MASK.length, 34);
  assert.ok(EVOLVERA_MASK.every((line) => line.length === 40));
  assert.equal(EVOLVERA_MASK[10], "              B   DDDDBBBB              ");
  assert.match(EVOLVERA_MASK[22], /DDD {10}D/u);
  const branded = renderTerminalArt({ width: 120, height: 28, label: "evolvera", color: false });
  const unbranded = renderTerminalArt({ width: 120, height: 28, color: false });
  assert.doesNotMatch(unbranded.join(""), /[█▀▄]/u);
  const markRows = branded.filter((line) => /[█▀▄]/u.test(line));
  assert.ok(markRows.length >= 14, "large 32-40 pixel mark, not old 18x16 motif");
  assert.ok(markRows.at(-1).match(/█/gu).length >= 32);
  assert.match(markRows[Math.floor(markRows.length / 2)], /█[^█]+█/u, "open center");
  assert.deepEqual(renderTerminalArt({ width: 20, height: 5, label: "evolvera" }), renderTerminalArt({ width: 20, height: 5 }));
});
