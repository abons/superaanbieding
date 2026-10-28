# todo — superaanbieding

Doel: huidige supermarkt-aanbiedingen tonen met oordeel (goede deal / huismerk of merk goedkoper per kg/l), filter op
supermarkt, familie en oordeel. Stand: AH, Dirk, Jumbo, Aldi, Lidl en Boon's (week 44) werken; PWA op :8092, tailscale :8445, en sinds 2026-10-11 openbaar op https://abons.github.io/superaanbieding/ (GitHub Action `publiceer.yml`, dagelijks 04:00 UTC).

## Hier begint de volgende sessie

1. Boon's elke week (nieuwe folder ~donderdag voor de week; nooit data verzinnen). W44 (26 okt-1 nov) staat in `invoer/boons-w44.json`
   (2026-10-28, 90 regels); W43 is overgeslagen (verlopen voor hij gelezen was). Volgende: **W45, geldig 2026-11-02 t/m 11-08**.
   Werkwijze: `node boons-folder.mjs` (zoekt de "Boons Markt"-folder op `boonsmarkt.nl/folder`, niet Dagmarkt) -> spreads als jpg + svg;
   ⚠️ de jpg heeft geen prijzen, render jpg+svg samen (`spreadSS.html`, headless Chrome `--screenshot`) en lees dat; 3 agents parallel
   (pagina 1-8/9-16/17-24) met het formaat uit de kop van `winkels/boons.mjs` ging in ~5 min. Normaalprijs "x/y" -> null + opmerking.

## Openstaand

- Boon's: geen `geldigVan` per regel in `winkels/boons.mjs`, dus zaterdagknallers/weekenddeals tellen vanaf maandag (W44: `invoer/boons-w44.json` Affligem r73, pokebowl r16, rundergehakt r24, vlaaien r31; geven te vroeg `beste`). Veld per regel + filter op vandaag.
- Boon's-invoer met inhoudsbereik (450/500 ml, 28-185 g) kiest één uiterste: prijs per kg/l schijnprecies (W44 r43 olie 3,98/l vs 4,42, r28 pepernoten, r57 Maggi). Afspraak maken (kleinste inhoud, of eenheid `stuk`) en in de kop van `winkels/boons.mjs` zetten.
- Boon's-categorieën (`CATS` in `winkels/boons.mjs`) zijn grof: ~55 van 90 W44-regels worden 'Overig' (vleeswaren, kaas, koffie, snoep); dan vergelijkt alleen `familie.mjs`. Aanvullen op W44-titels.
- AH faalt in de Action: `winkels/ah.mjs:41` geeft `token 503` vanaf de GitHub-runner (runs 38244038632 en 38307753741 rood via `controle`; Pages draait wel met oude AH-data uit de cache). Mogelijk blokkeert AH datacenter-IP's: onderzoeken (andere header/UA, retry-gedrag, of AH alleen lokaal ophalen en `data/ah.json` meegeven). De "request-budget op"-melding op de pagina was een eerdere run, niet de huidige oorzaak.
- Als een verzamelaar in CI mislukt, zegt de pagina dat niet (alleen de GitHub-mail via `controle`); `data/laatste-fout.txt` wordt in de Action niet gevuld: de i-melding laten tonen dat AH niet ververst is.
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
