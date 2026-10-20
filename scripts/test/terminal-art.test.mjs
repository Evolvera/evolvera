import test from "node:test";
import assert from "node:assert/strict";
import { isEvolveraLabel, renderTerminalArt } from "../ui/terminal-art.mjs";
import { EVOLVERA_MASK } from "../ui/terminal-art-masks.mjs";
import { paintTerminalShip } from "../ui/terminal-art-ship.mjs";

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

test("SGR cell decoder applies foreground/background deltas and line resets", () => {
  const decode = (line) => {
    let fg = null, bg = null;
    const cells = [];
    for (const token of line.match(/\u001b\[[0-9;]*m|./gu) ?? []) {
      if (token === "\u001b[0m") { fg = null; bg = null; continue; }
      if (token.startsWith("\u001b[")) {
        const params = token.slice(2, -1).split(";");
        for (let i = 0; i < params.length;) {
          if (params[i] === "0") { fg = null; bg = null; i++; }
          else if (params[i] === "38" || params[i] === "48") {
            const target = params[i] === "38" ? "fg" : "bg";
            const value = params.slice(i + 2, i + 5).join(";");
            if (target === "fg") fg = value; else bg = value;
            i += 5;
          } else throw new Error(`Unexpected SGR parameter ${params[i]}`);
        }
      } else cells.push({ char: token, fg, bg });
    }
    return cells;
  };
  assert.deepEqual(decode("\u001b[38;2;1;2;3;48;2;4;5;6mA\u001b[38;2;7;8;9mB\u001b[48;2;9;8;7mC\u001b[0mD"), [
    { char: "A", fg: "1;2;3", bg: "4;5;6" },
    { char: "B", fg: "7;8;9", bg: "4;5;6" },
    { char: "C", fg: "7;8;9", bg: "9;8;7" },
    { char: "D", fg: null, bg: null },
  ]);
  const frame = renderTerminalArt({ width: 120, height: 28 });
  assert.ok(frame.every((line) => decode(line).length === 120));
  assert.deepEqual(decode(frame[0])[0], { char: " ", fg: "29;21;53", bg: "29;21;53" });
  assert.ok(frame.some((line) => /\u001b\[38;2;[0-9;]+m(?!\u001b\[48;2;)/u.test(line)), "foreground-only changes reuse the existing background");
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

test("official SVG-derived mask keeps its broken shoulder and open center", () => {
  assert.equal(EVOLVERA_MASK.length, 34);
  assert.ok(EVOLVERA_MASK.every((line) => line.length === 40));
  assert.equal(EVOLVERA_MASK[10], "              B   DDDDBBBB              ");
  assert.match(EVOLVERA_MASK[22], /DDD {10}D/u);
  assert.deepEqual(renderTerminalArt({ width: 20, height: 5, label: "evolvera" }), renderTerminalArt({ width: 20, height: 5 }));
});

const shipPixels = (width, height, timeMs = 0) => {
  const pixels = new Map();
  paintTerminalShip({ columns: width, pixelsHigh: height * 2,
    phase: (timeMs % 24000) / 24000 * Math.PI * 2,
    paint: (x, y, ink) => pixels.set(`${x},${y}`, { x, y, ink }) });
  return [...pixels.values()];
};
const extent = (pixels) => ({
  left: Math.min(...pixels.map(({ x }) => x)), right: Math.max(...pixels.map(({ x }) => x)),
  top: Math.min(...pixels.map(({ y }) => y)), bottom: Math.max(...pixels.map(({ y }) => y)),
});

test("broad reference ship has three enclosed galleries, raised roof, blunt hull and many golden oars", () => {
  for (const [width, height] of [[120, 28], [120, 20], [80, 17]]) {
    const pixels = shipPixels(width, height);
    const byInk = (ink) => pixels.filter((pixel) => pixel.ink === ink);
    const hull = extent(byInk("hull"));
    const body = extent(pixels.filter(({ ink }) => ["hull", "rail", "gallery", "timber"].includes(ink)));
    assert.ok(body.right - body.left >= width * .45 && body.right - body.left <= width * .65);
    assert.ok(hull.bottom >= height * 2 * .8, "long hull rests on the water");
    const rails = byInk("rail");
    const railRows = [...new Set(rails.map(({ y }) => y))];
    const longRails = railRows.filter((y) => rails.filter((pixel) => pixel.y === y).length > width * .14);
    assert.ok(longRails.length >= 3, "multiple continuous gallery/deck rails");
    assert.ok(byInk("gallery").length >= width * .3, "dark enclosed window bays");
    assert.ok(byInk("timber").length > 15, "wooden gallery ribs and platform ends");
    assert.ok(extent(byInk("roof")).top < extent(rails).top - 1, "raised pagoda roof, not a sail");
    assert.ok(new Set(byInk("oar").filter(({ y }) => y >= hull.bottom).map(({ x }) => x)).size >= 8, "many separate long oars");
    for (const pixel of pixels) assert.ok(pixel.x >= 0 && pixel.x < width && pixel.y >= 0 && pixel.y < height * 2);
  }
});

test("official blue emblem stays inside the small fluttering light-field mast flag, never a detached billboard", () => {
  for (const [width, height] of [[120, 28], [120, 20], [80, 17]]) {
    for (const timeMs of [0, 500, 1500, 3000]) {
      const pixels = shipPixels(width, height, timeMs);
      const cloth = pixels.filter(({ ink }) => ["flag", "flagShade", "blue", "fold"].includes(ink));
      const logo = cloth.filter(({ ink }) => ink === "blue" || ink === "fold");
      const field = extent(cloth);
      const mark = extent(logo);
      assert.ok(logo.length >= 20 && cloth.length > logo.length * 1.3, "real mark and visible light cloth");
      assert.ok(field.right - field.left <= 24 && field.bottom - field.top <= 23);
      assert.ok(mark.left > field.left && mark.right < field.right, "emblem inset from cloth edge");
      assert.ok(mark.top > field.top && mark.bottom <= field.bottom);
      assert.ok(field.left > width * .65, "upper-right mast, away from main sun");
      assert.ok(pixels.some(({ x, y, ink }) => x === field.left - 1 && y === field.top && ink === "mast"), "flag attached to mast");
      const middle = logo.filter(({ y }) => y === Math.floor((mark.top + mark.bottom) / 2));
      assert.ok(middle.some(({ x }) => x < (mark.left + mark.right) / 2) && middle.some(({ x }) => x > (mark.left + mark.right) / 2), "both actual triangle arms");
      const unbranded = renderTerminalArt({ width, height, timeMs, label: "Evolvera Labs" }).join("");
      assert.doesNotMatch(unbranded, BLUE);
      for (const rgb of ["172;119;125", "204;170;96", "245;230;250"]) assert.ok(!unbranded.includes(rgb), "no ship or flag for other accounts");
      const branded = renderTerminalArt({ width, height, timeMs, label: " EVOLVERA " }).join("");
      assert.match(branded, BLUE);
      assert.ok(branded.includes("204;170;96"), "ship and mark composed together");
    }
  }
});

test("ambient motion is apparent, coherent and periodic without replaying the intro", () => {
  for (const label of ["", "evolvera"]) {
    for (const [width, height] of [[80, 17], [120, 20], [120, 28]]) {
      const frames = [0, 500, 1500, 3000].map((timeMs) => renderTerminalArt({ width, height, label, timeMs }));
      assert.equal(new Set(frames.map((frame) => frame.join(""))).size, 4);
      for (const color of [true, false]) {
        for (const timeMs of [0, 500, 1500, 3000, 11999, 23999, 24000, Number.MAX_VALUE]) {
          for (const progress of [0, .3, .6, .9, 1]) {
            const options = { width, height, label, color, timeMs, progress };
            const frame = assertBounds(options, width, height);
            assert.deepEqual(frame, renderTerminalArt(options));
            if (color) for (const line of frame) assert.ok(!line.replace(SGR, "").includes("\u001b"));
          }
        }
      }
      assert.deepEqual(frames[1], renderTerminalArt({ width, height, label, timeMs: 24500 }));
      assert.deepEqual(renderTerminalArt({ width, height, label, progress: .6, timeMs: 3000 }),
        renderTerminalArt({ width, height, label, progress: .6, timeMs: 0 }));
    }
  }
  const a = renderTerminalArt({ width: 120, height: 28, timeMs: 0 });
  const b = renderTerminalArt({ width: 120, height: 28, timeMs: 3000 });
  assert.notDeepEqual(a.slice(3, 6), b.slice(3, 6), "cloud ribbons drift");
  assert.deepEqual(a.slice(15, 19), b.slice(15, 19), "mountains and camera stay fixed");
  assert.notDeepEqual(a.slice(21), b.slice(21), "travelling waves and specular reflection");
  assert.notDeepEqual(shipPixels(120, 28, 0), shipPixels(120, 28, 1500), "vessel, oars and cloth move");
});

test("invalid ambient times are zero, finite extremes are safe, aliases switch branding immediately", () => {
  for (const timeMs of [-1, -Infinity, Infinity, NaN, undefined, null, "500", {}]) {
    assert.deepEqual(renderTerminalArt({ timeMs }), renderTerminalArt({ timeMs: 0 }));
  }
  const original = Math.random;
  Math.random = () => { throw new Error("ambient RNG"); };
  try {
    for (const timeMs of [500, 1500, 3000, Number.MAX_VALUE]) {
      assert.deepEqual(renderTerminalArt({ label: "Evolvera", timeMs }), renderTerminalArt({ label: " evolvera ", timeMs }));
      assert.deepEqual(renderTerminalArt({ label: "Other", timeMs }), renderTerminalArt({ label: "", timeMs }));
    }
  } finally { Math.random = original; }
});
