import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../public/icons');
mkdirSync(OUT_DIR, { recursive: true });

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const compressed = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function setPixel(pixels, size, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 4;
  const dst = pixels[i + 3] / 255;
  const src = a / 255;
  const out = src + dst * (1 - src);
  if (out <= 0) return;
  pixels[i] = Math.round((r * src + pixels[i] * dst * (1 - src)) / out);
  pixels[i + 1] = Math.round((g * src + pixels[i + 1] * dst * (1 - src)) / out);
  pixels[i + 2] = Math.round((b * src + pixels[i + 2] * dst * (1 - src)) / out);
  pixels[i + 3] = Math.round(out * 255);
}

function fillCircle(pixels, size, cx, cy, r, color) {
  const r2 = r * r;
  const aa = 1.2;
  const xMin = Math.max(0, Math.floor(cx - r - 1));
  const xMax = Math.min(size - 1, Math.ceil(cx + r + 1));
  const yMin = Math.max(0, Math.floor(cy - r - 1));
  const yMax = Math.min(size - 1, Math.ceil(cy + r + 1));
  for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d2 = dx * dx + dy * dy;
      const d = Math.sqrt(d2);
      let a = 1;
      if (d > r) a = Math.max(0, 1 - (d - r) / aa);
      if (a <= 0) continue;
      setPixel(pixels, size, x, y, color[0], color[1], color[2], Math.round(color[3] * a));
    }
  }
}

function fillRoundedRect(pixels, size, x0, y0, w, h, r, color) {
  for (let y = Math.floor(y0); y < Math.ceil(y0 + h); y++) {
    for (let x = Math.floor(x0); x < Math.ceil(x0 + w); x++) {
      const cx = Math.min(Math.max(x + 0.5, x0 + r), x0 + w - r);
      const cy = Math.min(Math.max(y + 0.5, y0 + r), y0 + h - r);
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      let a = 1;
      if (d > r) a = Math.max(0, 1 - (d - r) / 1.2);
      if (a <= 0) continue;
      setPixel(pixels, size, x, y, color[0], color[1], color[2], Math.round(color[3] * a));
    }
  }
}

function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const ink = [16, 17, 19, 255];
  const accent = [10, 132, 255, 255];
  const headR = size * 0.3;
  const cx = size * 0.5;
  const cy = size * 0.4;
  const tailW = Math.max(2, Math.round(size * 0.07));
  const tailX = cx - tailW / 2;
  const tailTop = cy + headR * 0.4;
  const tailBot = size - size * 0.1;
  fillRoundedRect(pixels, size, tailX, tailTop, tailW, tailBot - tailTop, tailW / 2, ink);
  fillCircle(pixels, size, cx, cy, headR, ink);
  fillCircle(pixels, size, cx, cy, headR * 0.42, accent);
  return encodePNG(size, size, pixels);
}

for (const s of [16, 32, 48, 128]) {
  const buf = drawIcon(s);
  writeFileSync(resolve(OUT_DIR, `icon-${s}.png`), buf);
  console.log(`wrote icon-${s}.png (${buf.length} bytes)`);
}
