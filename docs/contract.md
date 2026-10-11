# Contract tussen verzamelaars, samenvoeger en pagina

Node 22 ES modules, geen dependencies. Dutch UI. Geld in euro's als getal, datums `YYYY-MM-DD`.

## Verzamelaar -> `data/<winkel>.json`

Eén bestand per winkel (`winkels/<winkel>.mjs` schrijft het; `winkel` = `ah`, `dirk`, ...):

```json
{
  "winkel": "ah",
  "naam": "Albert Heijn",
  "gemaakt": "2026-10-11T08:00:00.000Z",
  "aanbiedingen": [ Product ],
  "referentie": [ Product ]
}
```

`aanbiedingen` = producten die nu in de aanbieding zijn. `referentie` = gewone (niet-aanbieding) producten uit
dezelfde categorieen, alleen bedoeld om mee te vergelijken (huismerk en merk), zonder `aanbieding`-velden.

Product:

| veld | type | betekenis |
| --- | --- | --- |
| `id` | string | stabiel per winkel |
| `titel` | string | |
| `merk` | string/null | |
| `huismerk` | boolean | eigen merk van de winkel |
| `categorie` | string | zo specifiek als de winkel geeft (bv. "Cola regular"); vergelijking gebeurt hierop |
| `inhoud` | string/null | zoals de winkel het toont ("12 x 0,33 l") |
| `eenheid` | `"kg"` / `"l"` / `"stuk"` / null | waarop `prijsPerEenheid` slaat |
| `prijs` | number | huidige prijs voor de verpakking (aanbiedingsprijs bij een aanbieding) |
| `normaalPrijs` | number/null | prijs zonder aanbieding |
| `prijsPerEenheid` | number/null | euro per kg of l bij `prijs`; null als niet te bepalen |
| `normaalPerEenheid` | number/null | euro per kg of l zonder aanbieding |
| `mechanisme` | string/null | "2e halve prijs", "2 voor 5,00", "25% korting" |
| `geldigTot` | string/null | laatste dag van de aanbieding |
| `afbeelding` | string/null | https-url |

Geef `prijsPerEenheid` zelf door als de winkel hem levert; zo niet, reken hem uit de inhoud. Bij meervoudsaanbiedingen
("2 voor 5,00") is `prijsPerEenheid` de effectieve prijs per kg/l bij afname van de actie.

## Samenvoeger -> `data/aanbiedingen.json` (`vergelijk.mjs`)

Leest alle `data/<winkel>.json`, geeft elke aanbieding een `oordeel` en `alternatief`:

```json
{ "gemaakt": "...", "winkels": [{"id":"ah","naam":"Albert Heijn"}], "aanbiedingen": [ Product + {
  "winkel": "ah", "oordeel": "beste|goed|huismerk-goedkoper|merk-goedkoper|onbekend", "familie": "Brood", "vergelijking": "categorie|familie|null",
  "alternatief": { "winkel":"ah","titel":"...","merk":"...","huismerk":true,"prijsPerEenheid":1.2 } | null,
  "besparing": 0.35 } ] }
```

Regel (`beoordeel` in `vergelijk.mjs`, families in `familie.mjs`): vergelijk `prijsPerEenheid` op dezelfde `eenheid`.
1. Elk product krijgt een grove **familie** (brood, kaas, melk, cola, ...) uit categorie + titel (trefwoorden, eerste treffer wint;
   grabbelbakken als non-food en maaltijden krijgen geen familie, 'Overig' op de pagina).
2. Kandidaten = referentie + alle aanbiedingen (alle winkels, behalve de aanbieding zelf). Eerste keus: dezelfde winkelcategorie.
   Alleen als daar niet **genoeg** is (>= 3 kandidaten en minstens een van een andere winkel of een ander merk; alle huismerken
   van een winkel tellen als een merk) wordt de hele familie genomen (`vergelijking: "familie"`, anders `"categorie"`).
3. `beste` = er is genoeg vergelijking en de aanbieding is het goedkoopste (of gelijk eraan); `goed` = idem maar tot 5% duurder dan het
   goedkoopste (de pagina sorteert `beste` boven `goed`); anders `huismerk-goedkoper` als het goedkoopste
   een huismerk is, anders `merk-goedkoper` (met `alternatief` en `besparing` = euro per kg/l verschil). `onbekend` (pagina: 'Geen goede
   vergelijking', `vergelijking: null`) zonder eenheidsprijs of zonder genoeg vergelijking; `beste` en `goed` hebben nooit een alternatief.
4. Eenheid `stuk` wordt alleen vergeleken in families waar dat zinvol is (brood, broodjes, eieren, groente, fruit); een half brood is een
   eigen familie. Verder gaat het om gewichtprijs (kg/l); per stuk zonder zinvolle familie is `onbekend`.

`familie` (nette naam, bv. "Brood", "Overig") en `vergelijking` staan in de volledige vorm; `familie` ook in de compacte vorm.

## Pagina

`serve.mjs` serveert `build/` op 127.0.0.1:**8092** (8090 is growatt), alleen loopback; later tailscale https :8445.
`index.html` is statisch en haalt `aanbiedingen.json` op (fetch); beide worden door `sw.js` gecachet. `serve.mjs` levert
de vooraf gemaakte `.gz` als de browser gzip accepteert. Filter op winkel (knoppen, meerkeuze), op oordeel, op familie (dropdown met aantallen, onthouden in localStorage), zoekveld;
sorteren op besparing/prijs per kg-l. De lijst toont 60 kaarten per keer ('Toon meer').

### `build/aanbiedingen.json` (compacte vorm voor de pagina)

`data/aanbiedingen.json` houdt de volledige vorm hierboven; `build/aanbiedingen.json` (`inkort()` in `vergelijk.mjs`) is:

```json
{ "gemaakt": "...", "fixtures": false, "fout": "waarschuwingen of ''", "winkels": [{"id":"ah","naam":"..."}],
  "alternatieven": [ {"winkel":"ah","titel":"...","prijsPerEenheid":1.2,"huismerk":true} ],
  "afbeeldingen": { "ah": {"voor":"https://static.ah.nl/dam/product/","na":"?revLabel=1&..."} },
  "aanbiedingen": [ {"winkel","titel","prijs","oordeel","familie", + alleen aanwezige: merk, categorie, inhoud, eenheid, normaalPrijs,
    prijsPerEenheid, mechanisme, geldigTot, afbeelding, besparing, alternatief} ] }
```

`alternatief` is een index in `alternatieven`. `afbeelding` is `voor + waarde + na` als de waarde niet met `https://` begint
(per winkel het gemeenschappelijke begin/einde eraf). Weggelaten: `id`, `huismerk`, `normaalPerEenheid`, null/0/false-velden.
