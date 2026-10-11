// Voegt data/<winkel>.json samen, geeft elke aanbieding een oordeel en bouwt build/ (pagina + pwa + json).
// Gebruik: node vergelijk.mjs [--fixtures]   (--fixtures leest uit fixtures/ i.p.v. data/)
import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, existsSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { familieVan, familieNaam, STUK_FAMILIES, STUK_CATEGORIE_FAMILIES } from './familie.mjs';

export const DREMPEL = 0.05; // binnen 5% van het goedkoopste = goed
export const MIN_KANDIDATEN = 3; // zo veel vergelijkbare producten (zonder de aanbieding zelf) nodig voor een echte vergelijking

// Plausibiliteitsgrens: een kandidaat-alternatief dat per eenheid minder dan 20% van de aanbieding kost is geen
// vergelijkbaar product maar een verkeerd ingedeeld of verkeerd gemeten ding (vanillestokje vs keukenzout 'bespaar
// EUR 1249 per kg', diffuser vs spray). Echte alternatieven zijn zelden meer dan 5x goedkoper: een gemiste besparing
// is goedkoper dan een absurde.
export const MIN_VERHOUDING = 0.2;
// Voor de grove familie-terugval geldt een strengere grens: tussen families zitten producten die niets met elkaar te maken
// hebben (blauwe bessen vs appeltjes, pesto vs lasagne) en die zaten precies op de 0,2-grens.
export const MIN_VERHOUDING_FAMILIE = 0.5;
const BRON = Symbol('bron'); // verwijzing naar het oorspronkelijke product; Symbol-sleutels komen niet in de JSON
// Is kandidaat c de aanbieding p zelf? Op objectidentiteit, of (als er een id is) op winkel + id (de referentielijst kan hem ook bevatten).
const isZelf = (c, winkel, p) => c[BRON] === p || (p.id != null && c.winkel === winkel && c.id === p.id);
// Catch-all categorie: zegt niets over vergelijkbaarheid, doet alleen mee via de familie-terugval.
const isOverig = (c) => { const t = String(c ?? '').trim().toLowerCase(); return t === '' || t === 'overig'; };

const geldig = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;
// Vandaag als jjjj-mm-dd in Nederlandse tijd (geldigTot is een datum zonder tijd).
export const vandaagNL = () => new Date().toLocaleDateString('sv', { timeZone: 'Europe/Amsterdam' });
// Een aanbieding telt niet meer mee als hij verlopen is (geldigTot voor vandaag) of geen aanbieding is (prijs >= normaalprijs).
const verlopen = (p, vandaag) => typeof p.geldigTot === 'string' && p.geldigTot < vandaag;
const geenKorting = (p) => geldig(p.normaalPrijs) && p.prijs >= p.normaalPrijs;
const sleutel = (p) => `${String(p.categorie ?? '').trim().toLowerCase()}|${p.eenheid}`;
const stukCategorie = (fam) => !!fam && (STUK_FAMILIES.has(fam) || STUK_CATEGORIE_FAMILIES.has(fam));
const rond = (n) => Math.round(n * 100) / 100;
// Merk als vergelijkingssleutel: alle huismerken van een winkel (AH, AH Biologisch, AH Liefde & Passie, ...) zijn een merk.
const merkVan = (c, winkel) => (c.huismerk ? 'huismerk:' + winkel : c.merk ? String(c.merk).trim().toLowerCase() : '');

// Een vergelijking telt pas als er genoeg kandidaten zijn en minstens een ervan een andere winkel of een ander merk
// heeft dan de aanbieding zelf: anders is "goedkoopst" alleen "niet duurder dan mijn eigen niche".
function genoeg(p, winkel, lijst) {
  let n = 0, anders = false;
  const m = merkVan(p, winkel);
  for (const c of lijst) {
    if (isZelf(c, winkel, p)) continue;
    n++;
    if (c.winkel !== winkel || merkVan(c, c.winkel) !== m) anders = true;
  }
  return n >= MIN_KANDIDATEN && anders;
}

