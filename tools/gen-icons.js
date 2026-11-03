/* Gera os ícones PNG do FlyDrone sem dependências externas.
   Uso: node tools/gen-icons.js
*/
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'icons');

/* ---------- PNG ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
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
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filtro none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- Geometria ---------- */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;

function insideCircle(x, y, cx, cy, r) {
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function insideRoundRect(x, y, cx, cy, w, h, r) {
  const dx = Math.abs(x - cx) - (w / 2 - r);
  const dy = Math.abs(y - cy) - (h / 2 - r);
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(dx, dy), 0) - r <= 0;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const t = clamp((wx * vx + wy * vy) / (vx * vx + vy * vy), 0, 1);
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

const ROTORS = [
  [0.205, 0.285],
  [0.795, 0.285],
  [0.205, 0.755],
  [0.795, 0.755],
];

function glyphAt(x, y) {
  /* Retorna 'white' | 'green' | null */
  const body = insideRoundRect(x, y, 0.5, 0.52, 0.30, 0.155, 0.07);
  if (body) return 'white';
  if (insideCircle(x, y, 0.5, 0.655, 0.045)) return 'green';

  for (const [cx, cy] of ROTORS) {
    if (distToSegment(x, y, 0.5, 0.52, cx, cy) < 0.026) return 'white';
    const d = Math.hypot(x - cx, y - cy);
    if (d <= 0.125 && d >= 0.082) return 'white';
    if (d < 0.030) return 'white';
  }

  return null;
}

/* ---------- Render ---------- */
function renderIcon(size, { maskable = false } = {}) {
  const SS = 3; // supersampling
  const buf = Buffer.alloc(size * size * 4);
  const radius = maskable ? 0 : 0.225;
  const scale = maskable ? 0.60 : 0.84;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (px + (sx + 0.5) / SS) / size;
          const v = (py + (sy + 0.5) / SS) / size;

          const inBg = maskable
            ? true
            : insideRoundRect(u, v, 0.5, 0.5, 1, 1, radius);

          if (!inBg) continue;

          /* fundo: gradiente + brilho */
          let br = mix(16, 5, v);
          let bg = mix(36, 8, v);
          let bb = mix(61, 20, v);

          const glow = Math.max(0, 1 - Math.hypot(u - 0.3, v - 0.12) / 0.75);
          br = mix(br, 34, glow * 0.55);
          bg = mix(bg, 197, glow * 0.35);
          bb = mix(bb, 94, glow * 0.30);

          /* glifo */
          const gx = (u - 0.5) / scale + 0.5;
          const gy = (v - 0.5) / scale + 0.5;
          const shape = glyphAt(gx, gy);

          if (shape === 'white') {
            br = mix(br, 236, 0.95);
            bg = mix(bg, 246, 0.95);
            bb = mix(bb, 255, 0.95);
          } else if (shape === 'green') {
            br = mix(br, 34, 0.95);
            bg = mix(bg, 197, 0.95);
            bb = mix(bb, 94, 0.95);
          }

          r += br;
          g += bg;
          b += bb;
          a += 255;
        }
      }

      const n = SS * SS;
      const idx = (py * size + px) * 4;
      if (a === 0) {
        buf[idx] = 0; buf[idx + 1] = 0; buf[idx + 2] = 0; buf[idx + 3] = 0;
      } else {
        const cov = a / (n * 255);
        buf[idx] = Math.round(r / n);
        buf[idx + 1] = Math.round(g / n);
        buf[idx + 2] = Math.round(b / n);
        buf[idx + 3] = Math.round(255 * cov);
      }
    }
  }

  return encodePNG(size, size, buf);
}

/* ---------- Saída ---------- */
fs.mkdirSync(OUT, { recursive: true });

const jobs = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, { maskable: true }],
];

for (const [name, size, opts] of jobs) {
  const png = renderIcon(size, opts);
  fs.writeFileSync(path.join(OUT, name), png);
  console.log(`  ✓ icons/${name} (${size}×${size}, ${(png.length / 1024).toFixed(1)} KB)`);
}

console.log('\nÍcones gerados com sucesso.');
