// Verzamelaar Jumbo -> data/jumbo.json (contract: docs/contract.md). Gebruik: node winkels/jumbo.mjs
//
// Bron: https://www.jumbo.com/api/graphql (POST, JSON), open zonder login; introspectie staat uit.
// Verplichte headers: apollographql-client-name: JUMBO_WEB-search en apollographql-client-version: master-v29.4.0-web
// (zonder: 401 "No client headers set"). Als de versie verloopt: nieuwe string uit een verzoek van www.jumbo.com halen.
//
// Eén query, gebruikt voor alles:
//   query($input:ProductSearchInput!){ searchProducts(input:$input){ count start
//     products{ id title brand subtitle packSizeDisplay image
//       categories{ level name }                          # keten: 0 "Frisdrank en sappen" > 1 "Cola" > 2 "Cola zero" > 3 ...
//       price{ price promoPrice pricePerUnit{ price unit } }   # centen! unit = kg / l / pieces
//       promotions{ id tags{ text } end{ iso } } }
//     facets{ key values{ id count name } } } }
//   input = { searchType:"keyword", searchTerms:"*", offSet, limit:200, filters:[...] }
//
//  - searchTerms is verplicht en mag niet leeg zijn, maar "*" is een wildcard: alle producten (17k), max limit 200 per pagina.
//  - Aanbiedingen: filters [{key:"Aanbiedingen", values:["Alle aanbiedingen"]}] (~1600 producten, 9 pagina's).
//  - Referentie: hele assortiment per hoofdcategorie: filters [{key:"category", values:[<facet-id>]}], de hoofdcategorieen
//    komen uit de facet "category" van de ongefilterde zoekopdracht (~20, deels dynamisch als "Bewuste voeding", dus
//    ontdubbelen op product-id). Lokaal filteren op categorieen waarin een aanbieding zit, zonder aanbiedingsproducten.
//  - Categorie voor de vergelijking = niveau 2 uit `categories` ("Cola zero"), anders de diepste die er is. `category` (grof)
//    is te breed: "Frisdrank en sappen" zet cola naast appelsap.
//  - Prijzen in centen -> euro. pricePerUnit hoort bij `price.price` (normaalprijs); bij een aanbieding rekenen we hem om
//    naar de effectieve prijs. `promoPrice` is de eenmalige aanbiedingsprijs ("voor 0,99"); meervoudsacties ("2 voor 3,25",
//    "1+1 gratis", "2e halve prijs", "25% korting") staan alleen als tagtekst en worden hier uitgerekend: `prijs` = effectieve
//    prijs per verpakking bij afname van de actie.
//  - Huismerk: brand === "Jumbo" (ook "Jumbo Bio" e.d. via beginsWith).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const URL_GQL = 'https://www.jumbo.com/api/graphql';
const HEADERS = {
  'content-type': 'application/json',
  'apollographql-client-name': 'JUMBO_WEB-search',
  'apollographql-client-version': 'master-v29.4.0-web',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'accept-language': 'nl-NL',
};
const PAUZE = 350; // ms tussen verzoeken
const LIMIT = 200;
const QUERY = `query($input:ProductSearchInput!){searchProducts(input:$input){count start products{id title brand subtitle packSizeDisplay image categories{level name} price{price promoPrice pricePerUnit{price unit}} promotions{id tags{text} end{iso}}} facets{key values{id count name}}}}`;
const FILTER_AANBOD = [{ key: 'Aanbiedingen', values: ['Alle aanbiedingen'] }];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const r2 = n => Math.round(n * 100) / 100;
const euro = c => (c == null ? null : r2(c / 100));
const getal = s => parseFloat(String(s).replace(',', '.'));

