// Verzamelaar Boon's Markt -> data/boons.json (contract: docs/contract.md). Gebruik: node winkels/boons.mjs
//
// Bron: geen machineleesbare bron (zie docs/bronnen.md, kop Boon's). De wekelijkse folder (FlippingBook) is met de hand/vision
// uitgelezen naar invoer/boons-w<week>.json; dit script leest het nieuwste bestand en zet het om. Invoer is handwerk en gaat mee in git.
//
// Invoerformaat per product: { pagina, titel, merk, inhoud, gewichtGram|volumeMl (per stuk/eenheid waarop de sticker slaat),
//   actie, prijs (stickerprijs voor prijsGeldtVoor), prijsGeldtVoor, normaalPrijs (voor dezelfde hoeveelheid), zeker, opmerking }.
// Effectieve prijs per stuk: 1+1 gratis -> prijs/2, 2+1 -> /3, 2+2 -> /4, 2+3 -> /5, '2e halve prijs' -> /2, '<n> voor X' -> /n.
// normaalPrijs wordt door dezelfde deler gedeeld (hij geldt voor dezelfde hoeveelheid). Onzeker of zonder prijs: overgeslagen.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MAP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const r2 = n => Math.round(n * 100) / 100;
const HUISMERKEN = new Set(['boonacker', "g'woon", '1 de beste', "boon's"]);

const vandaagNL = () => new Date().toLocaleDateString('sv', { timeZone: 'Europe/Amsterdam' });

// Kiest uit [{naam, inv}] de invoer met de laatste geldigTot (niet het weeknummer: dat loopt bij de jaarwisseling terug).
// Zonder geldigTot telt een invoer als oudste.
export function kiesInvoer(invoeren, vandaag = new Date().toLocaleDateString('sv', { timeZone: 'Europe/Amsterdam' })) {
  if (!invoeren.length) throw new Error('geen invoer/boons-w*.json gevonden');
  // Een week die nog niet is begonnen (geldigVan in de toekomst) mag vooraf worden ingevoerd zonder de lopende week te verdringen.
  const begonnen = invoeren.filter((i) => !i.inv.geldigVan || String(i.inv.geldigVan) <= vandaag);
  return (begonnen.length ? begonnen : invoeren).slice().sort((a, b) => String(b.inv.geldigTot || '').localeCompare(String(a.inv.geldigTot || '')) || b.naam.localeCompare(a.naam))[0];
}

function nieuwsteInvoer() {
  const dir = path.join(MAP, 'invoer');
  const namen = fs.existsSync(dir) ? fs.readdirSync(dir).filter(n => /^boons-w\d+\.json$/.test(n)) : [];
  const invoeren = [], kapot = [];
  for (const naam of namen) {
    try { invoeren.push({ naam, inv: JSON.parse(fs.readFileSync(path.join(dir, naam), 'utf8')) }); }
    catch (e) { kapot.push(`${naam} (${e.message})`); } // kapot bestand overslaan, de rest gewoon verwerken
  }
  if (!invoeren.length && kapot.length) throw new Error(`alle invoerbestanden zijn kapot: ${kapot.join('; ')}`);
  const k = kiesInvoer(invoeren);
  const waarschuwing = kapot.length ? `Boon's Markt: kapot invoerbestand overgeslagen: ${kapot.join('; ')}` : null;
  return { bestand: path.join(dir, k.naam), inv: k.inv, waarschuwing };
}

// Aantal stuks waarvoor de stickerprijs geldt.
function deler(actie, geldtVoor) {
  const a = String(actie || '').toLowerCase();
  let m;
  if (/^1\+1/.test(a)) return 2;
  if (/^2\+1/.test(a)) return 3;
  if (/^2\+2/.test(a)) return 4;
  if (/^2\+3/.test(a)) return 5;
  if (/^2e halve prijs/.test(a)) return 2;
  if ((m = a.match(/^(\d+) voor/))) return +m[1];
  return 1;
}