// winkels: [{winkel, naam, aanbiedingen:[], referentie:[]}] -> aanbiedingen met winkel, oordeel, alternatief, besparing,
// familie en vergelijking ('categorie' | 'familie' | null = geen goede vergelijking).
// Vergelijkt eerst binnen de (smalle) winkelcategorie, en valt anders terug op de grove productfamilie (familie.mjs),
// altijd op dezelfde eenheid. 'stuk' wordt alleen vergeleken waar dat zinvol is: over de hele familie voor STUK_FAMILIES, alleen binnen dezelfde categorie voor STUK_CATEGORIE_FAMILIES.
export function beoordeel(winkels, vandaag = vandaagNL()) {
  const perCat = new Map(); // categorie|eenheid -> kandidaten, goedkoopste eerst
  const perFam = new Map(); // familie|eenheid -> kandidaten, goedkoopste eerst
  const voeg = (map, k, c) => { if (!map.has(k)) map.set(k, []); map.get(k).push(c); };
  for (const w of winkels) {
    for (const [lijst, aanbieding] of [[w.aanbiedingen, true], [w.referentie, false]]) {
      for (const p of lijst ?? []) {
        if (aanbieding && p && (verlopen(p, vandaag) || geenKorting(p))) continue;
        if (!p || !p.eenheid || !geldig(p.prijsPerEenheid)) continue;
        const fam = familieVan(p);
        if (!p.categorie && !fam) continue;
        const c = { winkel: w.winkel, id: p.id, titel: p.titel, merk: p.merk ?? null, huismerk: !!p.huismerk, online: !!p.online,
          prijsPerEenheid: p.prijsPerEenheid, eenheid: p.eenheid, aanbieding, [BRON]: p };
        if (!isOverig(p.categorie) && (p.eenheid !== 'stuk' || stukCategorie(fam))) voeg(perCat, sleutel(p), c);
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
      if (!p || typeof p.titel !== 'string' || !geldig(p.prijs) || verlopen(p, vandaag) || geenKorting(p)) continue;
      const fam = familieVan(p);
      const basis = { ...p, winkel: w.winkel, oordeel: 'onbekend', alternatief: null, besparing: 0, familie: familieNaam(fam), vergelijking: null };
      if (p.eenheid && geldig(p.prijsPerEenheid) && (p.eenheid !== 'stuk' || stukCategorie(fam))) {
        const plausibel = (l, grens) => (l ? l.filter((c) => c.prijsPerEenheid >= p.prijsPerEenheid * grens) : null);
        let lijst = isOverig(p.categorie) ? null : plausibel(perCat.get(sleutel(p)), MIN_VERHOUDING), soort = 'categorie';
        if (!lijst || !genoeg(p, w.winkel, lijst)) { lijst = fam ? plausibel(perFam.get(fam + '|' + p.eenheid), MIN_VERHOUDING_FAMILIE) : null; soort = 'familie'; }
        if (lijst && genoeg(p, w.winkel, lijst)) {
          const alt = lijst.find((c) => !isZelf(c, w.winkel, p));
          basis.vergelijking = soort;
          if (p.prijsPerEenheid <= alt.prijsPerEenheid) basis.oordeel = 'beste'; // goedkoopste (of gelijk) van de vergelijking
          else if (p.prijsPerEenheid <= alt.prijsPerEenheid * (1 + DREMPEL)) basis.oordeel = 'goed';
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

// Eenheid als kg / l / stuk / null (contract). Spelling (KG, ltr, liter, stuks) wordt rechtgezet, al het andere wordt null.
const EENHEDEN = { kg: 'kg', l: 'l', ltr: 'l', liter: 'l', stuk: 'stuk', stuks: 'stuk' };
export const normEenheid = (e) => (typeof e === 'string' ? EENHEDEN[e.trim().toLowerCase()] ?? null : null);
function normaliseerEenheden(lijst) {
  let onbekend = 0;
  const uit = lijst.map((p) => {
    if (!p || typeof p !== 'object' || p.eenheid == null) return p;
    const e = normEenheid(p.eenheid);
    if (e === null) onbekend++;
    return e === p.eenheid ? p : { ...p, eenheid: e };
  });
  return { uit, onbekend };
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
      const ne = normaliseerEenheden(j.aanbiedingen), nr = normaliseerEenheden(Array.isArray(j.referentie) ? j.referentie : []);
      winkels.push({ winkel: id, naam: j.naam ?? id, gemaakt: j.gemaakt ?? null, aanbiedingen: ne.uit, referentie: nr.uit });
      if (ne.onbekend + nr.onbekend) waarschuwingen.push(`${j.naam ?? id}: ${ne.onbekend + nr.onbekend} producten met een onbekende eenheid (alleen kg, l, stuk of leeg), zonder vergelijking`);
      if (typeof j.waarschuwing === 'string' && j.waarschuwing) waarschuwingen.push(`${j.naam ?? id}: ${j.waarschuwing}`);
      const leeftijd = j.gemaakt ? Date.now() - Date.parse(j.gemaakt) : NaN;
      if (controleerLeeftijd && !(leeftijd <= 48 * 3600e3)) waarschuwingen.push(`${j.naam ?? id}: gegevens zijn ouder dan 2 dagen of hebben geen geldige datum (gemaakt)`);
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
    for (const k of ['merk', 'categorie', 'inhoud', 'eenheid', 'normaalPrijs', 'prijsPerEenheid', 'mechanisme', 'geldigTot', 'afbeelding', 'besparing', 'online']) {
      if (a[k] !== null && a[k] !== undefined && a[k] !== 0 && a[k] !== '') u[k] = a[k];
    }
    const vn = voorNa[a.winkel];
    if (vn && u.afbeelding && u.afbeelding.startsWith(vn.voor) && u.afbeelding.endsWith(vn.na)) u.afbeelding = u.afbeelding.slice(vn.voor.length, u.afbeelding.length - vn.na.length);
    const alt = a.alternatief;
    if (alt) {
      const e = { winkel: alt.winkel, titel: alt.titel, prijsPerEenheid: alt.prijsPerEenheid };
      if (alt.huismerk) e.huismerk = true;
      if (alt.online) e.online = true;
      const k = JSON.stringify(e);
      if (!alIdx.has(k)) { alIdx.set(k, alts.length); alts.push(e); }
      u.alternatief = alIdx.get(k);
    }
    return u;
  });
  return { aanbiedingen: lijst, alternatieven: alts, afbeeldingen: voorNa };
}

// Atomair schrijven: eerst naar een tmp-bestand in dezelfde map, dan rename (op Windows en POSIX vervangt dat het doel).
function schrijfAtomair(pad, inhoud) {
  const tmp = `${pad}.${process.pid}.tmp`;
  writeFileSync(tmp, inhoud);
  renameSync(tmp, pad);
}

// Eenvoudige lock (zoals growatt/ophalen.lock): voorkomt dat twee runs elkaars build/ overschrijven; stale na 10 min.
export const LOCK_STALE_MS = 10 * 60e3;
export function pakLock(pad, nu = Date.now()) {
  mkdirSync(dirname(pad), { recursive: true });
  for (let poging = 0; poging < 2; poging++) {
    try { writeFileSync(pad, String(process.pid), { flag: 'wx' }); return true; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let oud = false;
      try { oud = nu - statSync(pad).mtimeMs > LOCK_STALE_MS; } catch { continue; }
      if (!oud) return false;
      try { unlinkSync(pad); } catch {}
    }
  }
  return false;
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
  const LOCK = 'data/vergelijk.lock';
  if (!pakLock(LOCK)) { console.log('vergelijk.mjs: een andere run is bezig (data/vergelijk.lock), overgeslagen'); process.exitCode = 2; return; }
  try {
    schrijfAtomair('data/aanbiedingen.json', JSON.stringify(uit, null, 1));
    const json = JSON.stringify({ gemaakt, fixtures, fout, winkels: uit.winkels, ...inkort(aanbiedingen) });
    // Eerst het paar json + pagina, dan de rest, en de .gz-bestanden als laatste: een .gz verwijst dan nooit naar nieuwere
    // inhoud dan het bestand ernaast, en serve.mjs leest nooit een half geschreven bestand.
    schrijfAtomair('build/aanbiedingen.json', json);
    copyFileSync('pagina.html', 'build/index.html.tmp'); renameSync('build/index.html.tmp', 'build/index.html');
    if (existsSync('pwa')) for (const f of readdirSync('pwa')) if (/\.(webmanifest|js|png|svg)$/.test(f) && !f.startsWith('maak')) {
      copyFileSync(join('pwa', f), join('build', f + '.tmp')); renameSync(join('build', f + '.tmp'), join('build', f));
    }
    // Vooraf gecomprimeerd (serve.mjs levert .gz bij Accept-Encoding: gzip).
    for (const f of ['aanbiedingen.json', 'index.html', 'sw.js', 'manifest.webmanifest']) {
      try { schrijfAtomair(join('build', f + '.gz'), gzipSync(readFileSync(join('build', f)), { level: 9 })); } catch (e) {
        // Een oude .gz zou aan elke browser (die gzip meestuurt) verouderde inhoud blijven leveren: weg ermee, serve.mjs valt terug op het bestand zelf.
        console.error(`gzip van ${f} mislukt (${e.message}), oude .gz verwijderd`);
        try { unlinkSync(join('build', f + '.gz')); } catch {}
      }
    }
  } finally { try { unlinkSync(LOCK); } catch {} }
  const tel = {};
  for (const a of aanbiedingen) tel[a.oordeel] = (tel[a.oordeel] ?? 0) + 1;
  console.log(`${aanbiedingen.length} aanbiedingen uit ${winkels.length} winkels`, tel);
  if (fout) console.log('Waarschuwing:\n' + fout);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
