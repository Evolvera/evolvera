import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const size = 32;
const pixels = Buffer.alloc(size * size * 4);
function rect(x0, y0, x1, y1, color) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * size + x) * 4;
    pixels[i] = color[2]; pixels[i + 1] = color[1]; pixels[i + 2] = color[0]; pixels[i + 3] = 255;
  }
}
rect(0, 0, size, size, [0, 0, 0]);
// Pixel-art pi: cap, two stems, and the characteristic curled descender.
rect(6, 7, 26, 11, [255, 255, 255]);
rect(9, 11, 13, 24, [255, 255, 255]);
rect(20, 11, 24, 21, [255, 255, 255]);
rect(16, 19, 24, 23, [255, 255, 255]);
rect(14, 21, 19, 25, [255, 255, 255]);
rect(12, 23, 16, 27, [255, 255, 255]);
const mask = Buffer.alloc(size * Math.ceil(size / 32) * 4);
const dib = Buffer.alloc(40 + pixels.length + mask.length);
dib.writeUInt32LE(40, 0); dib.writeInt32LE(size, 4); dib.writeInt32LE(size * 2, 8);
dib.writeUInt16LE(1, 12); dib.writeUInt16LE(32, 14); dib.writeUInt32LE(pixels.length, 20);
pixels.copy(dib, 40); mask.copy(dib, 40 + pixels.length);
const ico = Buffer.alloc(6 + 16 + dib.length);
ico.writeUInt16LE(0, 0); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
ico.writeUInt8(size, 6); ico.writeUInt8(size, 7); ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(dib.length, 14); ico.writeUInt32LE(22, 18); dib.copy(ico, 22);
const output = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), 'pi-studio.ico');
await writeFile(output, ico);
