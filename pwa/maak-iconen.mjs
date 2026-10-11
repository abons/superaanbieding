// Tekent icon-192.png en icon-512.png zonder libs (procentteken op groen). Eenmalig: node pwa/maak-iconen.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const crcTabel = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTabel[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const blok = (type, data) => {
  const t = Buffer.from(type), l = Buffer.alloc(4), c = Buffer.alloc(4);
  l.writeUInt32BE(data.length); c.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([l, t, data, c]);
};
const GROEN = [31, 122, 77], WIT = [255, 255, 255];
// Pixel in eenheidscoordinaten (-0.5..0.5): wit schijf met groen procentteken, rest groen (maskable: volle rand).
const kleur = (x, y) => {
  if (Math.hypot(x, y) > 0.3) return GROEN;
  const d = (cx, cy) => Math.hypot(x - cx, y - cy);
  if (d(-0.1, -0.1) < 0.065 || d(0.1, 0.1) < 0.065) return GROEN;
  // lijn van (0.11,-0.15) naar (-0.11,0.15)
  const ax = 0.11, ay = -0.15, bx = -0.11, by = 0.15, vx = bx - ax, vy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
  if (Math.hypot(x - (ax + t * vx), y - (ay + t * vy)) < 0.024) return GROEN;
  return WIT;
};
const maak = (n) => {
  const raw = Buffer.alloc((n * 3 + 1) * n);
  for (let j = 0; j < n; j++) {
    raw[j * (n * 3 + 1)] = 0;
    for (let i = 0; i < n; i++) {
      const s = [0, 0, 0];
      for (const [ox, oy] of [[.25, .25], [.75, .25], [.25, .75], [.75, .75]]) {
        const k = kleur((i + ox) / n - 0.5, (j + oy) / n - 0.5);
        for (let q = 0; q < 3; q++) s[q] += k[q] / 4;
      }
      for (let q = 0; q < 3; q++) raw[j * (n * 3 + 1) + 1 + i * 3 + q] = Math.round(s[q]);
    }
  }
  const kop = Buffer.alloc(13);
  kop.writeUInt32BE(n, 0); kop.writeUInt32BE(n, 4); kop[8] = 8; kop[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), blok('IHDR', kop), blok('IDAT', deflateSync(raw)), blok('IEND', Buffer.alloc(0))]);
};
const map = dirname(fileURLToPath(import.meta.url));
for (const n of [192, 512]) writeFileSync(join(map, `icon-${n}.png`), maak(n));
console.log('icon-192.png en icon-512.png geschreven');
