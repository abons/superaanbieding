// Voegt data/<winkel>.json samen, geeft elke aanbieding een oordeel en bouwt build/ (pagina + pwa + json).
// Gebruik: node vergelijk.mjs [--fixtures]   (--fixtures leest uit fixtures/ i.p.v. data/)
import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DREMPEL = 0.05; // binnen 5% van het goedkoopste = goed

const geldig = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;
const sleutel = (p) => `${String(p.categorie ?? '').trim().toLowerCase()}|${p.eenheid}`;
const rond = (n) => Math.round(n * 100) / 100;

// winkels: [{winkel, naam, aanbiedingen:[], referentie:[]}] -> aanbiedingen met winkel, oordeel, alternatief, besparing
export function beoordeel(winkels) {
  const index = new Map(); // categorie|eenheid -> kandidaten, goedkoopste eerst
  for (const w of winkels) {
    for (const [lijst, aanbieding] of [[w.aanbiedingen, true], [w.referentie, false]]) {
      for (const p of lijst ?? []) {
        if (!p || !p.categorie || !p.eenheid || !geldig(p.prijsPerEenheid)) continue;
        const k = sleutel(p);
        if (!index.has(k)) index.set(k, []);
        index.get(k).push({ winkel: w.winkel, id: p.id, titel: p.titel, merk: p.merk ?? null, huismerk: !!p.huismerk,
          prijsPerEenheid: p.prijsPerEenheid, eenheid: p.eenheid, aanbieding });
      }
    }
  }
  for (const l of index.values()) l.sort((a, b) => a.prijsPerEenheid - b.prijsPerEenheid || (b.huismerk - a.huismerk));

  const uit = [];
  for (const w of winkels) {
    for (const p of w.aanbiedingen ?? []) {
      if (!p || typeof p.titel !== 'string' || !geldig(p.prijs)) continue;
      const basis = { ...p, winkel: w.winkel, oordeel: 'onbekend', alternatief: null, besparing: 0 };
      if (p.categorie && p.eenheid && geldig(p.prijsPerEenheid)) {
        const alt = (index.get(sleutel(p)) ?? []).find((c) => !(c.winkel === w.winkel && c.id === p.id));
        if (alt) {
          if (p.prijsPerEenheid <= alt.prijsPerEenheid * (1 + DREMPEL)) basis.oordeel = 'goed';
          else {
            basis.oordeel = alt.huismerk ? 'huismerk-goedkoper' : 'merk-goedkoper';
            basis.alternatief = alt;
            basis.besparing = rond(p.prijsPerEenheid - alt.prijsPerEenheid);
          }
        }
      }
      uit.push(basis);
    }
  }
  return uit;
}

// Leest alle winkelbestanden in `dir`; kapotte bestanden worden overgeslagen en komen als waarschuwing terug.
export function leesWinkels(dir, controleerLeeftijd = true) {
  const winkels = [], waarschuwingen = [];
  let namen = [];
  try { namen = readdirSync(dir).filter((n) => n.endsWith('.json') && n !== 'aanbiedingen.json' && !n.endsWith('-referentie.json')).sort(); } catch {}
  if (!namen.length) waarschuwingen.push(`Geen winkelgegevens gevonden in ${dir}/`);
  for (const n of namen) {
    try {
      const j = JSON.parse(readFileSync(join(dir, n), 'utf8'));
      if (!j || !Array.isArray(j.aanbiedingen)) throw new Error('veld "aanbiedingen" ontbreekt');
      const id = String(j.winkel ?? n.slice(0, -5));
      winkels.push({ winkel: id, naam: j.naam ?? id, gemaakt: j.gemaakt ?? null, aanbiedingen: j.aanbiedingen, referentie: Array.isArray(j.referentie) ? j.referentie : [] });
      const leeftijd = j.gemaakt ? Date.now() - Date.parse(j.gemaakt) : NaN;
      if (controleerLeeftijd && leeftijd > 48 * 3600e3) waarschuwingen.push(`${j.naam ?? id}: gegevens zijn ouder dan 2 dagen`);
    } catch (e) { waarschuwingen.push(`${n} overgeslagen: ${e.message}`); }
  }
  return { winkels, waarschuwingen };
}

const veilig = (s) => s.replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16));

function main() {
  process.chdir(dirname(fileURLToPath(import.meta.url)));
  const fixtures = process.argv.includes('--fixtures');
  const { winkels, waarschuwingen } = leesWinkels(fixtures ? "fixtures" : "data", !fixtures);
  const aanbiedingen = beoordeel(winkels);
  const gemaakt = new Date().toISOString();
  const uit = { gemaakt, fixtures, winkels: winkels.map((w) => ({ id: w.winkel, naam: w.naam })), aanbiedingen };
  const json = JSON.stringify(uit);

  let fout = '';
  if (!fixtures) { try { fout = readFileSync('data/laatste-fout.txt', 'utf8').trim(); } catch {} }
  fout = [fout, ...waarschuwingen].filter(Boolean).join('\n');

  mkdirSync('data', { recursive: true });
  mkdirSync('build', { recursive: true });
  writeFileSync('data/aanbiedingen.json', JSON.stringify(uit, null, 1));
  writeFileSync('build/aanbiedingen.json', json);
  const html = readFileSync('pagina.html', 'utf8')
    .replace('__DATA__', () => veilig(json))
    .replace('__GEMAAKT__', () => gemaakt)
    .replace('__FOUT__', () => veilig(JSON.stringify(fout)));
  writeFileSync('build/index.html', html);
  if (existsSync('pwa')) for (const f of readdirSync('pwa')) if (/\.(webmanifest|js|png|svg)$/.test(f) && !f.startsWith('maak')) copyFileSync(join('pwa', f), join('build', f));
  const tel = {};
  for (const a of aanbiedingen) tel[a.oordeel] = (tel[a.oordeel] ?? 0) + 1;
  console.log(`${aanbiedingen.length} aanbiedingen uit ${winkels.length} winkels`, tel);
  if (fout) console.log('Waarschuwing:\n' + fout);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
