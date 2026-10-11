// Controleert de oordeelslogica van vergelijk.mjs. Gebruik: node test.mjs
import assert from 'node:assert/strict';
import { beoordeel, leesWinkels } from './vergelijk.mjs';

const p = (o) => ({ id: 'x', titel: 't', merk: null, huismerk: false, categorie: 'Cola', eenheid: 'l', prijs: 1, prijsPerEenheid: 1, ...o });
const w = (winkel, aanbiedingen, referentie = []) => ({ winkel, naam: winkel, aanbiedingen, referentie });
const een = (winkels, id = 'x') => beoordeel(winkels).find((a) => a.id === id);

// Goedkoopste in de categorie = goed, ook als er alleen een duurder referentieproduct is.
let a = een([w('ah', [p({ prijsPerEenheid: 1 })], [p({ id: 'r', prijsPerEenheid: 2 })])]);
assert.equal(a.oordeel, 'goed'); assert.equal(a.alternatief, null); assert.equal(a.besparing, 0);

// Binnen 5% is nog goed, daarbuiten niet.
assert.equal(een([w('ah', [p({ prijsPerEenheid: 1.05 })], [p({ id: 'r', prijsPerEenheid: 1 })])]).oordeel, 'goed');
assert.notEqual(een([w('ah', [p({ prijsPerEenheid: 1.06 })], [p({ id: 'r', prijsPerEenheid: 1 })])]).oordeel, 'goed');

// Huismerk goedkoper, met besparing in euro per kg/l.
a = een([w('ah', [p({ prijsPerEenheid: 2.5 })], [p({ id: 'r', titel: 'AH Cola', huismerk: true, prijsPerEenheid: 0.6 })])]);
assert.equal(a.oordeel, 'huismerk-goedkoper'); assert.equal(a.besparing, 1.9); assert.equal(a.alternatief.titel, 'AH Cola');

// Merk goedkoper.
a = een([w('ah', [p({ prijsPerEenheid: 3 })], [p({ id: 'r', merk: 'Pepsi', prijsPerEenheid: 2 })])]);
assert.equal(a.oordeel, 'merk-goedkoper'); assert.equal(a.besparing, 1);

// Over winkels heen, en een andere aanbieding telt ook als alternatief.
a = een([w('ah', [p({ prijsPerEenheid: 3 })]), w('dirk', [p({ id: 'y', huismerk: true, prijsPerEenheid: 1 })])]);
assert.equal(a.oordeel, 'huismerk-goedkoper'); assert.equal(a.alternatief.winkel, 'dirk');

// Zichzelf (ook als referentie) is nooit het alternatief; id is per winkel uniek.
assert.equal(een([w('ah', [p()], [p()])]).oordeel, 'onbekend');
assert.equal(een([w('ah', [p({ prijsPerEenheid: 3 })]), w('dirk', [p({ prijsPerEenheid: 1 })])], 'x').oordeel, 'merk-goedkoper');

// Onbekend: geen eenheidsprijs, andere categorie, andere eenheid, of niets om mee te vergelijken.
assert.equal(een([w('ah', [p({ prijsPerEenheid: null })], [p({ id: 'r' })])]).oordeel, 'onbekend');
assert.equal(een([w('ah', [p()], [p({ id: 'r', categorie: 'Sap', prijsPerEenheid: 0.1 })])]).oordeel, 'onbekend');
assert.equal(een([w('ah', [p()], [p({ id: 'r', eenheid: 'kg', prijsPerEenheid: 0.1 })])]).oordeel, 'onbekend');
assert.equal(een([w('ah', [p()])]).oordeel, 'onbekend');

// Categorie is hoofdletterongevoelig; referenties zonder eenheidsprijs tellen niet mee.
assert.equal(een([w('ah', [p({ prijsPerEenheid: 3 })], [p({ id: 'r', categorie: ' cola ', prijsPerEenheid: 1 }), p({ id: 's', prijsPerEenheid: null })])]).oordeel, 'merk-goedkoper');

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
