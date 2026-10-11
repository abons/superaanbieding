// Verzamelaar Aldi -> data/aldi.json (contract: docs/contract.md). Gebruik: node winkels/aldi.mjs
//
// Bron: https://www.aldi.nl/aanbiedingen.html, een request. <script id="__NEXT_DATA__"> -> props.pageProps.apiData is een
// JSON-string -> [["OFFER_GET",{req,res}]] -> res.algoliaDataMap (artikelnr -> product) en res.categories (weekblokken).
// De pagina bevat ook aanbiedingen die later in de week of volgende week beginnen: per product kiezen we de periode in
// `promotionPrices` die vandaag (Europe/Amsterdam) loopt; producten zonder lopende periode vallen af (dus ook volgende week).
//
//  - Prijs: promotionPrices[actief].priceValue (anders currentPrice). "2 VOOR"-labels: priceValue is dan de prijs voor twee
//    (wijn 7,50 met strikePrice 9,98 = 2 x 4,99), wij rekenen om naar de prijs per stuk bij afname van de actie en zetten
//    mechanisme "2 voor 7,50". "OP=OP" -> mechanisme "op=op", "-25%" -> "25% korting", "VANAF" -> "vanaf" (prijs = vanafprijs).
//  - Normaalprijs: strikePrice (alleen bij ~40 artikelen), anders null.
//  - prijsPerEenheid: basePrice (kg/l) als geleverd en bij de lopende prijs hoort, anders uit salesUnit berekend:
//    "6x330 ml", "Ca. 800 g", "450-465 g" (midden), "4 stuks, 240 g" (gewicht wint), "250 g/500 ml" (eerste), "Per stuk",
//    "5-pack", "20 zakjes", "23 wasbeurten" (stuk). Onbepaalbaar -> null.
//  - Referentie: Aldi toont online alleen aanbiedingsartikelen, dus `referentie` is een lege array.
//  - Categorie: laatste deel van hierarchicalCategories.lvl1 (zonder "ALDI merken >"), anders lvl0, anders mainCategoryID
//    (behalve "offer"), anders het weekblok waarin het artikel staat (alleen specifieke blokken, niet "Weekacties" e.d.), anders
//    trefwoorden uit de naam, anders "Overig".
//  - Huismerk: true als (a) hierarchicalCategories een "ALDI merken"-tak heeft, of (b) brandName in HUISMERKEN staat (Aldi-eigen
//    labels, hieronder), of (c) er geen brandName is (Aldi verkoopt onbenoemde verse waar en non-food onder eigen naam).
//    Alles met een A-merk (Heineken, Becel, Knorr, ...) is huismerk false. Twijfelgevallen (Gourmet, Solo, Filipinos,
//    Van der Meulen, Euroma, Golden Power, Wilhelmina, Romeo & Cachet) staan bewust NIET in de lijst.
//  - Afbeelding: assets[type=primary].url.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const URL_ = 'https://www.aldi.nl/aanbiedingen.html';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// Aldi-eigen labels (hoofdletters). Gezien in de data van 2026-10-11 en een paar bekende die er andere weken in zitten.
const HUISMERKEN = new Set([
  'ALDI', 'CUCINA', 'CUCINA NOBILE', 'SPEISE ZEIT', 'ASIA GREEN GARDEN', 'KOEK&BAKKER', 'DAYLICIOUS', 'ROMEO', 'UNA',
  'PARTY GEBAK', 'MOLENLAND', 'RAVINI', 'LACURA', 'HEERLIJCK BANKET', 'CHOCEUR', 'CANISIUS', 'AMBIANO', 'TANDIL',
  'UP2FASHION', 'BISCOTTO', 'ACTIV ENERGY', 'CURRYSTAR', 'WORKZONE', 'HOME CREATION', 'HOMECREATION', 'GOLDEN SEAFOOD',
  'BARISSIMO', 'SATESSA', 'KARLSGUELL', 'SNACK FAN', 'RIDE+GO', 'KRONTALER', 'SWEETLAND', 'CROFTON', 'CASALUX',
  'LILY & DAN', 'ADVENTURIDGE', 'NOVITESSE', 'WESTMINSTER', 'ZUIVELHOEVE', "TRADER JOE'S", 'TRADER JOE’S',
  'HALLOWEEN LEDRAAMHANGER',
  // niet in deze week gezien maar wel Aldi-eigen
  'MILSANI', 'MILFINA', 'MAMIA', 'GUT BIO', 'NATURE\'S PICK', 'FARMER\'S PRIDE', 'BELLAROM', 'HOUSE OF PASTA', 'SUNNY SLICE',
  'MERIDOL', 'ALMARE', 'TASTY FRIES', 'BEST MOMENTS', 'GOLDEN CHOICE',
]);

