// Controleert de oordeelslogica van vergelijk.mjs en de families van familie.mjs. Gebruik: node test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beoordeel, inkort, leesWinkels, pakLock, LOCK_STALE_MS, MIN_VERHOUDING, MIN_VERHOUDING_FAMILIE, normEenheid } from './vergelijk.mjs';
import { kiesInvoer } from './winkels/boons.mjs';
import { isGratisCadeauZonderKorting } from './winkels/jumbo.mjs';
import { familieVan, familieNaam } from './familie.mjs';

const p = (o) => ({ id: 'x', titel: 't', merk: null, huismerk: false, categorie: 'Cola', eenheid: 'l', prijs: 1, prijsPerEenheid: 1, ...o });
const w = (winkel, aanbiedingen, referentie = []) => ({ winkel, naam: winkel, aanbiedingen, referentie });
const een = (winkels, id = 'x') => beoordeel(winkels).find((a) => a.id === id);
// Drie referenties van een ander merk: genoeg voor een echte vergelijking.
const refs = (...prijzen) => prijzen.map((pr, i) => p({ id: 'r' + i, merk: 'Pepsi', prijsPerEenheid: pr }));

// Goedkoopste in de categorie met genoeg kandidaten = beste.
let a = een([w('ah', [p({ prijsPerEenheid: 1 })], refs(2, 3, 4))]);
assert.equal(a.oordeel, 'beste'); assert.equal(a.alternatief, null); assert.equal(a.besparing, 0); assert.equal(a.vergelijking, 'categorie');

// Te weinig kandidaten (minder dan 3) = geen echte vergelijking.
assert.equal(een([w('ah', [p({ prijsPerEenheid: 1 })], refs(2, 3))]).oordeel, 'onbekend');
assert.equal(een([w('ah', [p()], [p({ id: 'r', prijsPerEenheid: 2 })])]).vergelijking, null);

// Binnen 5% van het goedkoopste is goed (niet beste), daarbuiten niet; gelijk aan het goedkoopste is beste.
assert.equal(een([w('ah', [p({ prijsPerEenheid: 1.05 })], refs(1, 2, 3))]).oordeel, 'goed');
assert.equal(een([w('ah', [p({ prijsPerEenheid: 1 })], refs(1, 2, 3))]).oordeel, 'beste');
// De kipbouten-case: 5,39 naast 5,46 per kg: de goedkoopste is beste, de ander goed.
const kip = [p({ id: 'k1', prijsPerEenheid: 5.39 }), p({ id: 'k2', merk: 'Pepsi', prijsPerEenheid: 5.46 })];
assert.deepEqual([een([w('ah', kip, refs(7, 8, 9))], 'k1').oordeel, een([w('ah', kip, refs(7, 8, 9))], 'k2').oordeel], ['beste', 'goed']);
assert.notEqual(een([w('ah', [p({ prijsPerEenheid: 1.06 })], refs(1, 2, 3))]).oordeel, 'goed');

// Huismerk goedkoper, met besparing in euro per kg/l.
a = een([w('ah', [p({ prijsPerEenheid: 2.5 })], [p({ id: 'r', titel: 'AH Cola', huismerk: true, prijsPerEenheid: 0.6 }), ...refs(3, 4)])]);
assert.equal(a.oordeel, 'huismerk-goedkoper'); assert.equal(a.besparing, 1.9); assert.equal(a.alternatief.titel, 'AH Cola');

// Merk goedkoper.
a = een([w('ah', [p({ prijsPerEenheid: 3 })], refs(2, 3.5, 4))]);
assert.equal(a.oordeel, 'merk-goedkoper'); assert.equal(a.besparing, 1);

// Over winkels heen, en een andere aanbieding telt ook als alternatief.
a = een([w('ah', [p({ prijsPerEenheid: 3 })]), w('dirk', [p({ id: 'y', huismerk: true, prijsPerEenheid: 1 }), p({ id: 'z', prijsPerEenheid: 2 }), p({ id: 'v', prijsPerEenheid: 2 })])]);
assert.equal(a.oordeel, 'huismerk-goedkoper'); assert.equal(a.alternatief.winkel, 'dirk');

