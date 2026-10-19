// Static, dependency-free terminal translation; provenance and palette: docs/terminal-art.md.
const ESC = "\u001b[";
const GROUND = "29;21;53";
const PALETTE = {
  purple: "106;63;140",
  lilac: "233;196;255",
  coral: "240;144;130",
  yellow: "230;230;30",
  blue: "77;154;191",
};
const RAMP = " .:-=+*#%@$";

// Cropped official SVG silhouette, sampled to an 18 × 16 square-pixel grid.
// Two vertical samples become one terminal cell, preserving its 1:2 aspect ratio.
const EVOLVERA = [
  "                  ",
  "        BB        ",
  "        BB        ",
  "       BBBB       ",
  "        BBBB      ",
  "      B BBBB      ",
  "     BBB BBBB     ",
  "     BBB  BBB     ",
  "    BBBB  BBBB    ",
  "    BBB    BBB    ",
  "   BBBB    BBBB   ",
  "  BBBB      BBBB  ",
  "  BBBB      BBBB  ",
  " BBBBBBBBBBBBBBBB ",
  " BBBBBBBBBBBBBBBB ",
  "BBBBBBBBBBBBBBBBBB",
];
const EVOLVERA_SMALL = [
  "            ",
  "     BB     ",
  "     BBB    ",
  "    BBBB    ",
  "   BB BBB   ",
  "   BB  BB   ",
  "  BBB  BBB  ",
  " BBB    BBB ",
  " BBBBBBBBBB ",
  "BBBBBBBBBBBB",
];
// The PI SVG is exactly a four-unit grid after cropping its transparent margin.
// C: coral top/right return; B: blue angular lower-left; Y: yellow right stem.
const PI = ["CCC ", "B C ", "BB Y", "B  Y"];
const MASK_COLORS = { C: "coral", B: "blue", Y: "yellow" };

export function isEvolveraLabel(label) {
  return typeof label === "string" && label.trim().toLowerCase() === "evolvera";
}

function dimension(value, maximum) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(0, Math.floor(value)))
    : 0;
}

// Integer hash, fixed seed: texture never depends on time, process state, or RNG.
function hash(x, y) {
  let n = Math.imul(x + 19, 374761393) ^ Math.imul(y + 73, 668265263) ^ 9075;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}

function piMask(scale) {
  return PI.flatMap((row) => Array.from({ length: scale }, () =>
    [...row].map((pixel) => pixel.repeat(scale)).join("")));
}

function drawMask(canvas, mask, left, top) {
  for (let y = 0; y < mask.length; y += 2) {
    for (let x = 0; x < mask[0].length; x++) {
      const upper = MASK_COLORS[mask[y][x]];
      const lower = MASK_COLORS[mask[y + 1]?.[x]];
      if (!upper && !lower) continue;
      canvas[top + y / 2][left + x] = {
        glyph: upper && lower ? (upper === lower ? "█" : "▀") : upper ? "▀" : "▄",
        foreground: upper || lower,
        background: upper && lower && upper !== lower ? lower : undefined,
      };
    }
  }
}

function serialize(row, color) {
  if (!color) return row.map(({ glyph }) => glyph).join("").trimEnd();
  let result = "";
  let previous = "";
  for (const { glyph, foreground = "purple", background } of row) {
    const style = `38;2;${PALETTE[foreground]};48;2;${background ? PALETTE[background] : GROUND}`;
    if (style !== previous) result += `${ESC}${style}m`;
    result += glyph;
    previous = style;
  }
  return `${result}${ESC}0m`;
}