// weekblokken die te algemeen zijn om als categorie te dienen
const ALGEMENE_BLOKKEN = /^(weekacties|a-merken|weekendacties a-merken|de smaak van itali|weekend versacties|kids|vanaf)/i;

const TREFWOORDEN = [
  [/wijn|montepulciano|primitivo|carmen[eè]re|chardonnay|prosecco|cava|merlot|rioja|sauvignon/i, 'Wijn'],
  [/bier|pilsener|\bbok\b|radler|lager|speciaalbier/i, 'Bier'],
  [/kaas|mozzarella|provolone|parmezaan|brie|feta/i, 'Kaas'],
  [/chips|noten|nootjes|popcorn|pinda|cashew/i, 'Chips en noten'],
  [/chocola|koek|speculoos|snoep|drop|kauwgom|pastilles|wafel|biscuit/i, 'Snoep, koek en chocolade'],
  [/pizza|pasta|ravioli|tortellini|lasagne|maaltijd/i, 'Maaltijden'],
  [/gehakt|worst|ham\b|kip|vlees|bacon|spek|steak|filet|slavink|schnitzel/i, 'Vlees'],
  [/vis\b|zalm|tonijn|garnaal|pangasius|kabeljauw/i, 'Vis'],
  [/appel|peer|peren|druiven|banaan|aardbei|citroen|sinaas|avocado|tomaat|tomaten|courgette|kool|sla\b|ui\b|wortel|spruiten|paprika|komkommer|groente|fruit|bosui/i, 'Groente en fruit'],
  [/soep|saus|olie|azijn|balsamico|kruiden|conserv|bonen|rijst|mix|siroop|stroop|bouillon/i, 'Soepen, sauzen en conserven'],
  [/yoghurt|melk|kwark|boter|margarine|room\b|ei(eren)?\b/i, 'Zuivel'],
  [/frisdrank|cola|limonade|ice ?tea|energydrink|sap\b|water/i, 'Frisdrank'],
  [/koffie|thee|latte|espresso|oploskoffie/i, 'Koffie en thee'],
  [/wasmiddel|wasverzachter|pods|reiniger|keukenpapier|schoonmaak|duster|spons/i, 'Huishouden'],
  [/shampoo|deodorant|tandpasta|zeep|bad\b|douche|verzorging|luchtverfrisser/i, 'Verzorging'],
  [/hond|kat\b|katten|dier/i, 'Huisdieren'],
  [/broek|shirt|trui|sokken|onesie|boxer|jas\b|handschoenen|kleding|vest\b|pyjama/i, 'Kleding'],
  [/kaars|vloerkleed|deken|kussen|dekbed|matras|lamp|bank|vaas|mok|schaal|halloween|kerst|herfst/i, 'Wonen en seizoen'],
  [/oplader|batterij|rookmelder|kabel|weerstation|apparaat|stofzuiger|blender|mixer/i, 'Elektronica en gereedschap'],
  [/plant|orchidee|cactus|succulent|bloem|varen|kalancho/i, 'Planten en bloemen'],
];

const r2 = n => Math.round(n * 100) / 100;
const r4 = n => Math.round(n * 10000) / 10000;
const num = s => parseFloat(String(s).replace(',', '.'));
const humaniseer = s => { const t = String(s).replace(/-/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };

// vandaag als YYYY-MM-DD in Nederlandse tijd
function vandaag() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
const lokaleDag = unix => (unix ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(unix * 1000)) : null);