// Alleen eigen niche is geen vergelijking: producten van dezelfde winkel en (huis)merk.
const eigen = [p({ id: 'a', merk: 'AH', huismerk: true, prijsPerEenheid: 1 }), p({ id: 'b', merk: 'AH', huismerk: true, prijsPerEenheid: 1 }),
  p({ id: 'c', merk: 'AH Biologisch', huismerk: true, prijsPerEenheid: 1 }), p({ id: 'd', merk: 'AH Liefde & Passie', huismerk: true, prijsPerEenheid: 1 })];
assert.equal(een([w('ah', [eigen[0]], eigen.slice(1))], 'a').oordeel, 'onbekend');
// Een ander merk bij dezelfde winkel telt wel.
assert.notEqual(een([w('ah', [eigen[0]], [...eigen.slice(1), p({ id: 'e', merk: 'Pepsi', prijsPerEenheid: 1 })])], 'a').oordeel, 'onbekend');

// Zichzelf (ook als referentie) is nooit het alternatief; id is per winkel uniek.
assert.equal(een([w('ah', [p()], [p()])]).oordeel, 'onbekend');
// Met >= 3 andere kandidaten bepaalt de uitsluiting de uitkomst: een oude kopie van zichzelf (zelfde id, goedkoper) mag niet het alternatief zijn.
a = een([w('ah', [p({ prijsPerEenheid: 3 })], [p({ prijsPerEenheid: 1 }), ...refs(2.5, 4, 5)])]);
assert.equal(a.oordeel, 'merk-goedkoper'); assert.equal(a.alternatief.id, 'r0'); assert.equal(a.besparing, 0.5);

// Onbekend: geen eenheidsprijs, andere categorie, andere eenheid.
assert.equal(een([w('ah', [p({ prijsPerEenheid: null })], refs(1, 2, 3))]).oordeel, 'onbekend');
assert.equal(een([w('ah', [p()], refs(1, 2, 3).map((r) => ({ ...r, categorie: 'Overig' })))]).oordeel, 'onbekend');
assert.equal(een([w('ah', [p()], refs(1, 2, 3).map((r) => ({ ...r, eenheid: 'kg' })))]).oordeel, 'onbekend');

// Categorie 'overig' (elke schrijfwijze, ook leeg) is geen echte smalle categorie: nooit een vergelijking op categorie.
for (const c of ['Overig', ' OVERIG ', '', null]) {
  a = een([w('ah', [p({ categorie: c })], refs(1, 2, 3).map((r) => ({ ...r, categorie: c })))]);
  assert.equal(a.oordeel, 'onbekend', 'overig als categorie: ' + c); assert.equal(a.vergelijking, null);
}
// ... maar wel via de familie als die er is.
a = een([w('ah', [p({ categorie: 'Overig', titel: 'Goudse kaas 48+', eenheid: 'kg', prijsPerEenheid: 12 })], [8, 9, 10].map((n) => p({ id: 'k' + n, categorie: 'Overig', titel: 'Jonge kaas ' + n, eenheid: 'kg', merk: 'X', prijsPerEenheid: n })))]);
assert.equal(a.vergelijking, 'familie'); assert.equal(a.oordeel, 'merk-goedkoper'); assert.equal(a.alternatief.id, 'k8');

// Plausibiliteitsgrens: een alternatief van minder dan 20% van de prijs per eenheid is geen vergelijkbaar product.
assert.equal(MIN_VERHOUDING, 0.2);
a = een([w('ah', [p({ prijsPerEenheid: 1250 })], [p({ id: 'zout', prijsPerEenheid: 0.75, merk: 'X' }), ...refs(1000, 1100, 1300)])]);
assert.equal(a.alternatief.id, 'r0'); assert.equal(a.besparing, 250); // niet 1249.25 t.o.v. het zout
assert.equal(een([w('ah', [p({ prijsPerEenheid: 375 })], [p({ id: 'spray', prijsPerEenheid: 3.6, merk: 'X' }), ...refs(1, 2, 3)])]).oordeel, 'onbekend'); // alleen implausibele alternatieven
assert.equal(een([w('ah', [p({ prijsPerEenheid: 5 })], refs(1, 2, 3))]).oordeel, 'merk-goedkoper'); // precies op de grens (1 = 20%) telt wel mee

