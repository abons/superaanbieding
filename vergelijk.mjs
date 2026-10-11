// Voegt data/<winkel>.json samen, geeft elke aanbieding een oordeel en bouwt build/ (pagina + pwa + json).
// Gebruik: node vergelijk.mjs [--fixtures]   (--fixtures leest uit fixtures/ i.p.v. data/)
import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { familieVan, familieNaam, STUK_FAMILIES } from './familie.mjs';

export const DREMPEL = 0.05; // binnen 5% van het goedkoopste = goed
export const MIN_KANDIDATEN = 3; // zo veel vergelijkbare producten (zonder de aanbieding zelf) nodig voor een echte vergelijking

const geldig = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;
const sleutel = (p) => `${String(p.categorie ?? '').trim().toLowerCase()}|${p.eenheid}`;
const rond = (n) => Math.round(n * 100) / 100;
// Merk als vergelijkingssleutel: alle huismerken van een winkel (AH, AH Biologisch, AH Liefde & Passie, ...) zijn een merk.
const merkVan = (c, winkel) => (c.huismerk ? 'huismerk:' + winkel : c.merk ? String(c.merk).trim().toLowerCase() : '');

// Een vergelijking telt pas als er genoeg kandidaten zijn en minstens een ervan een andere winkel of een ander merk
// heeft dan de aanbieding zelf: anders is "goedkoopst" alleen "niet duurder dan mijn eigen niche".
function genoeg(p, winkel, lijst) {
  let n = 0, anders = false;
  const m = merkVan(p, winkel);
  for (const c of lijst) {
    if (c.winkel === winkel && c.id === p.id) continue;
    n++;
    if (c.winkel !== winkel || merkVan(c, c.winkel) !== m) anders = true;
  }
  return n >= MIN_KANDIDATEN && anders;
}

