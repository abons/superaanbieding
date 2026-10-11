// Albert Heijn -> data/ah.json (contract: docs/contract.md)
// Anonieme app-token + mobile-services product search. Geen dependencies.
//
// Aanpak (ontdekt 2026-10-11):
//  - `filters=bonus%3DBonus` (dus filters=bonus=Bonus, url-encoded) geeft ALLEEN bonusproducten; size mag tot 1000,
//    maar zoekresultaten stoppen na 3000 (page 3 bij size 1000 geeft 400).
//  - `taxonomyId=<id>` beperkt tot een categorie; het facet `taxonomy` in het antwoord geeft de kinderen met id + naam.
//  - Daarom: bonus per categorie ophalen (root + elke facet-categorie, plus 3 sorteringen op root), referentie =
//    niet-bonus producten uit de categorieen (subCategory) waar een aanbieding in zit.
//  - AH Online-acties (promotionType AHONLINE, virtuele pakketten, bonusEndDate 2999) zijn geen winkelbonus: overgeslagen.
//
// Gebruik: node winkels/ah.mjs        (env MAX_REQ = maximaal aantal requests, standaard 400; PAUZE = ms, standaard 220)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASIS = 'https://api.ah.nl';
const UA = 'Appie/8.22.3';
const MAX_REQ = Number(process.env.MAX_REQ) || 400;
const PAUZE = Number(process.env.PAUZE) || 220;
const UIT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'ah.json');

let token = null;
let requests = 0;
const slaap = (ms) => new Promise((r) => setTimeout(r, ms));

async function haalToken() {
  const r = await fetch(`${BASIS}/mobile-auth/v1/auth/token/anonymous`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA, 'X-Application': 'AHWEBSHOP' },
    body: JSON.stringify({ clientId: 'appie' }),
  });
  if (!r.ok) throw new Error(`token ${r.status}`);
  token = (await r.json()).access_token;
}

class Budget extends Error {}

async function zoek(params) {
  if (requests >= MAX_REQ) throw new Budget('request-budget op');
  const qs = new URLSearchParams({ sortOn: 'RELEVANCE', ...params }).toString();
  for (let poging = 0; poging < 3; poging++) {
    if (!token) await haalToken();
    requests++;
    await slaap(PAUZE);
    const r = await fetch(`${BASIS}/mobile-services/product/search/v2?${qs}`, {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': UA, 'X-Application': 'AHWEBSHOP' },
    });
    if (r.status === 401) { token = null; continue; }
    if (r.status === 429 || r.status >= 500) { await slaap(2000 * (poging + 1)); continue; }
    if (!r.ok) throw new Error(`search ${r.status} ${qs}`);
    return r.json();
  }
  throw new Error(`search faalde: ${qs}`);
}