// Verlopen aanbiedingen (geldigTot voor vandaag) worden niet getoond en zijn geen alternatief; vandaag zelf geldt nog.
const mx = (id, geldigTot, o = {}) => p({ id, geldigTot, merk: 'Z', ...o });
let uit = beoordeel([w('ah', [mx('oud', '2026-10-10'), mx('vandaag', '2026-10-11'), mx('zonder', null)])], '2026-10-11');
assert.deepEqual(uit.map((x) => x.id), ['vandaag', 'zonder']);
a = beoordeel([w('ah', [p({ prijsPerEenheid: 3 }), mx('oud', '2026-10-10', { prijsPerEenheid: 1 }), mx('n1', null, { prijsPerEenheid: 2 }), mx('n2', null, { prijsPerEenheid: 2.5 }), mx('n3', null, { prijsPerEenheid: 2.6 })])], '2026-10-11').find((x) => x.id === 'x');
assert.equal(a.alternatief.id, 'n1');
// Prijs >= normaalprijs is geen aanbieding (ook niet als alternatief).
assert.deepEqual(beoordeel([w('ah', [mx('gelijk', null, { prijs: 2, normaalPrijs: 2 }), mx('goed', null, { prijs: 1, normaalPrijs: 2 })])]).map((x) => x.id), ['goed']);

// Boon's: de invoer met de laatste geldigTot wint, niet het hoogste weeknummer (jaarwisseling).
assert.equal(kiesInvoer([{ naam: 'boons-w52.json', inv: { geldigTot: '2026-12-27' } }, { naam: 'boons-w1.json', inv: { geldigTot: '2027-01-03' } }]).naam, 'boons-w1.json');
assert.throws(() => kiesInvoer([]));
// Een waarschuwing in een winkelbestand komt in de waarschuwingen van leesWinkels (en dus op de pagina).
const tmp = mkdtempSync(join(tmpdir(), 'sa-test-'));
writeFileSync(join(tmp, 'boons.json'), JSON.stringify({ winkel: 'boons', naam: "Boon's Markt", gemaakt: new Date().toISOString(), waarschuwing: 'folder is verlopen', aanbiedingen: [] }));
const lw = leesWinkels(tmp);
assert.equal(lw.winkels.length, 1); assert.ok(lw.waarschuwingen.some((x) => x.includes('folder is verlopen')));
// Lock: tweede poging mislukt, een stale lock (> 10 min) wordt overgenomen.
const lock = join(tmp, 'vergelijk.lock');
assert.equal(pakLock(lock), true); assert.equal(pakLock(lock), false);
assert.equal(pakLock(lock, Date.now() + LOCK_STALE_MS + 60e3), true);
rmSync(tmp, { recursive: true, force: true });

// Jumbo: 'Gratis ... OP=OP' zonder korting is geen aanbieding; met echte korting of zonder Gratis wel.
assert.equal(isGratisCadeauZonderKorting({ mechanisme: 'Gratis glas bij 2 Leffe Packs, Alleen online - OP=OP', prijs: 6.65, normaalPrijs: 6.65 }), true);
assert.equal(isGratisCadeauZonderKorting({ mechanisme: 'Gratis lepelsetje, Alleen online - OP=OP', prijs: 10, normaalPrijs: 13.79 }), false);
assert.equal(isGratisCadeauZonderKorting({ mechanisme: '1+1 gratis', prijs: 1, normaalPrijs: 2 }), false);
assert.equal(isGratisCadeauZonderKorting({ mechanisme: null, prijs: 2, normaalPrijs: 2 }), false);

// Categorie is hoofdletterongevoelig; referenties zonder eenheidsprijs tellen niet mee.
assert.equal(een([w('ah', [p({ prijsPerEenheid: 3 })], [...refs(1, 2, 3).map((r) => ({ ...r, categorie: ' cola ' })), p({ id: 's', prijsPerEenheid: null })])]).oordeel, 'merk-goedkoper');

