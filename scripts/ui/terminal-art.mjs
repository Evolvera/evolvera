import { EVOLVERA_MASK } from "./terminal-art-masks.mjs";

// A square-pixel scene: two vertical pixels share a terminal cell. Solid fields
// use background spaces, avoiding the hairline seams of a wall of full blocks.
const ESC = "\u001b[";
const COLORS = {
  night: "29;21;53", dusk: "75;42;115", violet: "154;79;158",
  lilac: "233;196;255", coral: "242;140;106", yellow: "230;230;30",
  far: "106;63;140", mid: "58;36;89", near: "21;15;34",
  water: "90;47;120", blue: "33;148;208", fold: "18;75;133",
};
const MONO = { night: " ", dusk: ".", violet: ":", lilac: "=", coral: "+", far: ":", mid: "▓", near: "#", water: "~" };
const FAR = [.50,.48,.46,.43,.40,.43,.46,.48,.50,.48,.46,.44,.47,.49,.48,.46,.43,.41,.44,.47,.49,.50,.48,.46];
const MID = [.59,.61,.62,.60,.57,.53,.49,.52,.56,.59,.61,.62,.61,.59,.56,.54,.57,.60,.62,.63,.61,.58,.56,.58];
const NEAR = [.65,.68,.71,.73,.74,.71,.66,.61,.59,.62,.67,.71,.73,.74,.73,.70,.66,.64,.67,.71,.73,.71,.68,.65];
const dimension = (value, maximum) => typeof value === "number" && Number.isFinite(value)
  ? Math.min(maximum, Math.max(0, Math.floor(value))) : 0;
const clamp = (value) => Math.max(0, Math.min(1, value));
const stage = (progress, start, end) => clamp((progress - start) / (end - start));
const hash = (x, y) => {
  let n = Math.imul(x + 19, 374761393) ^ Math.imul(y + 73, 668265263) ^ 9075;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
};

export function isEvolveraLabel(label) {
  return typeof label === "string" && label.trim().toLowerCase() === "evolvera";
}