// ---------- parsers ----------
const getal = (s) => Number(String(s).replace(',', '.'));
const rond = (x, d = 2) => (x == null || !isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

// "8 x 0,25 l", "500 g", "ca 400 g", "4 stuks", "per stuk" -> { eenheid, hoeveelheid } (kg / l / stuk)
function parseInhoud(s) {
  if (!s) return null;
  const t = s.toLowerCase().replace(/^ca\.?\s*/, '').replace(/\s+/g, ' ').trim();
  if (/^per (stuk|pakket)$/.test(t)) return { eenheid: 'stuk', hoeveelheid: 1 };
  let m = t.match(/^(?:(\d+(?:[.,]\d+)?) ?x )?(\d+(?:[.,]\d+)?) ?(kg|g|l|cl|ml)\b/);
  if (m) {
    const n = m[1] ? getal(m[1]) : 1;
    const a = getal(m[2]);
    const f = { kg: ['kg', 1], g: ['kg', 0.001], l: ['l', 1], cl: ['l', 0.01], ml: ['l', 0.001] }[m[3]];
    return { eenheid: f[0], hoeveelheid: n * a * f[1] };
  }
  m = t.match(/^(\d+(?:[.,]\d+)?)(?: x (\d+))?[ -]?(stuks?|pack|pck|rollen|wasbeurten|tabletten|capsules)\b/);
  if (m) return { eenheid: 'stuk', hoeveelheid: getal(m[1]) * (m[2] ? Number(m[2]) : 1) };
  return null;
}

// "normale prijs per kg €5.18" / "prijs per liter €2.42" -> { eenheid, prijs }
function parseEenheidsPrijs(s) {
  const m = s && s.match(/per (kilo|kg|liter|l|stuk)\s*€\s*([\d.,]+)/i);
  if (!m) return null;
  const e = m[1].toLowerCase();
  return { eenheid: e === 'liter' || e === 'l' ? 'l' : e === 'stuk' ? 'stuk' : 'kg', prijs: getal(m[2]) };
}

// Effectieve prijs per verpakking bij de actie, uit mechanisme + normale prijs. null als onbekend.
function effectievePrijs(p) {
  const voor = p.priceBeforeBonus;
  const mech = (p.bonusMechanism || '').trim();
  if (voor != null) {
    let m;
    if ((m = mech.match(/^(\d+) ?\+ ?(\d+) gratis/i))) return voor * Number(m[1]) / (Number(m[1]) + Number(m[2]));
    if (/^2e halve prijs/i.test(mech)) return voor * 0.75;
    if (/^2e gratis/i.test(mech)) return voor * 0.5;
    if ((m = mech.match(/^(\d+)(?:%| procent)\s*korting/i))) return voor * (1 - Number(m[1]) / 100);
  }
  let m;
  if ((m = mech.match(/^(\d+) (?:voor|stapelen voor) ([\d.,]+)/i))) return getal(m[2]) / Number(m[1]);
  if ((m = mech.match(/^voor ([\d.,]+)/i))) return getal(m[1]);
  if ((m = mech.match(/^([\d.,]+) korting/i)) && voor != null) return voor - getal(m[1]);
  return p.currentPrice;
}

const huismerk = (p) => /^AH( |$)/.test(p.brand || '') || /^AH /.test(p.title || '');
const afb = (p) => (p.images?.find((i) => i.width === 200) || p.images?.[0])?.url || null;

function maakProduct(p, isAanbieding) {
  const inh = parseInhoud(p.salesUnitSize);
  const normaal = p.priceBeforeBonus ?? null;
  let prijs = normaal;
  if (isAanbieding) prijs = effectievePrijs(p);
  if (prijs == null) return null;
  prijs = rond(prijs);
  const ud = parseEenheidsPrijs(p.unitPriceDescription);
  let eenheid = null, pe = null, ne = null;
  if (ud && normaal > 0) {
    eenheid = ud.eenheid;
    ne = ud.prijs;
    pe = ud.prijs * prijs / normaal;
  } else if (inh && inh.hoeveelheid > 0) {
    eenheid = inh.eenheid;
    pe = prijs / inh.hoeveelheid;
    ne = normaal != null ? normaal / inh.hoeveelheid : null;
  }
  const o = {
    id: String(p.webshopId),
    titel: p.title,
    merk: p.brand || null,
    huismerk: huismerk(p),
    categorie: p.subCategory || p.mainCategory || 'overig',
    inhoud: p.salesUnitSize || null,
    eenheid,
    prijs,
    normaalPrijs: normaal,
    prijsPerEenheid: rond(pe),
    normaalPerEenheid: rond(ne),
    mechanisme: null,
    geldigTot: null,
    afbeelding: afb(p),
  };
  if (isAanbieding) {
    o.mechanisme = p.bonusMechanism || null;
    o.geldigTot = p.bonusEndDate && !p.bonusEndDate.startsWith('2999') ? p.bonusEndDate : null;
  } else {
    o.normaalPrijs = null;
    o.normaalPerEenheid = null;
  }
  return o;
}

const winkelBonus = (p) =>
  p.isBonus && !p.isVirtualBundle && p.promotionType !== 'AHONLINE' && p.segmentType !== 'AHOO' && p.shopType === 'AH' &&
  !/^2999/.test(p.bonusEndDate || '');

// ---------- crawl ----------
const bonusProducten = new Map(); // webshopId -> ruw product
const idPerNaam = new Map(); // subCategory-naam -> taxonomy-id
const gezien = new Set();

function leesFacet(antwoord, eigenId) {
  const f = antwoord.filters?.find((x) => x.id === 'taxonomy');
  const kinderen = [];
  for (const o of f?.options || []) {
    if (!idPerNaam.has(o.label)) idPerNaam.set(o.label, o.id);
    if (String(o.id) !== String(eigenId)) kinderen.push(o);
  }
  return kinderen;
}

async function haalBonus(params, eigenId) {
  let kinderen = [];
  for (let page = 0; page < 3; page++) {
    const a = await zoek({ size: '1000', page: String(page), filters: 'bonus=Bonus', ...params });
    if (page === 0) kinderen = leesFacet(a, eigenId);
    for (const p of a.products || []) if (p.isBonus) bonusProducten.set(p.webshopId, p);
    if (page + 1 >= a.page.totalPages || (a.products || []).length < 1000) break;
  }
  return kinderen;
}

const CACHE = path.join(path.dirname(UIT), "ah-referentie.json");
const VERS_DAGEN = 7;

async function leesCache() {
  try { return JSON.parse(await readFile(CACHE, "utf8")); } catch { return {}; }
}

async function haalReferentie(naam, id) {
  const lijst = new Map();
  const neem = (a) => {
    for (const p of a.products || []) {
      if (p.isBonus || p.subCategory !== naam || lijst.has(p.webshopId)) continue;
      const o = maakProduct(p, false);
      if (o) lijst.set(p.webshopId, o);
    }
  };
  if (id) {
    for (let page = 0; page < 2; page++) {
      const a = await zoek({ size: "1000", page: String(page), taxonomyId: String(id) });
      neem(a);
      if (page + 1 >= a.page.totalPages) break;
    }
  } else {
    neem(await zoek({ size: "250", query: naam })); // categorie zonder bekend id: zoek op de naam
  }
  return [...lijst.values()];
}

async function main() {
  const start = Date.now();
  let afgebroken = null;
  try {
    // 1. bonus: root (3 sorteringen) en per categorie uit de facetten
    const kinderen = await haalBonus({}, null);
    for (const s of ["PRICELOWHIGH", "PRICEHIGHLOW"]) await haalBonus({ sortOn: s }, null);
    for (const k of kinderen) {
      if (gezien.has(k.id)) continue;
      gezien.add(k.id);
      await haalBonus({ taxonomyId: String(k.id) }, k.id);
    }
    console.log(`bonus-fase klaar: ${bonusProducten.size} bonusproducten, ${[...bonusProducten.values()].filter(winkelBonus).length} winkelbonus, ${requests} requests`);
  } catch (e) {
    if (e instanceof Budget) afgebroken = e.message; else throw e;
  }

  const aanbiedingen = [];
  for (const p of bonusProducten.values()) {
    if (!winkelBonus(p)) continue;
    const o = maakProduct(p, true);
    if (o && !(o.normaalPrijs != null && o.prijs > o.normaalPrijs * 1.001)) aanbiedingen.push(o);
  }

  // 2. referentie: niet-bonus producten uit de subcategorieen van de aanbiedingen. Per categorie gecachet
  //    (data/ah-referentie.json, ververst na 7 dagen), zodat elke run binnen het request-budget blijft
  //    en de dekking over een paar runs vanzelf compleet wordt. Ontbrekende eerst, dan de oudste.
  const perCat = new Map();
  for (const a of aanbiedingen) if (a.prijsPerEenheid != null) perCat.set(a.categorie, (perCat.get(a.categorie) || 0) + 1);
  const cats = [...perCat.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  const cache = await leesCache();
  const grens = Date.now() - VERS_DAGEN * 864e5;
  const teDoen = cats
    .filter((n) => !cache[n] || Date.parse(cache[n].gehaald) < grens)
    .sort((a, b) => (cache[a] ? Date.parse(cache[a].gehaald) : 0) - (cache[b] ? Date.parse(cache[b].gehaald) : 0));
  let gehaald = 0;
  if (!afgebroken) {
    for (const naam of teDoen) {
      try {
        cache[naam] = { gehaald: new Date().toISOString(), producten: await haalReferentie(naam, idPerNaam.get(naam)) };
        gehaald++;
      } catch (e) {
        if (e instanceof Budget) { afgebroken = e.message; break; }
        throw e;
      }
    }
  }
  await mkdir(path.dirname(UIT), { recursive: true });
  await writeFile(CACHE, JSON.stringify(cache));
  const referentie = cats.flatMap((n) => cache[n]?.producten || []);
  const zonderRef = cats.filter((n) => !cache[n]).length;

  const uit = {
    winkel: 'ah',
    naam: 'Albert Heijn',
    gemaakt: new Date().toISOString(),
    aanbiedingen,
    referentie,
  };
  await writeFile(UIT, JSON.stringify(uit));
  const metEenheid = (l) => l.filter((x) => x.prijsPerEenheid != null).length;
  console.log(
    `ah.json: ${aanbiedingen.length} aanbiedingen (${metEenheid(aanbiedingen)} met eenheidsprijs), ` +
      `${referentie.length} referentie (${metEenheid(referentie)} met eenheidsprijs), ` +
      `${cats.length} categorieen met eenheidsprijs-aanbieding (${gehaald} nu opgehaald, ${zonderRef} nog zonder referentie), ` +
      `${requests} requests, ${((Date.now() - start) / 1000).toFixed(0)} s` +
      (afgebroken ? ` | AFGEBROKEN: ${afgebroken}` : ''),
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
