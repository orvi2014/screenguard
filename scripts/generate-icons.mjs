/**
 * Generates the ScreenGuard shield PNG icons with zero dependencies.
 * Rasterises a shield + check mark into RGBA pixels and encodes PNG by hand
 * (zlib is built into Node), so the repo stays dependency-free for assets.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public/icons');
const SIZES = [16, 32, 48, 128];

/* ---------------------------------------------------------------- PNG ---- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour + alpha
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------- shapes ---- */
/** u in [-1,1] across the shield, v in [0,1] top→tip. */
function insideShield(u, v) {
  if (v < 0 || v > 1) return false;
  let w;
  if (v <= 0.55) w = 1;
  else {
    const t = (v - 0.55) / 0.45;
    w = Math.pow(Math.cos((t * Math.PI) / 2), 0.62);
  }
  const r = 0.2; // rounded top corners
  if (v < r) w = Math.min(w, 1 - r + Math.sqrt(Math.max(0, r * r - (r - v) * (r - v))));
  return Math.abs(u) <= w;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const CHECK = [
  [-0.40, 0.50, -0.10, 0.71],
  [-0.10, 0.71, 0.42, 0.26],
];

function insideCheck(u, v, halfWidth) {
  for (const [ax, ay, bx, by] of CHECK) {
    if (distToSegment(u, v, ax, ay, bx, by) <= halfWidth) return true;
  }
  return false;
}

const FROM = [92, 106, 255];  // #5C6AFF
const TO = [139, 92, 246];    // #8B5CF6

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const ss = 4; // supersampling factor
  const pad = size <= 16 ? 0.04 : 0.07;
  const checkWidth = size <= 16 ? 0.115 : 0.095;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const fx = (x + (sx + 0.5) / ss) / size;
          const fy = (y + (sy + 0.5) / ss) / size;
          const u = (fx - 0.5) / (0.5 - pad);
          const v = (fy - pad) / (1 - 2 * pad);
          if (!insideShield(u, v)) continue;
          let cr, cg, cb;
          if (insideCheck(u, v, checkWidth)) {
            cr = cg = cb = 255;
          } else {
            const t = Math.min(1, Math.max(0, ((u + 1) / 2) * 0.35 + v * 0.65));
            cr = FROM[0] + (TO[0] - FROM[0]) * t;
            cg = FROM[1] + (TO[1] - FROM[1]) * t;
            cb = FROM[2] + (TO[2] - FROM[2]) * t;
          }
          r += cr; g += cg; b += cb; a += 255;
        }
      }
      const n = ss * ss;
      const i = (y * size + x) * 4;
      if (a > 0) {
        const cov = a / n / 255;
        px[i] = Math.round(r / (a / 255));
        px[i + 1] = Math.round(g / (a / 255));
        px[i + 2] = Math.round(b / (a / 255));
        px[i + 3] = Math.round(cov * 255);
      }
    }
  }
  return encodePng(size, size, px);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  writeFileSync(resolve(OUT_DIR, `icon${size}.png`), render(size));
}
console.log(`✓ icons written to public/icons (${SIZES.join(', ')})`);