// salesUnit -> { eenheid, hoeveelheid } (hoeveelheid in kg / l / stuk)
function parseInhoud(txt) {
  if (!txt) return { eenheid: null, hoeveelheid: null };
  let t = String(txt).toLowerCase().replace(/^inhoud:\s*/, '').replace(/\s+/g, ' ').trim().replace(/[.]+$/, '');
  const F = { kg: 1, g: 0.001, gr: 0.001 };
  const L = { l: 1, liter: 1, ml: 0.001, cl: 0.01, dl: 0.1 };
  const getal = '(\\d+(?:[.,]\\d+)?)';
  // gewicht/volume (eerste in "a/b" of na "n stuks,"), eventueel met "ca." en bereik "450-465"
  const re = new RegExp(`(?:(\\d+)\\s*x\\s*)?${getal}(?:\\s*-\\s*${getal})?\\s*(kg|gr|g|liter|ml|cl|dl|l)\\b`);
  const m = t.match(re);
  if (m) {
    const mult = m[1] ? +m[1] : 1;
    let n = num(m[2]);
    if (m[3]) n = (n + num(m[3])) / 2;
    const u = m[4];
    if (u in F) return { eenheid: 'kg', hoeveelheid: mult * n * F[u] };
    return { eenheid: 'l', hoeveelheid: mult * n * L[u] };
  }
  if (/^per (stuk|set|paar|bos|pak|zak)\b/.test(t)) return { eenheid: 'stuk', hoeveelheid: 1 };
  let s = t.match(new RegExp(`^${getal}(?:\\s*-\\s*${getal})?\\s*(stuks?|st|zakjes|pods|pads|rollen|wasbeurten|porties|tabs)\\b`));
  if (s) return { eenheid: 'stuk', hoeveelheid: s[2] ? (num(s[1]) + num(s[2])) / 2 : num(s[1]) };
  s = t.match(/^(\d+)-pack$/);
  if (s) return { eenheid: 'stuk', hoeveelheid: +s[1] };
  return { eenheid: null, hoeveelheid: null };
}

function mechanisme(label, prijsTwee) {
  const t = String(label || '').trim();
  if (!t) return null;
  if (/^op\s*=\s*op$/i.test(t)) return 'op=op';
  let m = t.match(/^-\s*(\d+)\s*%$/);
  if (m) return `${m[1]}% korting`;
  m = t.match(/^tot\s*-\s*(\d+)\s*%$/i);
  if (m) return `tot ${m[1]}% korting`;
  if (/^2\s*voor$/i.test(t)) return prijsTwee != null ? `2 voor ${prijsTwee.toFixed(2).replace('.', ',')}` : '2 voor';
  if (/^vanaf$/i.test(t)) return 'vanaf';
  return t.toLowerCase();
}

function categorie(p, blok) {
  const h = p.hierarchicalCategories || {};
  const laatste = lijst => {
    for (const s of lijst || []) { if (/^aldi merken/i.test(s)) continue; return s.split('>').pop().trim(); }
    return null;
  };
  const c = laatste(h.lvl1) || laatste(h.lvl0);
  if (c) return humaniseer(c);
  if (p.mainCategoryID && p.mainCategoryID !== 'offer') return humaniseer(p.mainCategoryID);
  if (blok && !ALGEMENE_BLOKKEN.test(blok)) return humaniseer(blok);
  const naam = `${p.name || ''}`;
  for (const [re, cat] of TREFWOORDEN) if (re.test(naam)) return cat;
  return 'Overig';
}

