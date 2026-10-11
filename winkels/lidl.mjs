// Verzamelaar Lidl -> data/lidl.json (contract: docs/contract.md). Gebruik: node winkels/lidl.mjs
//
// Bron: https://www.lidl.nl/q/api/search (open, GET, JSON, geen cookie). Parameters: offset, fetchsize (de server kapt af op
// 60 per pagina, dus pagineren met offset), locale=nl_NL, assortment=NL, version=2.1.0, q=<zoekterm>, category.id=10068374
// ("Eten & drinken"). Zonder q geeft die categorie alle ~185 eet/drinkartikelen in 4 pagina's; zoektermen (met dezelfde
// categoriefilter) vullen aan voor het geval de lijst afgekapt wordt. Alles wordt gededupliceerd op productcode.
//
//  - Item: items[].gridbox.data: fullTitle, brand.name, category ("Food" bij voedsel), keyfacts.wonCategoryPrimary
//    ("Werelden van nood/Eten en dichtbij voedsel/Kaas, zuivelproducten & eieren/Kaas"), price.{price,oldPrice,discount,
//    packaging.text}, keyfacts.description (<li>750 g</li>), storeEndDate (unix), canonicalUrl, image.
//  - Aanbieding = price.oldPrice > price. oldPrice 0/ontbrekend = gewoon product (referentie). Artikelen zonder prijs
//    (komende-week-acties zonder prijs in de API) worden overgeslagen: prijs is verplicht in het contract.
//  - price.basePrice is leeg voor voedsel, dus prijs per kg/l wordt altijd zelf uitgerekend uit de hoeveelheid. Die komt uit
//    (in volgorde) price.packaging.text, de <li>'s van keyfacts.description, supplementalDescription, de titel. Geen
//    af te leiden eenheid -> product blijft staan met eenheid null en prijsPerEenheid null.
//  - Niet-voedsel (Drogisterij, Huishouding, Dierbenodigdheden, Bloemen & planten) wordt weggelaten.
//  - Categorie = laatste segment van wonCategoryPrimary ("Kaas", "Yoghurt", "Sauzen & kruiden").
//  - Huismerk: geen vlag in de API; Lidl-eigen merken uit HUISMERKEN hieronder (merknaam uit brand.name, anders eerste woord
//    van de titel). Producten zonder merk (bv. "Groene olijven met knoflook") zijn niet te beoordelen -> huismerk false.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://www.lidl.nl/q/api/search';
const BASIS = 'https://www.lidl.nl';
const CATEGORIE_ID = '10068374';
const PAGINA = 60;
const PAUZE = 400; // ms tussen verzoeken
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', 'Accept-Language': 'nl-NL' };

// Lidl-eigen (huis)merken in het voedsel/drank-assortiment (kleine letters). Lijst is handmatig; nieuwe merken bijvullen.
const HUISMERKEN = new Set(['milbona', 'pilos', 'freshona', 'cien', 'dulano', 'w5', 'chef select', 'deluxe', 'vemondo',
  'favorina', 'sondey', 'alesto', 'bon gelati', 'formil', 'g. bellini', 'kipster', 'maribel', 'suddenly', 'belbake', 'kania', 'mcennedy', 'saniku', 'nixe', 'combino', 'baresa', 'freeway',
  'rioba', 'solevita', "vita d'or", 'fairglobe', 'bellarom', 'nutriwell', 'italiamo', 'perlenbacher', 'birkenhof', 'saphir',
  'gelatelli', 'lyttos', 'el tequito', 'snack day', 'crownfield', 'biotrend', 'primadonna', 'park street deli', 'sweet valley',
  'trattoria alfredo', 'tastino', 'eridanous', 'orlando', 'dolce vita', 'bio organic', 'lidl', 'k-take it veggie',
  'oliveto', 'pikok']);
// Gecontroleerd 2026-10-11 tegen lidl.nl/c/huismerken (o.a. Alesto, Bellarom, Cien, Formil, Freeway, Milbona, Sondey, W5, Snack Day).
// Verwijderd: Mona (A-merk, AH en Dirk verkopen het als merk), Choceur en Cucina Nobile (Aldi-merken).
const A_MERKEN = new Set(['grolsch', 'iglo', 'bertolli', 'yakult', 'optimel', 'eru', 'hak', 'heineken', 'bavaria', 'coca-cola', 'fanta', 'sprite', 'lipton', 'douwe', 'nescafe', 'nescafé', 'unox', 'knorr', 'calve', "lay's",'doritos', 'pringles', 'milka', 'oreo']);
const NIET_VOEDSEL = /Drogisterij|Huishouding|Dierbenodigdheden|Bloemen & planten/;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const r2 = n => Math.round(n * 100) / 100;