// Familie-terugval: smalle categorie te klein, dan de grove familie (cola in meerdere winkelcategorieen).
a = een([w('ah', [p({ categorie: 'Cola zero', prijsPerEenheid: 3 })], [p({ id: 'r1', categorie: 'Cola regular', merk: 'Pepsi', prijsPerEenheid: 1.6 }), p({ id: 'r2', categorie: 'Cola regular', merk: 'Pepsi', prijsPerEenheid: 2 }), p({ id: 'r3', categorie: 'Cola light', merk: 'Pepsi', prijsPerEenheid: 2 })])]);
assert.equal(a.vergelijking, 'familie'); assert.equal(a.familie, 'Cola'); assert.equal(a.oordeel, 'merk-goedkoper'); assert.equal(a.alternatief.id, 'r1');

// Per stuk alleen waar dat zinvol is: een brood wel, een kaars niet.
const stuk = (o) => p({ eenheid: 'stuk', ...o });
a = een([w('ah', [stuk({ categorie: 'Kaarsen', prijsPerEenheid: 3 })], [1, 2, 3].map((n) => stuk({ id: 'r' + n, categorie: 'Kaarsen', merk: 'X', prijsPerEenheid: n })))]);
assert.equal(a.oordeel, 'onbekend');

// De brood-case: AH OerDesem (per stuk, eigen niche van AH-broden) is niet 'goed' maar heeft een goedkoper heel brood als alternatief;
// een half brood en een broodje tellen niet mee.
const brood = (id, titel, categorie, pr, o = {}) => ({ id, titel, merk: 'AH', huismerk: true, categorie, eenheid: 'stuk', prijs: pr, prijsPerEenheid: pr, ...o });
const oer = [1, 2, 3, 4].map((n) => brood('o' + n, 'AH OerDesem meergranen heel gesneden ' + n, 'Desembrood bruin, volkoren, spelt', 1.99));
const ahRef = [brood('t', 'AH Tijger volkoren heel', 'Bakkersbrood volkoren', 1.49), brood('h', 'AH Rond volkoren half', 'Bakkersbrood volkoren', 0.99),
  brood('b', 'AH Bakkersbroodje bastille', 'Bakkersbrood volkoren', 0.65), brood('t2', 'AH Tijger wit heel', 'Bakkersbrood wit', 1.99)];
const boons = w('boons', [{ id: 'v', titel: 'Vloerbrood of rondbrood', merk: 'Boonacker', huismerk: false, categorie: 'Brood en gebak', eenheid: 'stuk', prijs: 1.99, prijsPerEenheid: 1.99 }]);
a = een([w('ah', oer, ahRef), boons], 'o1');
assert.notEqual(a.oordeel, 'goed'); assert.equal(a.oordeel, 'huismerk-goedkoper'); assert.equal(a.vergelijking, 'familie');
assert.equal(a.alternatief.id, 't'); assert.equal(a.besparing, 0.5); assert.equal(a.familie, 'Brood');
// Zonder goedkoper heel brood is het 'goed' (echte vergelijking, ander merk aanwezig); zonder ander merk of winkel blijft het 'onbekend'.
assert.equal(een([w('ah', oer, ahRef.map((r) => ({ ...r, prijsPerEenheid: 1.99, prijs: 1.99 }))), boons], 'o1').oordeel, 'beste'); // gelijk aan het goedkoopste
assert.equal(een([w('ah', oer, ahRef.map((r) => ({ ...r, prijsPerEenheid: 1.99, prijs: 1.99 })))], 'o1').oordeel, 'onbekend');

