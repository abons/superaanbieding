// Rendert de spreads van boons-folder.mjs (jpg-achtergrond + svg-tekstlaag) tot één png per spread, om te lezen bij het invullen van
// invoer/boons-w<week>.json. Gebruik: node boons-render.mjs <map van boons-folder.mjs> [<uitmap>]  (uitmap standaard: dezelfde map)
// Chrome: $CHROME, anders google-chrome / chromium op PATH. Wordt gebruikt door .github/workflows/boons-folder.yml.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Breedte en hoogte uit de SOF-marker van een jpg.
export function jpgMaat(buf) {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { hoogte: buf.readUInt16BE(i + 5), breedte: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error('geen SOF-marker in jpg');
}

function chrome() {
  if (process.env.CHROME) return process.env.CHROME;
  for (const c of ['google-chrome', 'chromium', 'chromium-browser']) {
    try { execFileSync('which', [c], { stdio: 'ignore' }); return c; } catch { /* volgende */ }
  }
  throw new Error('geen Chrome gevonden (zet CHROME)');
}

function main() {
  const map = process.argv[2];
  if (!map) throw new Error('gebruik: node boons-render.mjs <map> [<uitmap>]');
  const uit = path.resolve(process.argv[3] || map);
  fs.mkdirSync(uit, { recursive: true });
  const bin = chrome();
  const spreads = fs.readdirSync(map).filter((n) => /^spread\d+\.html$/.test(n)).sort();
  if (!spreads.length) throw new Error(`geen spreadNN.html in ${map}`);
  for (const n of spreads) {
    const ss = n.match(/\d+/)[0];
    const { breedte, hoogte } = jpgMaat(fs.readFileSync(path.join(map, `spread${ss}.jpg`)));
    // spreadSS.html toont de jpg op 2050 px hoog; breedte naar verhouding.
    const b = Math.round(breedte * 2050 / hoogte);
    const png = path.join(uit, `spread${ss}.png`);
    execFileSync(bin, ['--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', `--window-size=${b},2050`,
      `--screenshot=${png}`, 'file://' + path.resolve(map, n)], { stdio: 'ignore', timeout: 60000 });
    if (!fs.existsSync(png)) throw new Error(`geen screenshot voor ${n}`);
    console.log(`  ${n} -> ${path.basename(png)} (${b}x2050)`);
  }
}

try { main(); } catch (e) { console.error('boons-render.mjs mislukt: ' + e.message); process.exit(1); }