/** Pure static ANSI/monochrome art; the caller owns terminal sizing and margins. */
export function renderTerminalArt({ width = 80, height = 12, label = "", color = true } = {}) {
  const columns = dimension(width, 112);
  const rows = dimension(height, 12);
  if (!columns || !rows) return [];
  const evolvera = isEvolveraLabel(label);
  if (columns < 40 || rows < 6) {
    const text = (evolvera ? "PI / evolvera" : "PI").slice(0, columns);
    return [color ? `${ESC}38;2;${PALETTE.coral}m${text}${ESC}0m` : text];
  }

  const full = columns >= 72 && rows >= 12;
  const pi = piMask(full ? 3 : 2);
  const triangle = full ? EVOLVERA : EVOLVERA_SMALL;
  const piLeft = full ? 4 : 2;
  const triangleLeft = columns - triangle[0].length - (full ? 3 : 2);
  const piTop = full ? 2 : rows >= 8 ? 1 : 0;
  const triangleTop = full || rows >= 8 ? 1 : 0;
  const nameRow = full ? 10 : rows - 1;
  const sceneLeft = piLeft + pi[0].length + (full ? 5 : 3);
  const sceneRight = evolvera ? triangleLeft - 3 : columns - 2;
  const span = sceneRight - sceneLeft;
  const sunX = sceneLeft + Math.floor(span * (evolvera ? 0.51 : 0.58));
  const horizon = Math.floor(rows * 0.62);
  const sunY = full ? 3 : 2;
  const sunRadius = full ? 3.1 : 1.7;
  const canvas = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => ({ glyph: " ", foreground: "purple" })));

  // Distant dots/halftones -> solid mid-ground -> dense foreground glyphs.
  // There is deliberately no interpolated color, smooth shading, or animation.
  for (let y = 0; y < rows; y++) {
    for (let x = sceneLeft; x <= sceneRight; x++) {
      const noise = hash(x, y);
      const u = (x - sceneLeft) / Math.max(1, span);
      const peak = horizon - 1 - Math.round(
        Math.max(0, 1 - Math.abs(u - 0.19) * 7) * (full ? 3 : 2)
        + Math.max(0, 1 - Math.abs(u - 0.83) * 8) * 2);
      let glyph = " ";
      let foreground = "purple";
      if (y < horizon) {
        glyph = noise % 7 === 0 ? "." : noise % 13 === 0 ? ":" : " ";
        if (y === horizon - 2 && noise % 3 === 0) glyph = ":";
        const distance = Math.hypot((x - sunX) / 2, y - sunY);
        if (distance <= sunRadius + 0.8 && distance > sunRadius && noise % 3 === 0) {
          glyph = ".";
          foreground = "yellow";
        }
        if (distance <= sunRadius) {
          glyph = y === sunY - Math.floor(sunRadius) || y === horizon - 1 ? "▄" : "█";
          foreground = "coral";
        }
        if (y >= peak) {
          glyph = y === peak ? (noise % 3 === 0 ? ":" : "░") : "▓";
          foreground = y === peak ? "lilac" : "purple";
        }
        if (y >= peak + 1 && (u < 0.3 || u > 0.75)) {
          glyph = RAMP[6 + noise % 5];
          foreground = y === peak + 1 ? "coral" : "purple";
        }
      } else {
        const reflection = Math.abs(x - sunX) < (y - horizon + 2) * 1.7;
        glyph = reflection && noise % 3 !== 0
          ? RAMP[3 + noise % 5]
          : RAMP[noise % 4];
        foreground = reflection && noise % 3 !== 0 ? "coral" : "purple";
        if (y === horizon && noise % 3 !== 0) {
          glyph = "=";
          foreground = "lilac";
        }
        if (reflection && noise % 11 === 0) foreground = "yellow";
      }
      canvas[y][x] = { glyph, foreground };
    }
  }

  drawMask(canvas, pi, piLeft, piTop);
  if (evolvera) drawMask(canvas, triangle, triangleLeft, triangleTop);
  const name = (text, left) => {
    for (const [i, glyph] of [...text].entries()) {
      canvas[nameRow][left + i] = { glyph, foreground: "lilac" };
    }
  };
  name("PI", piLeft + Math.floor((pi[0].length - 2) / 2));
  if (evolvera) name("evolvera", triangleLeft + Math.floor((triangle[0].length - 8) / 2));
  return canvas.map((row) => serialize(row, color));
}