/** Pure, seeded landscape. Callers own timing and cursor movement, never art. */
export function renderTerminalArt({ width = 80, height = 24, label = "", color = true, progress = 1 } = {}) {
  const columns = dimension(width, 240);
  const rows = dimension(height, 40);
  if (!columns || !rows) return [];
  const p = typeof progress === "number" && Number.isFinite(progress) ? clamp(progress) : 1;
  const pixelsHigh = rows * 2;
  const sky = stage(p, 0, .18);
  const light = stage(p, .12, .36);
  const water = stage(p, .60, .84);
  const brand = stage(p, .80, 1);
  const horizon = Math.floor(pixelsHigh * .72);
  const sunX = Math.floor(columns * .31);
  const sunY = Math.floor(pixelsHigh * .32);
  const radius = Math.max(1, Math.min(columns * .13, pixelsHigh * .22));
  const chunk = Math.max(1, Math.round(columns / 64));
  const pixel = Array.from({ length: pixelsHigh }, () => Array(columns).fill("night"));
  const textures = new Map();
  const setTexture = (x, y, glyph, ink) => textures.set(`${x},${Math.floor(y / 2)}`, { glyph, ink });

  for (let y = 0; y < pixelsHigh; y++) {
    for (let x = 0; x < columns; x++) {
      // Stepped purple/lilac/coral sky, not interpolated gradients or noise.
      const bandY = y / pixelsHigh + ((Math.floor(x / chunk) % 5 === 0) ? .015 : 0);
      if (y < horizon && y < Math.ceil(sky * pixelsHigh)) pixel[y][x] = bandY < .17 ? "night"
        : bandY < .32 ? "dusk" : bandY < .45 ? "violet" : bandY < .56 ? "lilac" : "coral";
      if (light > 0 && x <= Math.ceil(light * columns)) {
        const distance = Math.hypot(x - sunX, y - sunY);
        if (distance < radius + 3 * chunk && distance > radius && x % 2 === 0 && y % 2 === 0) {
          pixel[y][x] = "yellow";
        }
        if (distance <= radius && x <= sunX - radius + light * radius * 2) pixel[y][x] = "coral";
        // Deliberate broad halftone cloud ribbons, with open sky between them.
        if (y >= pixelsHigh * .14 && y < pixelsHigh * .19 && x > columns * .49
          && x < columns * .95 && x % 3 !== 0 && y % 2 === 0) pixel[y][x] = "lilac";
        if (y >= pixelsHigh * .38 && y < pixelsHigh * .41 && x < columns * .19
          && (x + y) % 2 === 0) pixel[y][x] = "lilac";
      }
      for (const [profile, ink, start, end] of [[FAR, "far", .30, .47], [MID, "mid", .40, .58], [NEAR, "near", .50, .68]]) {
        const reveal = stage(p, start, end);
        const ridge = Math.floor(profile[Math.min(profile.length - 1, Math.floor(x / columns * profile.length))] * pixelsHigh);
        if (reveal > 0 && x < Math.ceil(reveal * columns) && y >= ridge && y < horizon + 2) {
          pixel[y][x] = y === ridge && ink !== "far" ? "coral" : ink;
          if (ink === "far" && x % 3 === 0 && y % 2 === 0) pixel[y][x] = "mid";
          if (ink === "near" && y % 2 === 0 && hash(x, y) % 9 === 0) setTexture(x, y, "%", "mid");
        }
      }
      if (water > 0 && y >= horizon && y < horizon + Math.ceil(water * (pixelsHigh - horizon))) {
        pixel[y][x] = y < horizon + 2 ? "far" : "water";
        const n = hash(x, Math.floor(y / 2));
        const reflected = Math.abs(x - sunX + ((Math.floor(y / 2) % 3) - 1) * chunk) < radius * (.32 + (y - horizon) / pixelsHigh);
        if (y % 2 === 0 && n % 5 === 0) setTexture(x, y, "~", "far");
        if (reflected && y % 2 === 0 && n % 4 !== 0) setTexture(x, y, n % 3 === 0 ? "#" : "=", n % 17 === 0 ? "yellow" : "coral");
        else if (y % 4 === 0 && n % 13 === 0) setTexture(x, y, "-", "lilac");
      }
    }
  }

  // A single blue landmark on the right bank, never paired brand billboards.
  // Small viewports keep the landscape instead of squeezing in an illegible mark.
  if (isEvolveraLabel(label) && columns >= 40 && rows >= 8 && brand > 0) {
    const markWidth = Math.min(40, Math.floor(columns * .32), Math.floor(pixelsHigh * .74));
    const markHeight = Math.max(1, Math.round(markWidth * 34 / 40));
    const left = Math.min(columns - markWidth - 2, Math.floor(columns * .76 - markWidth / 2));
    const top = Math.max(1, horizon - markHeight);
    for (let y = 0; y < markHeight; y++) {
      for (let x = 0; x < markWidth; x++) {
        const sample = EVOLVERA_MASK[Math.min(33, Math.floor(y * 34 / markHeight))][Math.floor(x * 40 / markWidth)];
        if (sample !== " " && y < Math.ceil(brand * markHeight)) {
          pixel[top + y][left + x] = sample === "B" ? "blue" : "fold";
          textures.delete(`${left + x},${Math.floor((top + y) / 2)}`);
        }
      }
    }
  }

  return Array.from({ length: rows }, (_, y) => {
    let line = "";
    let previous = "";
    for (let x = 0; x < columns; x++) {
      const upper = pixel[y * 2][x];
      const lower = pixel[y * 2 + 1][x];
      const texture = textures.get(`${x},${y}`);
      if (!color) {
        const blueTop = upper === "blue" || upper === "fold";
        const blueBottom = lower === "blue" || lower === "fold";
        line += blueTop || blueBottom ? blueTop && blueBottom ? "█" : blueTop ? "▀" : "▄"
          : texture?.glyph ?? MONO[lower] ?? "+";
        continue;
      }
      const glyph = texture?.glyph ?? (upper === lower ? " " : "▀");
      const style = `38;2;${COLORS[texture?.ink ?? upper]};48;2;${COLORS[lower]}`;
      if (style !== previous) line += `${ESC}${style}m`;
      line += glyph;
      previous = style;
    }
    return color ? `${line}${ESC}0m` : line;
  });
}