async function zoek(input, poging = 1) {
  try {
    const r = await fetch(URL_GQL, { method: 'POST', headers: HEADERS, body: JSON.stringify({ query: QUERY, variables: { input } }) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (j.errors || !j.data) throw new Error(j.errors?.[0]?.message || 'graphql-fout');
    return j.data.searchProducts;
  } catch (e) {
    if (poging >= 4) throw e;
    await sleep(2000 * poging);
    return zoek(input, poging + 1);
  }
}

// Alle pagina's van een zoekopdracht; geeft { producten, facets } (facets van de eerste pagina).
async function alles(filters) {
  const producten = [];
  let facets = null, count = Infinity;
  for (let off = 0; off < count; off += LIMIT) {
    const d = await zoek({ searchType: 'keyword', searchTerms: '*', offSet: off, limit: LIMIT, ...(filters ? { filters } : {}) });
    count = d.count;
    facets ||= d.facets;
    producten.push(...d.products);
    if (!d.products.length) break;
    await sleep(PAUZE);
  }
  return { producten, facets };
}

function categorie(p) {
  const k = (p.categories || []).slice().sort((a, b) => a.level - b.level);
  return (k[2] || k[k.length - 1])?.name || p.category || 'Overig';
}

// Meervoudsactie -> { factor: effectieve prijs / normale prijs per verpakking, tekst } of null.
function actie(tekst, normaal) {
  const t = tekst.toLowerCase().replace(/\s+/g, ' ').trim();
  let m;
  if ((m = t.match(/(\d+) ?\+ ?(\d+) gratis/))) { const a = +m[1], b = +m[2]; return { factor: a / (a + b) }; }
  if ((m = t.match(/^(\d+) voor (\d+(?:[.,]\d+)?)$/))) { const n = +m[1]; return { prijs: getal(m[2]) / n }; }
  if ((m = t.match(/(\d+)e halve prijs/))) { const n = +m[1]; return { factor: (n - 0.5) / n }; }
  if (/halve prijs/.test(t)) return { factor: 0.5 };
  if ((m = t.match(/(\d+)e gratis/))) { const n = +m[1]; return { factor: (n - 1) / n }; }
  if ((m = t.match(/(\d+)\s*%\s*korting/))) return { factor: 1 - +m[1] / 100 };
  if ((m = t.match(/(\d+) voor (\d+(?:[.,]\d+)?)/))) { const n = +m[1]; return { prijs: getal(m[2]) / n }; }
  if ((m = t.match(/^voor (\d+(?:[.,]\d+)?)$/))) return { prijs: getal(m[1]) };
  return null;
}

function eenheid(u) { return u === 'kg' || u === 'l' ? u : u === 'pieces' ? 'stuk' : null; }

function maakProduct(p, aanbieding) {
  const pr = p.price || {};
  const norm = euro(pr.price);
  const ppeNorm = pr.pricePerUnit?.price != null ? euro(pr.pricePerUnit.price) : null;
  const eh = eenheid(pr.pricePerUnit?.unit);
  const promo = aanbieding ? (p.promotions || []).find(x => x.tags?.length) : null;
  const tags = (promo?.tags || []).map(t => t.text).filter(t => t && !/^alleen online$/i.test(t.trim()));
  const tekst = tags.join(', ') || null;

  let prijs = norm;
  if (aanbieding) {
    if (pr.promoPrice != null) prijs = euro(pr.promoPrice);
    else if (tekst && norm != null) {
      const a = tags.map(t => actie(t, norm)).find(Boolean);
      if (a) prijs = r2(a.prijs != null ? a.prijs : norm * a.factor);
    }
  }
  const ppe = x => (ppeNorm != null && norm > 0 && x != null && eh ? r2(ppeNorm * x / norm) : null);
  const brand = (p.brand || '').trim();
  return {
    id: String(p.id),
    titel: (p.title || '').trim(),
    merk: brand || null,
    huismerk: /^jumbo\b/i.test(brand) || /^jumbo\b/i.test((p.title || '').trim()), // ook "Jumbo Direct van de Boerderij" e.d. (merk Boerderij Zuivel/Merkloos)
    categorie: categorie(p),
    inhoud: p.subtitle || p.packSizeDisplay || null,
    eenheid: eh,
    prijs,
    normaalPrijs: norm,
    prijsPerEenheid: ppe(prijs),
    normaalPerEenheid: ppe(norm),
    mechanisme: tekst,
    geldigTot: aanbieding && promo?.end?.iso ? promo.end.iso.slice(0, 10) : null,
    afbeelding: p.image && p.image.startsWith('https://') ? p.image : null,
  };
}

async function main() {
  const { producten: ruwAanbod } = await alles(FILTER_AANBOD);
  const aanbiedingen = [];
  const inAanbod = new Set();
  for (const p of ruwAanbod) {
    if (inAanbod.has(p.id) || !p.price || !(p.price.price > 0)) continue;
    inAanbod.add(p.id);
    aanbiedingen.push(maakProduct(p, true));
  }
  const cats = new Set(aanbiedingen.map(a => a.categorie));

  // Hoofdcategorieen uit de facet van een ongefilterde eerste pagina.
  const eerste = await zoek({ searchType: 'keyword', searchTerms: '*', offSet: 0, limit: 1 });
  const hoofd = eerste.facets.find(f => f.key === 'category')?.values || [];
  const referentie = [];
  const refGezien = new Set();
  for (const h of hoofd) {
    const { producten } = await alles([{ key: 'category', values: [h.id] }]);
    for (const p of producten) {
      if (refGezien.has(p.id) || inAanbod.has(p.id) || !p.price || !(p.price.price > 0)) continue;
      if (p.price.promoPrice != null || p.promotions?.length) continue; // alleen gewone prijzen
      refGezien.add(p.id);
      const pr = maakProduct(p, false);
      if (cats.has(pr.categorie)) referentie.push(pr);
    }
  }

  const uit = { winkel: 'jumbo', naam: 'Jumbo', gemaakt: new Date().toISOString(), aanbiedingen, referentie };
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'jumbo.json'), JSON.stringify(uit, null, 1));
  const metPpe = l => l.filter(x => x.prijsPerEenheid != null).length;
  console.log(`jumbo: ${aanbiedingen.length} aanbiedingen (${metPpe(aanbiedingen)} met prijs/eenheid), ${referentie.length} referentie (${metPpe(referentie)} met prijs/eenheid), ${cats.size} categorieen`);
}

main().catch(e => { console.error('jumbo.mjs mislukt:', e.message); process.exit(1); });