// winkels: [{winkel, naam, aanbiedingen:[], referentie:[]}] -> aanbiedingen met winkel, oordeel, alternatief, besparing,
// familie en vergelijking ('categorie' | 'familie' | null = geen goede vergelijking).
// Vergelijkt eerst binnen de (smalle) winkelcategorie, en valt anders terug op de grove productfamilie (familie.mjs),
// altijd op dezelfde eenheid. 'stuk' wordt alleen vergeleken binnen families waar dat zinvol is (STUK_FAMILIES).
export function beoordeel(winkels) {
  const perCat = new Map(); // categorie|eenheid -> kandidaten, goedkoopste eerst
  const perFam = new Map(); // familie|eenheid -> kandidaten, goedkoopste eerst
  const voeg = (map, k, c) => { if (!map.has(k)) map.set(k, []); map.get(k).push(c); };
  for (const w of winkels) {
    for (const [lijst, aanbieding] of [[w.aanbiedingen, true], [w.referentie, false]]) {
      for (const p of lijst ?? []) {
        if (!p || !p.eenheid || !geldig(p.prijsPerEenheid)) continue;
        const fam = familieVan(p);
        if (!p.categorie && !fam) continue;
        const c = { winkel: w.winkel, id: p.id, titel: p.titel, merk: p.merk ?? null, huismerk: !!p.huismerk,
          prijsPerEenheid: p.prijsPerEenheid, eenheid: p.eenheid, aanbieding };
        if (p.categorie && (p.eenheid !== 'stuk' || (fam && STUK_FAMILIES.has(fam)))) voeg(perCat, sleutel(p), c);
        if (fam && (p.eenheid !== 'stuk' || STUK_FAMILIES.has(fam))) voeg(perFam, fam + '|' + p.eenheid, c);
      }
    }
  }
  const sorteer = (a, b) => a.prijsPerEenheid - b.prijsPerEenheid || (b.huismerk - a.huismerk);
  for (const l of perCat.values()) l.sort(sorteer);
  for (const l of perFam.values()) l.sort(sorteer);

  const uit = [];
  for (const w of winkels) {
    for (const p of w.aanbiedingen ?? []) {
      if (!p || typeof p.titel !== 'string' || !geldig(p.prijs)) continue;
      const fam = familieVan(p);
      const basis = { ...p, winkel: w.winkel, oordeel: 'onbekend', alternatief: null, besparing: 0, familie: familieNaam(fam), vergelijking: null };
      if (p.eenheid && geldig(p.prijsPerEenheid) && (p.eenheid !== 'stuk' || (fam && STUK_FAMILIES.has(fam)))) {
        let lijst = p.categorie ? perCat.get(sleutel(p)) : null, soort = 'categorie';
        if (!lijst || !genoeg(p, w.winkel, lijst)) { lijst = fam ? perFam.get(fam + '|' + p.eenheid) : null; soort = 'familie'; }
        if (lijst && genoeg(p, w.winkel, lijst)) {
          const alt = lijst.find((c) => !(c.winkel === w.winkel && c.id === p.id));
          basis.vergelijking = soort;
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

// Compacte vorm voor de pagina (build/aanbiedingen.json): alleen wat de pagina gebruikt, lege/nul/false-velden weggelaten,
// alternatieven in een gedeelde tabel, afbeelding-urls zonder het vaste begin/einde per winkel.
// Zie docs/contract.md. De volledige vorm blijft in data/aanbiedingen.json.
export function inkort(aanbiedingen) {
  const alts = [], alIdx = new Map();
  const voorNa = {}; // per winkel: gemeenschappelijk begin (t/m laatste '/') en einde (vanaf '?') van de afbeeldings-urls
  const perWinkel = {};
  for (const a of aanbiedingen) if (typeof a.afbeelding === 'string' && a.afbeelding.startsWith('https://')) (perWinkel[a.winkel] ??= []).push(a.afbeelding);
  for (const [w, urls] of Object.entries(perWinkel)) {
    if (urls.length < 5) continue;
    let voor = urls[0];
    for (const u of urls) { let i = 0; while (i < voor.length && voor[i] === u[i]) i++; voor = voor.slice(0, i); }
    voor = voor.slice(0, voor.lastIndexOf('/') + 1);
    const na0 = urls[0].includes('?') ? urls[0].slice(urls[0].indexOf('?')) : '';
    const na = urls.every((u) => u.endsWith(na0)) ? na0 : '';
    if (voor || na) voorNa[w] = { voor, na };
  }
  const lijst = aanbiedingen.map((a) => {
    const u = { winkel: a.winkel, titel: a.titel, prijs: a.prijs, oordeel: a.oordeel, familie: a.familie || 'Overig' };
    for (const k of ['merk', 'categorie', 'inhoud', 'eenheid', 'normaalPrijs', 'prijsPerEenheid', 'mechanisme', 'geldigTot', 'afbeelding', 'besparing']) {
      if (a[k] !== null && a[k] !== undefined && a[k] !== 0 && a[k] !== '') u[k] = a[k];
    }
    const vn = voorNa[a.winkel];
    if (vn && u.afbeelding && u.afbeelding.startsWith(vn.voor) && u.afbeelding.endsWith(vn.na)) u.afbeelding = u.afbeelding.slice(vn.voor.length, u.afbeelding.length - vn.na.length);
    const alt = a.alternatief;
    if (alt) {
      const e = { winkel: alt.winkel, titel: alt.titel, prijsPerEenheid: alt.prijsPerEenheid };
      if (alt.huismerk) e.huismerk = true;
      const k = JSON.stringify(e);
      if (!alIdx.has(k)) { alIdx.set(k, alts.length); alts.push(e); }
      u.alternatief = alIdx.get(k);
    }
    return u;
  });
  return { aanbiedingen: lijst, alternatieven: alts, afbeeldingen: voorNa };
}

function main() {
  process.chdir(dirname(fileURLToPath(import.meta.url)));
  const fixtures = process.argv.includes('--fixtures');
  const { winkels, waarschuwingen } = leesWinkels(fixtures ? "fixtures" : "data", !fixtures);
  const aanbiedingen = beoordeel(winkels);
  const gemaakt = new Date().toISOString();
  const uit = { gemaakt, fixtures, winkels: winkels.map((w) => ({ id: w.winkel, naam: w.naam })), aanbiedingen };
  let fout = '';
  if (!fixtures) { try { fout = readFileSync('data/laatste-fout.txt', 'utf8').trim(); } catch {} }
  fout = [fout, ...waarschuwingen].filter(Boolean).join('\n');

  mkdirSync('data', { recursive: true });
  mkdirSync('build', { recursive: true });
  writeFileSync('data/aanbiedingen.json', JSON.stringify(uit, null, 1));
  const json = JSON.stringify({ gemaakt, fixtures, fout, winkels: uit.winkels, ...inkort(aanbiedingen) });
  writeFileSync('build/aanbiedingen.json', json);
  copyFileSync('pagina.html', 'build/index.html');
  if (existsSync('pwa')) for (const f of readdirSync('pwa')) if (/\.(webmanifest|js|png|svg)$/.test(f) && !f.startsWith('maak')) copyFileSync(join('pwa', f), join('build', f));
  // Vooraf gecomprimeerd (serve.mjs levert .gz bij Accept-Encoding: gzip).
  for (const f of ['index.html', 'aanbiedingen.json', 'sw.js', 'manifest.webmanifest']) {
    try { writeFileSync(join('build', f + '.gz'), gzipSync(readFileSync(join('build', f)), { level: 9 })); } catch {}
  }
  const tel = {};
  for (const a of aanbiedingen) tel[a.oordeel] = (tel[a.oordeel] ?? 0) + 1;
  console.log(`${aanbiedingen.length} aanbiedingen uit ${winkels.length} winkels`, tel);
  if (fout) console.log('Waarschuwing:\n' + fout);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