// Families: grove indeling uit categorie + titel.
const fam = (categorie, titel = 'x') => familieVan({ categorie, titel });
assert.equal(fam('Desembrood bruin, volkoren, spelt', 'AH OerDesem spelt gesneden'), 'brood');
assert.equal(fam('Jonge kaas (plakken)'), 'kaas');
assert.equal(fam('Cola zero, suikervrij, light'), 'cola');
assert.equal(fam('Rundergehakt'), 'gehakt');
assert.equal(fam('Halfvolle melk'), 'melk');
assert.equal(fam('Tomatensoep in zak'), 'soep'); // geen groente
assert.equal(fam('Kipsalade'), 'salades'); // geen kip
assert.equal(fam('Overig', 'Goudse kaas 48+'), 'kaas'); // vage categorie: titel beslist
assert.equal(fam('Wit', 'Ariel Waspoeder Original'), 'wasmiddel'); // vage categorie per winkel
assert.equal(fam('Tuinmeubelen', 'Keter'), null); // grabbelbak: geen familie
assert.equal(fam('Bakkersbrood volkoren', 'AH Rond volkoren half'), 'brood-half');
assert.equal(fam('Brood en gebak', 'New York style cheesecake'), 'koek');
assert.equal(familieNaam('douche-zeep'), 'Douche en zeep'); assert.equal(familieNaam(null), 'Overig');

// De familie zit in elke aanbieding (nette naam, 'Overig' zonder) en in de compacte vorm.
a = beoordeel([w('ah', [p({ id: 'k', categorie: 'Jonge kaas (plakken)', eenheid: 'kg' }), p({ id: 'm', categorie: 'Tuinmeubelen', eenheid: 'kg' })])]);
assert.equal(a[0].familie, 'Kaas'); assert.equal(a[1].familie, 'Overig');
assert.deepEqual(inkort(a).aanbiedingen.map((x) => x.familie), ['Kaas', 'Overig']);

// Robuust: ontbrekende winkels en rommel.
assert.deepEqual(beoordeel([]), []);
assert.deepEqual(beoordeel([w('ah', [null, { titel: 'zonder prijs' }])]), []);
const ontbreekt = leesWinkels('bestaat-niet');
assert.equal(ontbreekt.winkels.length, 0); assert.equal(ontbreekt.waarschuwingen.length, 1);

// De fixtures leveren een mix van oordelen, en per product het verwachte oordeel (een verwisseling van oordelen valt dan op).
const fx = leesWinkels(join(dirname(fileURLToPath(import.meta.url)), 'fixtures'), false);
assert.equal(fx.winkels.length, 2);
const fxUit = beoordeel(fx.winkels);
const tel = new Set(fxUit.map((x) => x.oordeel));
for (const o of ['beste', 'goed','huismerk-goedkoper', 'merk-goedkoper', 'onbekend']) assert.ok(tel.has(o), 'fixtures missen ' + o);
const fxOordeel = (winkel, id) => fxUit.find((x) => x.winkel === winkel && x.id === id).oordeel;
assert.deepEqual(['a1', 'a5', 'a7', 'a3'].map((id) => fxOordeel('ah', id)), ['huismerk-goedkoper', 'merk-goedkoper', 'goed', 'onbekend']);
assert.deepEqual(['d6', 'd11', 'd3', 'd1'].map((id) => fxOordeel('dirk', id)), ['beste', 'beste', 'huismerk-goedkoper', 'onbekend']);
// Invarianten van het contract: beste/goed hebben geen alternatief en geen besparing, onbekend geen vergelijking.
for (const x of fxUit) {
  if (x.oordeel === 'beste' || x.oordeel === 'goed') { assert.equal(x.alternatief, null); assert.equal(x.besparing, 0); }
  if (x.oordeel === 'onbekend') assert.equal(x.vergelijking, null);
  else assert.ok(x.vergelijking === 'categorie' || x.vergelijking === 'familie');
}

// online-vlag: blijft in de compacte vorm als true, ontbreekt anders.
{
  const uit = inkort(beoordeel([w('ah', [p({ id: 'on', titel: 'on', online: true }), p({ id: 'of', titel: 'of' })])]));
  assert.equal(uit.aanbiedingen.find((x) => x.titel === 'on').online, true);
  assert.equal(uit.aanbiedingen.filter((x) => x.online).length, 1);
}

