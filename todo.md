# todo — superaanbieding

Doel: huidige supermarkt-aanbiedingen tonen met oordeel (goede deal / huismerk of merk goedkoper per kg/l), filter op
supermarkt, familie en oordeel. Stand: AH, Dirk, Jumbo, Aldi, Lidl en Boon's (week 42) werken; PWA op :8092, tailscale :8445.

## Hier begint de volgende sessie

1. `Vocal/scripts/diensten.ps1` heeft sinds 2026-10-11 de rij "Superaanbieding" (8092, :8445, start zonder `--geen-ophalen`: echte run bij start, daarna samenvoegen elk uur en verzamelaars hoogstens elke 6 uur); nog niet gedraaid (Vocal-commit 2853cb7). Controleren na `diensten.ps1 -Actie herstart` en de bestaande taak bij inloggen (die roept `herstart` aan). `scripts/status-widget.ps1` heeft geen rij voor Superaanbieding (bewust?); `Stop-Alles` herkent 8092 aan `serve\.mjs`, net als growatt.
2. Boon's week 43 (en elke week), doen vanaf donderdag 2026-10-15 (een nieuwe folder verschijnt ongeveer donderdag voor de nieuwe week; W43 bestond op 2026-10-11 nog niet; nooit data verzinnen): nieuwe folder
   zoeken via `boonsmarkt.nl/folder` (locatie 26839); de FlippingBook-link `.../view/572493953/` is de **W42**-folder, W43 krijgt een andere id.
   Pagina's lezen naar `invoer/boons-w43.json` (formaat in kop van `winkels/boons.mjs`, voorbeeld `invoer/boons-w42.json`, geldigVan 2026-10-19,
   geldigTot 2026-10-25). `kiesInvoer` kiest sinds 2026-10-11 geen week met `geldigVan` in de toekomst, dus W43 mag vooraf klaar staan. Week 42 verloopt 2026-10-18; daarna toont de tool geen Boon's meer tot de nieuwe invoer er is.

## Openstaand

- Sorteren op grootste besparing zet kleine verpakkingen bovenaan (vanillestokje 318/kg = 0,64 per zakje): sorteren/tonen op besparing per verpakking (`besparing * prijs / prijsPerEenheid`; `pagina.html` sorteer-optie en kaarttekst, `docs/contract.md`, `test.mjs`).
- Kruiden hebben sinds 2026-10-11 geen familie-terugval meer (`GEEN_TERUGVAL` in `familie.mjs`); eventueel splitsen in enkel kruid, kruidenmix en zout/Aromat/vetsin. Grabbel-categorieën 'Overige ...' tellen niet meer als categorie-vergelijking.
- Deelfamilies (2026-10-11, `familie.mjs`) zijn nog grof: Knorr-sauzen tegenover pastasaus, plantaardige plakken en `kaas-snack`-regels (gewone `blokjes` zijn dichter bij plakken dan bij hapjes) niet op echte data nagelopen; steekproeven op `vergelijking: "familie"` herhalen, na een verse `node vergelijk.mjs`.
- Boon's-aanbiedingen zonder `normaalPrijs` én zonder mechanisme zijn niet te onderscheiden van een gewone prijs en kunnen toch `beste`/`huismerk-goedkoper` krijgen (`docs/besluiten/zonder-normaalprijs.md`): filteren op mechanisme of per winkel overwegen.
- Een mislukte referentie-categorie geeft een waarschuwing, maar `vergelijk.mjs` weet niet welke ontbreekt (vals `beste`/`goed` mogelijk); producten uit het vorige `data/<winkel>.json` hergebruiken is de betere oplossing.
- `nietVoor` (foutpauze in `serve.mjs`) staat alleen in het geheugen: na een herstart wordt een winkel die op 429 zit meteen opnieuw geraakt; persisteren in `data/`.
- Online-multipacks: "N flessen" wijn zonder volume-voordeel blijft `stuk`; N x 0,75 l overwegen. 45 groente/fruit-aanbiedingen met "N-pack" verloren hun stukprijs (pakmaat onbekend).
- Plus ontbreekt bewust (besluit 2026-10-11, `docs/bronnen.md`); nog niet onderzocht: folder-aggregators (folderz.nl) voor Plus. Heroverwegen bij een open feed of toestemming.
- Mobiele layout (390 px) niet op een echte telefoon bekeken; filterrij controleren op de Motorola.
- Huismerklijsten Dirk (Silvo, Bits & Bites, Derlon) niet online te bevestigen (dirk.nl/dirk-merken noemt ze niet; 2026-10-11 bewust behouden: alleen bij Dirk in data); Daily Chef is een gedeeld merk en sinds 2026-10-11 geen huismerk meer; Aldi/Lidl deels onbevestigd.
- `data/ah.json` is op 2026-10-11 ververst met de nieuwe logica (100-gram-voor, multipacks); Boon's/Jumbo/Dirk nog niet.
