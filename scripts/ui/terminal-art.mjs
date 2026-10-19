import { paintTerminalShip } from "./terminal-art-ship.mjs";

// A square-pixel scene: two vertical pixels share a terminal cell. Solid fields
// use background spaces, avoiding the hairline seams of a wall of full blocks.
const ESC = "\u001b[";
const COLORS = {
  night: "29;21;53", dusk: "75;42;115", violet: "154;79;158",
  lilac: "233;196;255", coral: "242;140;106", yellow: "230;230;30",
  far: "106;63;140", mid: "58;36;89", near: "21;15;34",
  water: "90;47;120", blue: "33;148;208", fold: "18;75;133",
  hull: "66;42;64", gallery: "43;29;51", timber: "172;119;125",
  rail: "221;155;135", deck: "245;194;151", roof: "129;105;142",
  oar: "204;170;96", oarShade: "139;109;95", mast: "215;181;134",
  flag: "245;230;250", flagShade: "207;186;225",
};
const MONO = { night: " ", dusk: ".", violet: ":", lilac: "=", coral: "+", far: ":", mid: "▓", near: "#", water: "~",
  hull: "#", gallery: " ", timber: "|", rail: "=", deck: "-", roof: "#", oar: "/", oarShade: "/", mast: "|", flag: ".", flagShade: ":" };
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

/** Pure landscape. progress reveals once; timeMs drives a coherent 24s loop. */
export function renderTerminalArt({ width = 80, height = 24, label = "", color = true, progress = 1, timeMs = 0 } = {}) {
  const columns = dimension(width, 240);
  const rows = dimension(height, 40);
  if (!columns || !rows) return [];
  const p = typeof progress === "number" && Number.isFinite(progress) ? clamp(progress) : 1;
  // Reduce before any arithmetic: even Number.MAX_VALUE is a safe phase.
  // Ambient movement starts after the reveal, never replays its layer stages.
  const time = typeof timeMs === "number" && Number.isFinite(timeMs) && timeMs > 0 ? timeMs % 24000 : 0;
  const phase = p === 1 ? time / 24000 * Math.PI * 2 : 0;
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
        const haloWidth = chunk * (2.5 + .5 * Math.sin(phase * 2));
        if (distance < radius + haloWidth && distance > radius && x % 2 === 0 && y % 2 === 0) {
          pixel[y][x] = Math.sin(x * .7 + y * .3 - phase * 4) > -.35 ? "yellow" : "coral";
        }
        if (distance <= radius && x <= sunX - radius + light * radius * 2) pixel[y][x] = "coral";
        // Deliberate broad halftone cloud ribbons, with open sky between them.
        const cloudDrift = Math.round(Math.sin(phase) * columns * .045);
        const cloudX = x - cloudDrift;
        if (y >= pixelsHigh * .14 && y < pixelsHigh * .19 && cloudX > columns * .49
          && cloudX < columns * .95 && cloudX % 3 !== 0 && y % 2 === 0) pixel[y][x] = "lilac";
        const lowCloudX = x + Math.round(Math.sin(phase) * columns * .025);
        if (y >= pixelsHigh * .38 && y < pixelsHigh * .41 && lowCloudX >= 0 && lowCloudX < columns * .19
          && (lowCloudX + y) % 2 === 0) pixel[y][x] = "lilac";
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
        const wave = x * .55 + Math.floor(y / 2) * 1.8 - phase * 8;
        const crest = Math.sin(wave);
        const reflected = Math.abs(x - sunX + Math.sin(y * .7 - phase * 4) * chunk * 1.5) < radius * (.32 + (y - horizon) / pixelsHigh);
        if (y % 2 === 0 && crest > .6) setTexture(x, y, "~", "far");
        if (reflected && y % 2 === 0 && crest > -.4) setTexture(x, y, crest > .8 ? "#" : "=", Math.sin(wave * .5 + phase * 2) > .93 ? "yellow" : "coral");
        else if (y % 4 === 0 && crest > .94) setTexture(x, y, "-", "lilac");
      }
    }
  }

  // The vessel is the only branded composition. There is deliberately no
  // freestanding-logo fallback at compact sizes and no ship for other labels.
  if (isEvolveraLabel(label) && brand > 0) {
    paintTerminalShip({ columns, pixelsHigh, phase, reveal: brand, paint: (x, y, ink) => {
      if (x < 0 || x >= columns || y < 0 || y >= pixelsHigh) return;
      pixel[y][x] = ink;
      textures.delete(`${x},${Math.floor(y / 2)}`);
    } });
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