// Een alleen-online alternatief blijft kandidaat, maar de kaart moet het kunnen tonen: online zit in het alternatief.
{
  const o = beoordeel([w('ah', [p({ id: 'a', titel: 'a', prijsPerEenheid: 3 })], [...refs(2, 4, 5), p({ id: 'on', titel: 'on', merk: 'X', prijsPerEenheid: 1, online: true })])]).find((x) => x.id === 'a');
  assert.equal(o.alternatief.id, 'on'); assert.equal(o.alternatief.online, true);
  assert.equal(inkort([o]).alternatieven[0].online, true);
}

// Familie-terugval gebruikt een strengere plausibiliteitsgrens (0,5) dan de categorie (0,2): pesto 25 vs lasagne 5 is geen alternatief.
assert.equal(MIN_VERHOUDING_FAMILIE, 0.5);
const colaRefs = (...prijzen) => prijzen.map((pr, i) => p({ id: 'c' + i, categorie: 'Cola regular ' + i, merk: 'Pepsi', prijsPerEenheid: pr }));
a = een([w('ah', [p({ categorie: 'Cola zero', prijsPerEenheid: 3 })], colaRefs(0.9, 1, 1.2))]); // 0,3-0,4x: via familie niet plausibel
assert.equal(a.oordeel, 'onbekend'); assert.equal(a.vergelijking, null);
a = een([w('ah', [p({ categorie: 'Cola zero', prijsPerEenheid: 3 })], colaRefs(1.6, 2, 2.5))]); // >= 0,5x telt wel
assert.equal(a.vergelijking, 'familie'); assert.equal(a.alternatief.id, 'c0');
// De categorie wint van de familie als die zelf genoeg kandidaten heeft; zonder familie geen terugval.
a = een([w('ah', [p({ categorie: 'Cola zero', prijsPerEenheid: 3 })], [...refs(2, 3.5, 4).map((r) => ({ ...r, categorie: 'Cola zero' })), ...colaRefs(0.1)])]);
assert.equal(a.vergelijking, 'categorie'); assert.equal(a.alternatief.id, 'r0');
a = een([w('ah', [p({ categorie: 'Tuinmeubelen', prijsPerEenheid: 3 })], refs(1, 2, 2.5).map((r) => ({ ...r, categorie: 'Overig' })))]);
assert.equal(a.oordeel, 'onbekend'); assert.equal(a.vergelijking, null);

// Zelf-uitsluiting en drempel: aanbieding + 2 referenties = 2 kandidaten = onbekend; 3 kandidaten waarvan 1 implausibel = 2 over = onbekend.
assert.equal(een([w('ah', [p()], refs(2, 3))]).oordeel, 'onbekend');
assert.equal(een([w('ah', [p({ prijsPerEenheid: 100 })], refs(1, 50, 60))]).oordeel, 'onbekend');
assert.equal(een([w('ah', [p({ prijsPerEenheid: 100 })], refs(30, 50, 60))]).oordeel, 'merk-goedkoper');

// Per stuk: brood vergelijkt over de familie (zie de brood-case), groente en fruit alleen binnen dezelfde categorie.
{
  const fruit = (id, cat, titel, pr, o = {}) => stuk({ id, categorie: cat, titel, merk: 'X', prijsPerEenheid: pr, prijs: pr, ...o });
  const bananen = [fruit('b1', 'Bananen', 'Bananen los', 0.4), fruit('b2', 'Bananen', 'Bananen bio', 0.45), fruit('b3', 'Bananen', 'Bananen fair', 0.5)];
  assert.equal(een([w('ah', [fruit('x', 'Ananas', 'Ananas', 2)], bananen)]).oordeel, 'onbekend'); // ananas vs bananen: andere categorie
  a = een([w('ah', [fruit('x', 'Bananen', 'Bananen kleine tros', 0.8, { merk: 'Chiquita' })], bananen)]);
  assert.equal(a.oordeel, 'merk-goedkoper'); assert.equal(a.vergelijking, 'categorie'); // dezelfde categorie telt wel
}

