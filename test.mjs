// Controleert de oordeelslogica van vergelijk.mjs en de families van familie.mjs. Gebruik: node test.mjs
import assert from 'node:assert/strict';
import { beoordeel, inkort, leesWinkels } from './vergelijk.mjs';
import { familieVan, familieNaam } from './familie.mjs';

const p = (o) => ({ id: 'x', titel: 't', merk: null, huismerk: false, categorie: 'Cola', eenheid: 'l', prijs: 1, prijsPerEenheid: 1, ...o });
const w = (winkel, aanbiedingen, referentie = []) => ({ winkel, naam: winkel, aanbiedingen, referentie });
const een = (winkels, id = 'x') => beoordeel(winkels).find((a) => a.id === id);
// Drie referenties van een ander merk: genoeg voor een echte vergelijking.
const refs = (...prijzen) => prijzen.map((pr, i) => p({ id: 'r' + i, merk: 'Pepsi', prijsPerEenheid: pr }));

// Goedkoopste in de categorie met genoeg kandidaten = goed.
let a = een([w('ah', [p({ prijsPerEenheid: 1 })], refs(2, 3, 4))]);
assert.equal(a.oordeel, 'goed'); assert.equal(a.alternatief, null); assert.equal(a.besparing, 0); assert.equal(a.vergelijking, 'categorie');

// Te weinig kandidaten (minder dan 3) = geen echte vergelijking.
assert.equal(een([w('ah', [p({ prijsPerEenheid: 1 })], refs(2, 3))]).oordeel, 'onbekend');
assert.equal(een([w('ah', [p()], [p({ id: 'r', prijsPerEenheid: 2 })])]).vergelijking, null);

// Binnen 5% is nog goed, daarbuiten niet.
assert.equal(een([w('ah', [p({ prijsPerEenheid: 1.05 })], refs(1, 2, 3))]).oordeel, 'goed');
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

// Onbekend: geen eenheidsprijs, andere categorie, andere eenheid.
assert.equal(een([w('ah', [p({ prijsPerEenheid: null })], refs(1, 2, 3))]).oordeel, 'onbekend');
assert.equal(een([w('ah', [p()], refs(1, 2, 3).map((r) => ({ ...r, categorie: 'Overig' })))]).oordeel, 'onbekend');
assert.equal(een([w('ah', [p()], refs(1, 2, 3).map((r) => ({ ...r, eenheid: 'kg' })))]).oordeel, 'onbekend');

// Categorie is hoofdletterongevoelig; referenties zonder eenheidsprijs tellen niet mee.
assert.equal(een([w('ah', [p({ prijsPerEenheid: 3 })], [...refs(1, 2, 3).map((r) => ({ ...r, categorie: ' cola ' })), p({ id: 's', prijsPerEenheid: null })])]).oordeel, 'merk-goedkoper');

// Familie-terugval: smalle categorie te klein, dan de grove familie (cola in meerdere winkelcategorieen).
a = een([w('ah', [p({ categorie: 'Cola zero', prijsPerEenheid: 3 })], [p({ id: 'r1', categorie: 'Cola regular', merk: 'Pepsi', prijsPerEenheid: 1 }), p({ id: 'r2', categorie: 'Cola regular', merk: 'Pepsi', prijsPerEenheid: 2 }), p({ id: 'r3', categorie: 'Cola light', merk: 'Pepsi', prijsPerEenheid: 2 })])]);
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
assert.equal(een([w('ah', oer, ahRef.map((r) => ({ ...r, prijsPerEenheid: 1.99, prijs: 1.99 }))), boons], 'o1').oordeel, 'goed');
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

// De fixtures leveren een mix van oordelen.
const fx = leesWinkels('fixtures', false);
assert.equal(fx.winkels.length, 2);
const tel = new Set(beoordeel(fx.winkels).map((x) => x.oordeel));
for (const o of ['goed', 'huismerk-goedkoper', 'merk-goedkoper', 'onbekend']) assert.ok(tel.has(o), 'fixtures missen ' + o);

console.log('test.mjs: alles ok');
