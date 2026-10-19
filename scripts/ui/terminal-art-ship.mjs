import { EVOLVERA_MASK } from "./terminal-art-masks.mjs";

// Broad, blunt-ended gallery ship, not a sailboat. All coordinates are scene
// square pixels; the caller owns compositing, clipping and terminal encoding.
export function paintTerminalShip({ columns, pixelsHigh, phase = 0, reveal = 1, paint }) {
  if (columns < 40 || pixelsHigh < 16 || reveal <= 0) return;
  const width = Math.floor(columns * .54);
  const left = columns - width - Math.max(2, Math.floor(columns * .04));
  const bob = Math.round(Math.sin(phase * 2));
  const keel = Math.min(pixelsHigh - 4, Math.floor(pixelsHigh * .85)) + bob;
  const bodyHeight = Math.max(5, Math.min(15, Math.floor(pixelsHigh * .25)));
  const top = keel - bodyHeight;
  const decks = pixelsHigh >= 30 ? 3 : 2;
  const deckHeight = Math.max(2, Math.floor((bodyHeight - 1) / decks));
  const edge = width - Math.max(4, Math.floor(width * .12));
  const slope = (x) => Math.floor(x / width * 2);
  const put = (x, y, ink) => {
    if (y <= keel + 6 && y >= keel + 6 - Math.ceil(reveal * (pixelsHigh + 6))) paint(left + x, y, ink);
  };
  const line = (x0, y0, x1, y1, ink) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= steps; i++) {
      const f = steps ? i / steps : 0;
      put(Math.round(x0 + (x1 - x0) * f), Math.round(y0 + (y1 - y0) * f), ink);
    }
  };
  const rect = (x, y, w, h, ink) => {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) put(x + dx, y + dy, ink);
  };

  // Far-side oars are partly hidden by the broad hull; the near bank is drawn
  // last. All rowers share a stroke, rather than independent per-frame noise.
  const stroke = Math.sin(phase * 8);
  for (let x = 5; x < width - 4; x += 5) {
    line(x, keel - 3, x - 6 + Math.round(stroke * 2), keel + 2, "oarShade");
  }
  for (let x = 1; x < width - 1; x++) {
    const bevel = x < 4 || x > width - 5 ? 1 : 0;
    line(x, keel - 3 + bevel, x, keel, "hull");
    put(x, keel + 1 - bevel, "timber");
    put(x, keel - 2, "rail");
  }
  // A projecting platform at each blunt end; the shaded right return makes
  // the enclosed galleries read as a miniature building, not a flat barge.
  line(-1, keel - 1, width + 1, keel - 1, "timber");
  line(1, keel, width - 1, keel, "hull");
  for (let d = 0; d < decks; d++) {
    const y = top + d * deckHeight;
    for (let x = 2; x < width - 2; x++) {
      const dy = slope(x);
      for (let yy = 0; yy < deckHeight; yy++) {
        const post = (x - 2) % 5 === 0 || x === edge;
        put(x, y + dy + yy, yy === 0 ? "rail" : post ? "timber" : x > edge ? "hull" : "gallery");
      }
      if (d === decks - 1) put(x, y + dy + deckHeight, "timber");
    }
  }
  line(2, top - 1, edge, top, "deck");
  line(edge, top, width - 3, top + 1, "timber");

  // A raised central cabin with a stepped, upturned Japanese roof. No sail.
  const cabinX = Math.floor(width * .40);
  const cabinW = Math.max(7, Math.floor(width * .25));
  const roofY = top - Math.max(3, Math.floor(pixelsHigh * .08));
  rect(cabinX, roofY + 2, cabinW, Math.max(2, top - roofY - 1), "timber");
  rect(cabinX + 2, roofY + 3, Math.max(2, cabinW - 4), Math.max(1, top - roofY - 3), "gallery");
  line(cabinX - 3, roofY + 2, cabinX + cabinW + 2, roofY + 2, "hull");
  line(cabinX - 2, roofY + 1, cabinX + cabinW + 1, roofY + 1, "roof");
  line(cabinX + 1, roofY, cabinX + cabinW - 2, roofY, "roof");
  line(cabinX + 4, roofY - 1, cabinX + cabinW - 5, roofY - 1, "deck");
  put(cabinX - 3, roofY, "deck");
  put(cabinX + cabinW + 2, roofY, "deck");
  if (pixelsHigh >= 30) {
    const turretX = cabinX + Math.floor(cabinW / 2) - 2;
    rect(turretX, roofY - 2, 4, 2, "timber");
    line(turretX - 2, roofY - 2, turretX + 5, roofY - 2, "roof");
    line(turretX, roofY - 3, turretX + 3, roofY - 3, "deck");
    put(turretX - 2, roofY - 3, "deck");
    put(turretX + 5, roofY - 3, "deck");
  }

  // Slender bare masts retain the reference silhouette. Only the tall mast
  // carries cloth, and the official mark is sampled strictly inside that cloth.
  line(5, top - Math.max(4, Math.floor(pixelsHigh * .16)), 5, top, "mast");
  line(width - 6, top - Math.max(3, Math.floor(pixelsHigh * .11)), width - 6, top + 1, "mast");
  const mastX = Math.floor(width * .64);
  const flagH = Math.max(5, Math.min(18, Math.floor(pixelsHigh * .31), roofY - 3));
  const flagW = Math.max(8, Math.min(25, Math.floor(width * .35), Math.round(flagH / .82)));
  const flagY = Math.max(1, roofY - flagH - 3);
  line(mastX, flagY - 1, mastX, top, "mast");
  for (let x = 0; x < flagW; x++) {
    // Cloth is pinned to the pole; the same displacement carries field and
    // emblem, so the brand never detaches or becomes a freestanding fallback.
    const ripple = Math.round(Math.sin(x / flagW * Math.PI * 2 - phase * 12) * x / flagW);
    for (let y = 0; y < flagH; y++) {
      const mx = Math.floor((x - 2) * 40 / (flagW - 4));
      const my = Math.floor((y - 1) * 34 / (flagH - 2));
      const sample = mx >= 0 && mx < 40 && my >= 0 && my < 34 ? EVOLVERA_MASK[my][mx] : " ";
      put(mastX + 1 + x, flagY + y + ripple, sample === "B" ? "blue" : sample === "D" ? "fold"
        : Math.sin(x / flagW * Math.PI * 2 - phase * 12) > .4 ? "flagShade" : "flag");
    }
  }
  for (let x = 7; x < edge; x += 5) {
    const reach = 6 + Math.round(stroke * 2);
    const endX = x - reach;
    const endY = Math.min(pixelsHigh - 1, keel + 4 + Math.round(Math.cos(phase * 8)));
    line(x, keel - 1, endX, endY, "oar");
    line(endX, endY, endX + 1, endY, "deck");
  }
}