// Eenheid: spelling wordt rechtgezet (KG, ltr, Stuks), al het andere wordt null met een waarschuwing.
assert.deepEqual(['KG', ' kg ', 'ltr', 'Liter', 'l', 'Stuks', 'stuk', 'g', 'ml', '', 5, null].map(normEenheid), ['kg', 'kg', 'l', 'l', 'l', 'stuk', 'stuk', null, null, null, null, null]);
{
  const t3 = mkdtempSync(join(tmpdir(), 'sa-test3-'));
  writeFileSync(join(t3, 'x.json'), JSON.stringify({ winkel: 'x', naam: 'x', gemaakt: new Date().toISOString(), aanbiedingen: [p({ id: '1', eenheid: 'KG' }), p({ id: '2', eenheid: 'ml' })], referentie: [p({ id: '3', eenheid: 'ltr' })] }));
  const r = leesWinkels(t3);
  assert.deepEqual(r.winkels[0].aanbiedingen.map((x) => x.eenheid), ['kg', null]); assert.equal(r.winkels[0].referentie[0].eenheid, 'l');
  assert.ok(r.waarschuwingen.some((x) => x.includes('1 producten met een onbekende eenheid')));
  rmSync(t3, { recursive: true, force: true });
}

// Product zonder id sluit de rest van zijn winkel niet uit als kandidaat (objectidentiteit in plaats van undefined === undefined).
{
  const zonderId = (o) => p({ id: undefined, ...o });
  const o = beoordeel([w('ah', [zonderId({ titel: 'a', prijsPerEenheid: 1 })], [zonderId({ titel: 'r1', merk: 'Pepsi', prijsPerEenheid: 2 }), zonderId({ titel: 'r2', merk: 'Pepsi', prijsPerEenheid: 3 }), zonderId({ titel: 'r3', merk: 'Pepsi', prijsPerEenheid: 4 })])]);
  assert.equal(o[0].oordeel, 'beste');
}

// Online: een online-aanbieding krijgt gewoon een oordeel, en de vlag blijft in de uitvoer.
a = een([w('ah', [p({ online: true, prijsPerEenheid: 1 })], refs(2, 3, 4))]);
assert.equal(a.oordeel, 'beste'); assert.equal(a.online, true);

// Rommel in de prijzen: 0, negatief, NaN en strings worden nooit getoond of kandidaat (string-eenheidsprijs "1,25" evenmin).
for (const pr of [0, -1, NaN, '1,25', null]) assert.deepEqual(beoordeel([w('ah', [p({ prijs: pr })], refs(1, 2, 3))]), [], 'prijs ' + pr);
assert.equal(een([w('ah', [p({ prijsPerEenheid: 3 })], [...refs(1, 2), p({ id: 's', merk: 'Pepsi', prijsPerEenheid: '0,5' })])]).oordeel, 'onbekend'); // de string-kandidaat telt niet
assert.deepEqual(beoordeel([w('ah', [p({ categorie: null, titel: 'Tuinstoel' })], refs(1, 2, 3).map((r) => ({ ...r, categorie: null, titel: 'Kruk' })))]).map((x) => x.oordeel), ['onbekend']); // geen categorie en geen familie

// geldigTot in een ander formaat dan jjjj-mm-dd verdwijnt als string-vergelijking stil: zo'n datum is geen verlopen datum.
// (leesWinkels waarschuwt ervoor, zie hieronder)
{
  const t2 = mkdtempSync(join(tmpdir(), 'sa-test2-'));
  const sw = (winkel, o) => writeFileSync(join(t2, winkel + '.json'), JSON.stringify({ winkel, naam: winkel, aanbiedingen: [], ...o }));
  sw('zonder', {}); // geen gemaakt: waarschuwing
  sw('kapot', { gemaakt: 'geen datum' }); // ongeldige datum: waarschuwing
  sw('vers', { gemaakt: new Date().toISOString() }); // goed: geen waarschuwing
  sw('oud', { gemaakt: new Date(Date.now() - 72 * 3600e3).toISOString() });
  const r = leesWinkels(t2);
  const wrn = (n) => r.waarschuwingen.filter((x) => x.startsWith(n + ':'));
  assert.equal(wrn('zonder').length, 1); assert.equal(wrn('kapot').length, 1); assert.equal(wrn('oud').length, 1); assert.equal(wrn('vers').length, 0);
  rmSync(t2, { recursive: true, force: true });
}

console.log('test.mjs: alles ok');