// Categorie uit de titel; eerste treffer wint. Namen zoveel mogelijk zoals AH/Dirk ze gebruiken.
const CATS = [
  // Specifiek eerst: anders pakt 'aardbei' een toetje, 'snacks' dierenvoeding en 'dove' een gemengd verzorgingsblok.
  [/dierenvoeding|rosewood/i, 'Dierenvoeding'], [/rotterdamsche oude|milner|noord waarland/i, 'Kaas'], [/mousse|dessert/i, 'Toetjes'], [/andr[eé]lon.*axe|shampoo.*douche/i, 'Persoonlijke verzorging'],
  [/druiven/i, 'Druiven'], [/appels/i, 'Appels'], [/stoofperen|handperen|doyenne/i, 'Peren'], [/kiwi|aardbei/i, 'Fruit'],
  [/aardappel/i, 'Aardappelen'], [/frites/i, 'Diepvries aardappelproducten'], [/paprika/i, 'Paprika'],
  [/rundergehakt/i, 'Rundergehakt'], [/riblappen/i, 'Rundvlees'], [/kippenbouten|drumsticks/i, 'Kipdelen'],
  [/schnitzel/i, 'Schnitzel'], [/zalm|makreel/i, 'Vis (gerookt)'], [/worst|saucijzen/i, 'Worst'],
  [/gehaktbal/i, 'Gehaktballen'], [/pasham|ontbijtspek|metworst|rosbief|kipfilet.*(italiaans|uiengehakt)/i, 'Vleeswaren'],
  [/pate/i, 'Pate'], [/salades?$|lunchsalade/i, 'Salades'], [/mieschotel|rijstschotel|italiaanse maaltijden|verspakket/i, 'Maaltijden'],
  [/geraspte.*kaas|geraspte jonge goudse/i, 'Geraspte kaas'], [/feta|plakken kaas|spanish cheese|brie/i, 'Kaas'],
  [/yoghurt|vla$/i, 'Yoghurt'], [/kwark/i, 'Kwark'], [/alpro/i, 'Plantaardige drink'], [/becel/i, 'Margarine'],
  [/pizza/i, 'Pizza'], [/loempia|snacks/i, 'Snacks (diepvries)'], [/\bsap\b|smoothie/i, 'Vers sap en smoothies'],
  [/coca-cola|\bcola\b/i, 'Cola regular'], [/gazeuse|fruit shoot|tintelfruit/i, 'Limonade en fruitdrank'], [/energydrink/i, 'Energydrank'],
  [/wijn/i, 'Wijn'], [/merlot|grand sud|stoney creek/i, 'Wijn'], [/amstel|heineken|grolsch|radler|bier/i, 'Bier'],
  [/vodka|jenever|kruidenlikeur|likeur|whisky|gin\b/i, 'Gedistilleerd'], [/koffiecapsules/i, 'Koffiecapsules'], [/thee/i, 'Thee'],
  [/brood|(^|\s)bollen|stolletje|speculaas|donuts|kersencarre|gebakjes|amandeltongen|zebraspritsen/i, 'Brood en gebak'],
  [/soepgroenten|groenten|bloemkool|spinazie|witlof/i, 'Groenten'], [/lunchsalade/i, 'Salades'],
  [/chips|doritos|lay's/i, 'Chips'], [/m&m|maltesers|autodrop|skittles|oldtimers|digestives|verkade|nobo|chocolade/i, 'Snoep en koek'],
  [/kellogg/i, 'Ontbijtgranen'], [/bonne maman|broodbeleg/i, 'Broodbeleg'], [/olie|olio/i, 'Olie'],
  [/mosterd|friteslijn|saus|ramen/i, 'Sauzen en maaltijdmakers'], [/kokosmelk|bouillon|vermicelli|soepstengels/i, 'Kruidenierswaren'],
  [/roomkaas/i, 'Roomkaas'], [/toiletpapier/i, 'Toiletpapier'], [/vaatwas/i, 'Vaatwastabletten'], [/ambi pur/i, 'Toiletblokken'],
  [/felix/i, 'Kattenvoer'], [/dove|rexona/i, 'Deodorant'], [/libresse|tena|yoni/i, 'Damesverzorging'], [/conditioner|shampoo/i, 'Haarverzorging'],
];
export const categorie = t => (CATS.find(([re]) => re.test(t)) || [0, 'Overig'])[1];

function main() {
  const { bestand, inv, waarschuwing: kapotWaarschuwing } = nieuwsteInvoer();
  const dir = path.join(MAP, 'data');
  const vandaag = vandaagNL();
  if (!inv.geldigTot || inv.geldigTot < vandaag) {
    // Folder verlopen: liever niets dan oude prijzen als aanbieding. De waarschuwing komt via vergelijk.mjs op de pagina.
    const waarschuwing = `Boon's Markt: folder ${path.basename(bestand)} is verlopen (geldig tot ${inv.geldigTot || 'onbekend'}), nieuwe invoer/boons-w<week>.json nodig` + (kapotWaarschuwing ? ` | ${kapotWaarschuwing}` : '');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'boons.json'), JSON.stringify({ winkel: 'boons', naam: "Boon's Markt", gemaakt: new Date().toISOString(), waarschuwing, aanbiedingen: [], referentie: [] }, null, 1));
    console.log('WAARSCHUWING: ' + waarschuwing);
    return;
  }
  const aanbiedingen = [];
  const overgeslagen = { onzeker: 0, zonderPrijs: 0 };
  inv.producten.forEach((p, i) => {
    if (p.zeker === false) { overgeslagen.onzeker++; return; }
    if (!(p.prijs > 0)) { overgeslagen.zonderPrijs++; return; }
    const n = deler(p.actie, p.prijsGeldtVoor);
    const perStuk = p.prijs / n;
    const normaalPerStuk = p.normaalPrijs > 0 ? p.normaalPrijs / n : null;
    const kg = p.gewichtGram > 0 ? p.gewichtGram / 1000 : null;
    const l = p.volumeMl > 0 ? p.volumeMl / 1000 : null;
    const eenheid = kg ? 'kg' : l ? 'l' : 'stuk';
    const hoeveel = kg || l || 1;
    const merkSleutel = String(p.merk || '').toLowerCase();
    aanbiedingen.push({
      id: `boons-w${inv.week}-${i + 1}`,
      titel: p.titel,
      merk: p.merk || null,
      huismerk: HUISMERKEN.has(merkSleutel),
      categorie: categorie(p.titel),
      inhoud: p.inhoud || null,
      eenheid,
      prijs: r2(perStuk),
      normaalPrijs: normaalPerStuk ? r2(normaalPerStuk) : null,
      prijsPerEenheid: r2(perStuk / hoeveel),
      normaalPerEenheid: normaalPerStuk ? r2(normaalPerStuk / hoeveel) : null,
      mechanisme: p.actie || null,
      geldigTot: inv.geldigTot || null,
      afbeelding: null,
    });
  });
  const uit = { winkel: 'boons', naam: "Boon's Markt", gemaakt: new Date().toISOString(), ...(kapotWaarschuwing ? { waarschuwing: kapotWaarschuwing } : {}), aanbiedingen, referentie: [] };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'boons.json'), JSON.stringify(uit, null, 1));
  if (kapotWaarschuwing) console.log('WAARSCHUWING: ' + kapotWaarschuwing);
  console.log(`boons: ${aanbiedingen.length} aanbiedingen uit ${path.basename(bestand)} (${inv.producten.length} regels; overgeslagen: ${overgeslagen.onzeker} onzeker, ${overgeslagen.zonderPrijs} zonder prijs)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (e) { console.error('boons.mjs mislukt:', e.message); process.exit(1); }
}
