// Verzamelaar Dirk -> data/dirk.json (contract: docs/contract.md). Gebruik: node winkels/dirk.mjs
//
// Bron: https://web-gateway.dirk.nl/graphql (POST, JSON, User-Agent Mozilla/5.0), open, introspectie uit.
// Schema achterhaald uit de Nuxt-bundel van www.dirk.nl (/_nuxt/BSpN6Jmb.js: queryobjecten) + SSR-payload
// (__NUXT_DATA__ in https://www.dirk.nl/aanbiedingen). Winkel-id van de site: storeId 66 (Int).
//
//  - Aanbiedingen: listOffers(department: Int, store: Int) { currentOffers { offerId headerText packaging offerPrice
//      normalPrice textPriceSign image startDate endDate products { productId offerPrice normalPrice
//      productInformation { headerText subText packaging image department webgroup brand } } } }
//    `department` is een Int (1..18 komen voor, ids wijken af van listDepartments); zonder department: leeg.
//    Een aanbieding kan meerdere producten hebben (smaken); wij maken een Product per product.
//    normalPrice 0 = onbekend. textPriceSign is meestal "ACTIE_" en zegt niets over het mechanisme.
//  - Referentie: listDepartments { departments { id description webGroups { description webGroupId } } } en per webgroep
//    listWebGroupProducts(webGroupId: Int) { productAssortment(storeId: 66) { productId normalPrice offerPrice endDate
//      productInformation { ... } } }. De lijst bevat veel null's (niet in dit filiaal): weglaten.
//    offerPrice > 0 = nu in de aanbieding, 0 = gewone prijs (normalPrice).
//    listWebSubGroupProducts(webSubGroupId) werkt niet bruikbaar (lege/rommelige lijsten): categorie = webgroup.
//  - Afbeelding: https://web-fileserver.dirk.nl/<productInformation.image>.
//  - Huismerk: geen vlag in de API; bepaald uit merkenlijst hieronder (eigen/Superunie-merken die alleen bij supermarkten
//    als huismerk voorkomen; "1 de Beste" is het A-huismerk van Dirk).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GW = 'https://web-gateway.dirk.nl/graphql';
const STORE = 66;
const PAUZE = 350; // ms tussen verzoeken
const BASIS_IMG = 'https://web-fileserver.dirk.nl/';
// Gecontroleerd 2026-10-11: dirk.nl "Dirk-merken" (1 de Beste, Bakker van der Akker, De Vleeschmeesters, Doornbosch, Wonderwel,
// Natural Cool, Boterboer) en superunie.nl (g'woon, Bonbébé, Melkan, First Choice Cola, Bio+, Sum & Sam, 1 de Beste).
// Verwijderd: Zonnatura en Grand'Italia (A-merken: AH en Jumbo verkopen ze ook als merk).
const HUISMERKEN = new Set(['1 de beste', 'bio+', 'melkan', 'silvo', 'vleeschmeesters', 'bonbébé', 'daily chef',
  'bits & bites', 'derlon', 'bakker van der akker', 'doornbosch', 'wonderwel', 'natural cool', 'boterboer',
  'first choice cola', 'first choice', "g'woon", 'sum & sam']);

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gql(query, poging = 1) {
  try {
    const r = await fetch(GW, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (j.errors && !j.data) throw new Error(j.errors[0]?.message || 'graphql-fout');
    return j.data;
  } catch (e) {
    if (poging >= 3) throw e;
    await sleep(2000 * poging);
    return gql(query, poging + 1);
  }
}

const PI = 'headerText subText packaging image department webgroup brand';
const r2 = n => Math.round(n * 100) / 100;
const dag = s => (s ? String(s).slice(0, 10) : null);

// "6 x 330 ml", "1,5 liter", "500 g", "1 kg (ca. 2 stuks)", "10 Stuks", "Per stuk" -> { eenheid, hoeveelheid (in kg/l/stuk) }
function parseInhoud(txt) {
  if (!txt) return { eenheid: null, hoeveelheid: null };
  const t = txt.toLowerCase().replace(/\s+/g, ' ').trim();
  const getal = s => parseFloat(s.replace(',', '.'));
  let m = t.match(/^(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(kg|g|gr|gram|l|liter|ml|cl|dl)\b/);
  let mult = 1, n, u;
  if (m) { mult = +m[1]; n = getal(m[2]); u = m[3]; }
  else if ((m = t.match(/^(\d+(?:[.,]\d+)?)\s*(kg|kilo|g|gr|gram|l|liter|ml|cl|dl)\b/))) { n = getal(m[1]); u = m[2]; }
  if (u) {
    const f = { kg: 1, kilo: 1, g: 0.001, gr: 0.001, gram: 0.001 };
    const l = { l: 1, liter: 1, ml: 0.001, cl: 0.01, dl: 0.1 };
    if (u in f) return { eenheid: 'kg', hoeveelheid: mult * n * f[u] };
    return { eenheid: 'l', hoeveelheid: mult * n * l[u] };
  }
  if (/^per (stuk|paar|bos|bak|zak|pak|fles|blik|set|tros|net|doos|rol)\b/.test(t)) return { eenheid: 'stuk', hoeveelheid: 1 };
  m = t.match(/^(\d+)\s*(stuks?|st|zakjes|tabs|capsules|rollen|rol|tabletten|plakken|sachets)\b/);
  if (m) return { eenheid: 'stuk', hoeveelheid: +m[1] };
  return { eenheid: null, hoeveelheid: null };
}

function maakProduct(id, pi, prijs, normaal, einde, offerImg, aanbieding) {
  const titel = (pi.headerText || '').trim();
  const merkRuw = (pi.brand || '').trim();
  const { eenheid, hoeveelheid } = parseInhoud(pi.packaging);
  const ppe = (p) => (p != null && p > 0 && eenheid && hoeveelheid ? r2(p / hoeveelheid) : null);
  const img = pi.image || offerImg;
  const normaalPrijs = normaal > 0 ? r2(normaal) : null;
  let mechanisme = null;
  if (aanbieding && normaalPrijs && prijs < normaalPrijs) mechanisme = `${Math.round((1 - prijs / normaalPrijs) * 100)}% korting`;
  return {
    id: String(id),
    titel,
    merk: merkRuw || null,
    huismerk: HUISMERKEN.has(merkRuw.toLowerCase()),
    categorie: pi.webgroup || pi.department || 'Overig',
    inhoud: pi.packaging || null,
    eenheid,
    prijs: r2(prijs),
    normaalPrijs: aanbieding ? normaalPrijs : r2(prijs),
    prijsPerEenheid: ppe(prijs),
    normaalPerEenheid: aanbieding ? ppe(normaalPrijs) : ppe(prijs),
    mechanisme,
    geldigTot: aanbieding ? dag(einde) : null,
    afbeelding: img ? BASIS_IMG + img : null,
  };
}

async function main() {
  const aanbiedingen = [];
  const inAanbieding = new Set();
  const gezien = new Set();
  for (let d = 1; d <= 25; d++) {
    const data = await gql(`{listOffers(department:${d},store:${STORE}){currentOffers{offerId headerText packaging offerPrice normalPrice image endDate products{productId offerPrice normalPrice productInformation{${PI}}}}}}`);
    for (const o of data?.listOffers?.currentOffers || []) {
      for (const p of o.products || []) {
        if (!p || !p.productInformation) continue;
        inAanbieding.add(p.productId);
        const sleutel = o.offerId + ':' + p.productId;
        if (gezien.has(sleutel)) continue;
        gezien.add(sleutel);
        const prijs = p.offerPrice > 0 ? p.offerPrice : o.offerPrice;
        if (!(prijs > 0)) continue;
        const pr = maakProduct(p.productId, p.productInformation, prijs, p.normalPrice, o.endDate, o.image, true);
        if (/op\s*=\s*op/i.test(o.packaging || '')) pr.mechanisme = [pr.mechanisme, 'op=op'].filter(Boolean).join(', ');
        aanbiedingen.push(pr);
      }
    }
    await sleep(PAUZE);
  }
  const cats = new Set(aanbiedingen.map(a => a.categorie));

  const dep = (await gql('{listDepartments{departments{id description webGroups{description webGroupId}}}}')).listDepartments.departments;
  const referentie = [];
  const refGezien = new Set();
  for (const dp of dep) for (const g of dp.webGroups) {
    if (!cats.has(g.description)) continue; // alleen categorieen waarin een aanbieding zit
    const data = await gql(`{listWebGroupProducts(webGroupId:${g.webGroupId}){productAssortment(storeId:${STORE}){productId normalPrice offerPrice productInformation{${PI}}}}}`);
    for (const p of data?.listWebGroupProducts?.productAssortment || []) {
      if (!p || !p.productInformation || refGezien.has(p.productId) || inAanbieding.has(p.productId)) continue;
      if (p.offerPrice > 0 || !(p.normalPrice > 0)) continue;
      refGezien.add(p.productId);
      referentie.push(maakProduct(p.productId, p.productInformation, p.normalPrice, null, null, null, false));
    }
    await sleep(PAUZE);
  }

  // Te weinig aanbiedingen (0 of < 50% van het vorige bestand): niets wegschrijven.
  let vorig = 0;
  try { vorig = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'dirk.json'), 'utf8')).aanbiedingen.length; } catch { /* geen of kapot vorig bestand */ }
  if (!aanbiedingen.length || (aanbiedingen.length < vorig * 0.5 && !process.env.SA_FORCEER)) throw new Error(`${aanbiedingen.length} aanbiedingen (vorige run ${vorig}), structuur gewijzigd? (bij een echte daling: SA_FORCEER=1 of data/dirk.json weghalen)`);

  const uit = { winkel: 'dirk', naam: 'Dirk', gemaakt: new Date().toISOString(), aanbiedingen, referentie };
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'dirk.json'), JSON.stringify(uit, null, 1));
  const metPpe = l => l.filter(x => x.prijsPerEenheid != null).length;
  console.log(`dirk: ${aanbiedingen.length} aanbiedingen (${metPpe(aanbiedingen)} met prijs/eenheid), ${referentie.length} referentie (${metPpe(referentie)} met prijs/eenheid), ${cats.size} categorieen`);
}

main().catch(e => { console.error('dirk.mjs mislukt:', e.message); process.exit(1); });
