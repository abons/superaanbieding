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
  "winkel": "ah", "oordeel": "goed|huismerk-goedkoper|merk-goedkoper|onbekend",
  "alternatief": { "winkel":"ah","titel":"...","merk":"...","huismerk":true,"prijsPerEenheid":1.2 } | null,
  "besparing": 0.35 } ] }
```

Regel: vergelijk `prijsPerEenheid` met het goedkoopste product in dezelfde `categorie` en `eenheid` (referentie + andere
aanbiedingen; alleen dezelfde winkel is te streng, over winkels heen is toegestaan en wordt als `alternatief.winkel` getoond).
`goed` = aanbieding is (bijna) het goedkoopst (binnen 5%); anders `huismerk-goedkoper` als het alternatief huismerk is,
anders `merk-goedkoper`; `onbekend` zonder eenheidsprijs of vergelijkbaar product. `besparing` = euro per kg/l verschil.

## Pagina

`serve.mjs` serveert `build/` op 127.0.0.1:**8092** (8090 is growatt), alleen loopback; later tailscale https :8445.
`index.html` is statisch en haalt `aanbiedingen.json` op (fetch); beide worden door `sw.js` gecachet. `serve.mjs` levert
de vooraf gemaakte `.gz` als de browser gzip accepteert. Filter op winkel (knoppen, meerkeuze), op oordeel, zoekveld;
sorteren op besparing/prijs per kg-l. De lijst toont 60 kaarten per keer ('Toon meer').

### `build/aanbiedingen.json` (compacte vorm voor de pagina)

`data/aanbiedingen.json` houdt de volledige vorm hierboven; `build/aanbiedingen.json` (`inkort()` in `vergelijk.mjs`) is:

```json
{ "gemaakt": "...", "fixtures": false, "fout": "waarschuwingen of ''", "winkels": [{"id":"ah","naam":"..."}],
  "alternatieven": [ {"winkel":"ah","titel":"...","prijsPerEenheid":1.2,"huismerk":true} ],
  "afbeeldingen": { "ah": {"voor":"https://static.ah.nl/dam/product/","na":"?revLabel=1&..."} },
  "aanbiedingen": [ {"winkel","titel","prijs","oordeel", + alleen aanwezige: merk, categorie, inhoud, eenheid, normaalPrijs,
    prijsPerEenheid, mechanisme, geldigTot, afbeelding, besparing, alternatief} ] }
```

`alternatief` is een index in `alternatieven`. `afbeelding` is `voor + waarde + na` als de waarde niet met `https://` begint
(per winkel het gemeenschappelijke begin/einde eraf). Weggelaten: `id`, `huismerk`, `normaalPerEenheid`, null/0/false-velden.