async function zoek(q, offset, poging = 1) {
  const url = `${API}?offset=${offset}&fetchsize=${PAGINA}&locale=nl_NL&assortment=NL&version=2.1.0&category.id=${CATEGORIE_ID}&q=${encodeURIComponent(q)}`;
  try {
    const r = await fetch(url, { headers: HEADERS });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (e) {
    if (poging >= 3) throw e;
    await sleep(2000 * poging);
    return zoek(q, offset, poging + 1);
  }
}

// Alle pagina's voor een zoekterm; items opgeteld in `kaart` (code -> item).
async function haalAlles(q, kaart) {
  for (let offset = 0; offset < 1000; offset += PAGINA) {
    const j = await zoek(q, offset);
    const items = j.items || [];
    for (const it of items) if (it.gridbox?.data && !kaart.has(it.code)) kaart.set(it.code, it);
    await sleep(PAUZE);
    if (items.length < PAGINA || offset + PAGINA >= (j.numFound ?? 0)) break;
  }
}

const getal = s => parseFloat(String(s).replace(',', '.'));
const FAC = { kg: 1, kilo: 1, g: 0.001, gr: 0.001, gram: 0.001, l: 1, liter: 1, ml: 0.001, cl: 0.01, dl: 0.1 };

// Zoekt in een vrije tekst naar "6 x 330 ml", "1,5 l", "ca. 400 g", "8 stuks" -> { eenheid, hoeveelheid, tekst }
function parseInhoud(txt) {
  if (!txt) return null;
  const t = String(txt).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').toLowerCase().replace(/\s+/g, ' ');
  const eh = '(kg|kilo|gram|gr|g|liter|l|ml|cl|dl)(?![a-zà-ÿ])';
  let m = t.match(new RegExp(`(\\d+)\\s*[x×]\\s*(\\d+(?:[.,]\\d+)?)\\s*${eh}`));
  if (m) {
    const u = m[3];
    return { eenheid: ['kg', 'kilo', 'gram', 'gr', 'g'].includes(u) ? 'kg' : 'l', hoeveelheid: +m[1] * getal(m[2]) * FAC[u], tekst: m[0] };
  }
  m = t.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${eh}`));
  if (m) {
    const u = m[2];
    return { eenheid: ['kg', 'kilo', 'gram', 'gr', 'g'].includes(u) ? 'kg' : 'l', hoeveelheid: getal(m[1]) * FAC[u], tekst: m[0] };
  }
  m = t.match(/(\d+)\s*(stuks?|st\.?|stuk|plakken|plakjes|zakjes|rollen|tabletten)(?![a-zà-ÿ])/);
  if (m) return { eenheid: 'stuk', hoeveelheid: +m[1], tekst: m[0] };
  return null;
}

function inhoudVan(d) {
  const p = d.price?.packaging || {};
  const bronnen = [p.text, p.amount != null && p.unit ? `${p.amount} ${p.unit}` : null];
  const desc = d.keyfacts?.description || '';
  for (const li of desc.matchAll(/<li>(.*?)<\/li>/gis)) bronnen.push(li[1]);
  bronnen.push(d.keyfacts?.supplementalDescription, d.fullTitle);
  for (const b of bronnen) {
    const r = parseInhoud(b);
    if (r && r.hoeveelheid > 0) return r;
  }
  return null;
}

// "8 x 65 ml" -> "8 x 65 ml"; een nette tekst voor het veld `inhoud`
const nette = r => (r ? r.tekst.replace(/(\d)\s*[x×]\s*(\d)/, '$1 x $2').replace(/(\d)([a-z])/, '$1 $2') : null);

function dagVan(unix) {
  if (!unix) return null;
  return new Date(unix * 1000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' }); // YYYY-MM-DD
}

function merkVan(d) {
  const b = (d.brand?.name || '').replace(/[®™]/g, '').trim();
  if (b && b !== '-') return b;
  const eerste = (d.fullTitle || '').split(/\s+/)[0].replace(/[®™]/g, '');
  const l = eerste.toLowerCase();
  // geen brand in de API: eerste woord als merk als het een Lidl-merk, een bekend A-merk of een HOOFDLETTERwoord is
  return HUISMERKEN.has(l) || A_MERKEN.has(l) || (/^[A-ZÄÖÜ]{3,}$/.test(eerste)) ? eerste : null;
}

function maakProduct(it) {
  const d = it.gridbox.data;
  const prijs = d.price?.price;
  if (!(prijs > 0)) return null;
  const oud = d.price.oldPrice > prijs ? d.price.oldPrice : null;
  const aanbieding = oud != null;
  const merkRuw = merkVan(d);
  const titel = (d.fullTitle || '').replace(/[®™]/g, '').replace(/^[-–\s]+/, '').trim();
  const inh = inhoudVan(d);
  const hoeveel = inh && inh.eenheid !== 'stuk' ? inh.hoeveelheid : null;
  const ppe = p => (p != null && hoeveel ? r2(p / hoeveel) : null);
  const kat = (d.keyfacts?.wonCategoryPrimary || '').split('/').pop() || 'Overig';
  const pct = d.price.discount?.percentageDiscount ?? (aanbieding ? Math.round((1 - prijs / oud) * 100) : null);
  const einde = d.storeEndDate || d.regionsPrices?.[Object.keys(d.regionsPrices || {})[0]]?.currentPrice?.endDate;
  const img = d.image || d.imageList?.[0] || null;
  return {
    id: String(it.code || d.productId),
    titel,
    merk: merkRuw,
    huismerk: merkRuw ? HUISMERKEN.has(merkRuw.toLowerCase()) : false,
    categorie: kat,
    inhoud: nette(inh),
    eenheid: hoeveel ? inh.eenheid : null,
    prijs: r2(prijs),
    normaalPrijs: aanbieding ? r2(oud) : r2(prijs),
    prijsPerEenheid: ppe(prijs),
    normaalPerEenheid: aanbieding ? ppe(oud) : ppe(prijs),
    mechanisme: aanbieding && pct ? `${pct}% korting` : null,
    geldigTot: aanbieding ? (typeof einde === 'number' ? dagVan(einde) : einde ? String(einde).slice(0, 10) : null) : null,
    afbeelding: img && /^https:/.test(img) ? img : null,
  };
}

const TERMEN = ['', 'melk', 'yoghurt', 'kaas', 'boter', 'eieren', 'vlees', 'kip', 'gehakt', 'worst', 'vis', 'zalm', 'groente', 'fruit',
  'aardappel', 'brood', 'ontbijt', 'muesli', 'pindakaas', 'jam', 'chocolade', 'koek', 'chips', 'snoep', 'ijs', 'pizza', 'pasta',
  'rijst', 'saus', 'soep', 'olie', 'cola', 'frisdrank', 'sap', 'water', 'bier', 'wijn', 'koffie', 'thee', 'noten', 'diepvries'];

async function main() {
  const kaart = new Map();
  for (const q of TERMEN) {
    const voor = kaart.size;
    await haalAlles(q, kaart);
    if (kaart.size > voor) console.log(`  "${q}": +${kaart.size - voor} (totaal ${kaart.size})`);
  }
  const aanbiedingen = [];
  const referentie = [];
  let zonderPrijs = 0, geenVoedsel = 0;
  for (const it of kaart.values()) {
    const d = it.gridbox.data;
    const cat = d.keyfacts?.wonCategoryPrimary || '';
    const voedsel = d.category === 'Food' || /Eten en dichtbij voedsel|Wijn, bier en sterke drank/.test(cat);
    if (!voedsel || NIET_VOEDSEL.test(cat)) { geenVoedsel++; continue; }
    const p = maakProduct(it);
    if (!p) { zonderPrijs++; continue; }
    if (p.mechanisme || p.normaalPrijs > p.prijs) aanbiedingen.push(p);
    else { p.normaalPrijs = p.prijs; p.geldigTot = null; referentie.push(p); }
  }
  const uit = { winkel: 'lidl', naam: 'Lidl', gemaakt: new Date().toISOString(), aanbiedingen, referentie };
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'lidl.json'), JSON.stringify(uit, null, 1));
  const metPpe = l => l.filter(x => x.prijsPerEenheid != null).length;
  console.log(`lidl: ${kaart.size} unieke artikelen, ${geenVoedsel} geen voedsel, ${zonderPrijs} zonder prijs overgeslagen`);
  console.log(`lidl: ${aanbiedingen.length} aanbiedingen (${metPpe(aanbiedingen)} met prijs/eenheid), ${referentie.length} referentie (${metPpe(referentie)} met prijs/eenheid), huismerk ${aanbiedingen.filter(x => x.huismerk).length}+${referentie.filter(x => x.huismerk).length}`);
}

main().catch(e => { console.error('lidl.mjs mislukt:', e.message); process.exit(1); });