async function haal() {
  let fout;
  for (let poging = 1; poging <= 3; poging++) {
    try {
      const r = await fetch(URL_, { headers: { 'User-Agent': UA, 'Accept-Language': 'nl-NL', 'Accept-Encoding': 'gzip' }, redirect: 'follow' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.text();
    } catch (e) { fout = e; await new Promise(res => setTimeout(res, 2000 * poging)); }
  }
  throw fout;
}

function leesRes(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('geen __NEXT_DATA__ in pagina');
  let api = JSON.parse(m[1])?.props?.pageProps?.apiData;
  if (typeof api === 'string') api = JSON.parse(api);
  const res = (Array.isArray(api) ? api : []).find(x => x?.[0] === 'OFFER_GET')?.[1]?.res || api?.[0]?.[1]?.res;
  if (!res?.algoliaDataMap) throw new Error('structuur apiData gewijzigd: geen algoliaDataMap');
  return res;
}

function main() {
  return haal().then(html => {
    const res = leesRes(html);
    const vandaagS = vandaag();

    // artikelnr -> weekblok (eerste specifieke, anders eerste)
    const blokVan = new Map();
    for (const w of res.categories || []) for (const c of w.content || []) for (const id of c.productIds || []) {
      if (!blokVan.has(id) || (ALGEMENE_BLOKKEN.test(blokVan.get(id)) && !ALGEMENE_BLOKKEN.test(c.title))) blokVan.set(id, c.title);
    }

    const aanbiedingen = [];
    let nietNu = 0, zonderPrijs = 0;
    for (const [id, p] of Object.entries(res.algoliaDataMap)) {
      const cp = p.currentPrice || {};
      // lopende periode vandaag
      let per = (p.promotionPrices || []).find(x => x.validFromLocalDate <= vandaagS && vandaagS <= x.validUntilLocalDate);
      let tot;
      if (per) tot = per.validUntilLocalDate;
      else if (!(p.promotionPrices || []).length && cp.validFrom && lokaleDag(cp.validFrom) <= vandaagS && vandaagS <= lokaleDag(cp.validUntil)) { per = cp; tot = lokaleDag(cp.validUntil); }
      else { nietNu++; continue; }
      const rauw = per.priceValue ?? cp.priceValue;
      if (!(rauw > 0)) { zonderPrijs++; continue; }
      const label = (per.priceTagLabels || cp.priceTagLabels || {}).promoText1;
      const strike = (per.strikePrice || cp.strikePrice)?.strikePriceValue ?? null;
      const tweeVoor = /^2\s*voor$/i.test(String(label || '').trim());
      const deel = tweeVoor ? 2 : 1;
      const prijs = r2(rauw / deel);
      const normaalPrijs = strike > 0 ? r2(strike / deel) : null;

      const { eenheid, hoeveelheid } = parseInhoud(p.salesUnit);
      let ppe = null, normaalPpe = null, eh = eenheid;
      const bp = (per.basePrice || (cp.priceValue === rauw ? cp.basePrice : null) || [])[0];
      if (bp && (bp.basePriceScale === 'kg' || bp.basePriceScale === 'l') && bp.basePriceValue > 0) {
        eh = bp.basePriceScale;
        ppe = r2(bp.basePriceValue / deel);
        normaalPpe = normaalPrijs ? r2(ppe * normaalPrijs / prijs) : null;
      } else if (eenheid && hoeveelheid) {
        ppe = r2(prijs / hoeveelheid);
        normaalPpe = normaalPrijs ? r2(normaalPrijs / hoeveelheid) : null;
      }

      const h = p.hierarchicalCategories || {};
      const alleLvl = Object.values(h).flat();
      const merkRuw = (p.brandName || '').trim();
      const huismerk = alleLvl.some(s => /^aldi merken/i.test(s)) || !merkRuw || HUISMERKEN.has(merkRuw.toUpperCase());
      const img = (p.assets || []).find(a => a.type === 'primary')?.url || null;

      aanbiedingen.push({
        id: String(p.objectID || id),
        titel: String(p.name || '').trim(),
        merk: merkRuw || null,
        huismerk,
        categorie: categorie(p, blokVan.get(id)),
        inhoud: p.salesUnit || null,
        eenheid: eh,
        prijs,
        normaalPrijs,
        prijsPerEenheid: ppe,
        normaalPerEenheid: normaalPpe,
        mechanisme: mechanisme(label, tweeVoor ? r2(rauw) : null),
        geldigTot: tot,
        afbeelding: img,
      });
    }
    if (!aanbiedingen.length) throw new Error('geen aanbiedingen gevonden (structuur gewijzigd?)');

    const uit = { winkel: 'aldi', naam: 'Aldi', gemaakt: new Date().toISOString(), aanbiedingen, referentie: [] };
    const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'aldi.json'), JSON.stringify(uit, null, 1));
    const metPpe = aanbiedingen.filter(x => x.prijsPerEenheid != null).length;
    const hm = aanbiedingen.filter(x => x.huismerk).length;
    console.log(`aldi: ${aanbiedingen.length} aanbiedingen (${metPpe} met prijs/eenheid, ${hm} huismerk), 0 referentie; ${nietNu} buiten deze week overgeslagen, ${zonderPrijs} zonder prijs`);
  });
}

main().catch(e => { console.error('aldi.mjs mislukt:', e.message); process.exit(1); });
