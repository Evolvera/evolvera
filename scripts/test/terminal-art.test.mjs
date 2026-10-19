import test from "node:test";
import assert from "node:assert/strict";
import { isEvolveraLabel, renderTerminalArt } from "../ui/terminal-art.mjs";

const SGR = /\u001b\[[0-9;]*m/gu;
const plain = (lines) => lines.map((line) => line.replace(SGR, ""));
// These ASCII, shade, and block glyphs are all single-column terminal glyphs.
const WIDTH_ONE = /^[\x20-\x7e░▓▀▄█]*$/u;
const crop = (lines, x, y, width, height) => lines.slice(y, y + height)
  .map((line) => line.slice(x, x + width).padEnd(width));

function assertBounds(options, maxWidth, maxHeight) {
  const lines = renderTerminalArt(options);
  assert.ok(lines.length <= maxHeight);
  for (const line of plain(lines)) {
    assert.match(line, WIDTH_ONE);
    assert.ok([...line].length <= maxWidth, `${[...line].length} > ${maxWidth}`);
  }
  return lines;
}

test("only the exact normalized string label selects Evolvera", () => {
  for (const label of ["EVOLVERA", "Evolvera", "evolvera", " evolvera "]) {
    assert.equal(isEvolveraLabel(label), true);
  }
  for (const label of ["Evolvera Labs", "my evolvera", "evolvera-id", undefined,
    null, false, 0, {}, ["evolvera"], { label: "evolvera" }, new String("evolvera")]) {
    assert.equal(isEvolveraLabel(label), false);
    assert.doesNotMatch(plain(renderTerminalArt({ label })).join("\n"), /evolvera/iu);
  }
});

test("dimensions are finite bounded integers; huge requests cannot allocate huge scenes", () => {
  for (const value of [0, -1, -Infinity, Infinity, NaN, null, "80", {}]) {
    assert.deepEqual(renderTerminalArt({ width: value }), []);
    assert.deepEqual(renderTerminalArt({ height: value }), []);
  }
  for (const label of ["", "evolvera"]) {
    for (const [width, height] of [[1, 1], [2, 8], [12, 3], [39, 5], [40, 6],
      [40, 8], [71, 11], [72, 12], [80, 8], [80, 12], [112, 16], [80.9, 8.9]]) {
      assertBounds({ width, height, label }, Math.floor(width), Math.floor(height));
    }
    assertBounds({ width: Number.MAX_VALUE, height: Number.MAX_VALUE, label }, 112, 12);
  }
  assert.equal(renderTerminalArt().length, 12);
  assert.deepEqual(renderTerminalArt({ width: 1, height: 1, color: false }), ["P"]);
});

test("art is deterministic, label-normalized, and independent of Math.random", () => {
  const original = Math.random;
  Math.random = () => { throw new Error("renderer must not consume ambient RNG"); };
  try {
    const options = { width: 80, height: 12, label: "Evolvera" };
    assert.deepEqual(renderTerminalArt(options), renderTerminalArt(options));
    assert.deepEqual(renderTerminalArt(options), renderTerminalArt({ ...options, label: " evolvera " }));
    assert.deepEqual(renderTerminalArt({ label: "Other" }), renderTerminalArt({ label: "" }));
  } finally {
    Math.random = original;
  }
});

test("color emits SGR only, at most five accents, and each line restores terminal style", () => {
  const lines = renderTerminalArt({ label: "evolvera" });
  const foregrounds = new Set();
  for (const line of lines) {
    assert.ok(line.endsWith("\u001b[0m"));
    assert.ok(!line.replace(SGR, "").includes("\u001b"), "no cursor/OSC controls");
    for (const match of line.matchAll(/38;2;(\d+;\d+;\d+)/gu)) foregrounds.add(match[1]);
  }
  assert.equal(foregrounds.size, 5);
  const piRows = lines.slice(2, 8).join("\n");
  for (const rgb of ["240;144;130", "77;154;191", "230;230;30"]) {
    assert.ok(piRows.includes(`38;2;${rgb}`));
  }
});

test("monochrome retains masks and landscape without any escape sequences", () => {
  for (const label of ["", "evolvera"]) {
    for (const height of [8, 12]) {
      const monochrome = renderTerminalArt({ label, height, color: false });
      assert.ok(!monochrome.join("").includes("\u001b"));
      assert.deepEqual(monochrome, plain(renderTerminalArt({ label, height })).map((line) => line.trimEnd()));
      assert.match(monochrome.join("\n"), /[░▓]/u, "halftone distant mountains");
      assert.match(monochrome.slice(-3).join("\n"), /[=+*#]/u, "water/reflection glyphs");
    }
  }
});

test("normal size keeps the official PI silhouette, not a letter or pi glyph", () => {
  const expected = [
    "█████████   ",
    "▀▀▀▀▀▀███   ",
    "███   ███   ",
    "██████   ███",
    "███▀▀▀   ███",
    "███      ███",
  ];
  for (const label of ["", "Other", "evolvera"]) {
    const lines = renderTerminalArt({ label, color: false });
    assert.deepEqual(crop(lines, 4, 2, 12, 6), expected);
    assert.equal(lines[10].slice(9, 11), "PI");
    assert.ok(!lines.join("").includes("π"));
  }
});

test("Evolvera adds the sampled open triangular mark and name, including compact layouts", () => {
  const normal = renderTerminalArt({ label: "evolvera", color: false });
  assert.deepEqual(crop(normal, 59, 1, 18, 8), [
    "        ▄▄        ",
    "       ▄██▄       ",
    "      ▄ ████      ",
    "     ███ ▀███     ",
    "    ███▀  ▀███    ",
    "  ▄███▀    ▀███▄  ",
    " ▄████▄▄▄▄▄▄████▄ ",
    "▄████████████████▄",
  ]);
  assert.match(normal[10], /evolvera/u);
  for (const [width, height] of [[40, 6], [56, 8], [80, 8]]) {
    const lines = renderTerminalArt({ width, height, label: "evolvera", color: false });
    assert.match(lines.at(-1), /PI.*evolvera/u);
    assert.deepEqual(crop(lines, 2, height >= 8 ? 1 : 0, 8, 4), [
      "██████  ", "██  ██  ", "████  ██", "██    ██",
    ]);
    assert.equal(crop(lines, width - 14, height >= 8 ? 1 : 0, 12, 5).at(-1), "▄██████████▄");
  }
});
