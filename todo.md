# todo — superaanbieding

Doel: huidige supermarkt-aanbiedingen tonen met oordeel (goede deal / huismerk of merk goedkoper per kg/l), filter op
supermarkt, familie en oordeel. Stand: AH, Dirk, Jumbo, Aldi, Lidl en Boon's (week 42) werken; PWA op :8092, tailscale :8445.

## Hier begint de volgende sessie

1. Hoge besparingen die blijven staan (vanillestokje 1000/kg, diffuser 220/l, bieslook 208): categorie/familie te breed, geen drempelprobleem;
   `MIN_VERHOUDING` in `vergelijk.mjs` is 0,2 (categorie) en `MIN_VERHOUDING_FAMILIE` 0,5 (sinds 2026-10-11). Opnieuw meten of er nog zulke gevallen zijn;
   zo ja smaller indelen in `familie.mjs` of een bovengrens op besparing overwegen.
2. Automatisch verversen: server start nu handmatig (`node serve.mjs --geen-ophalen`) en draait niet mee na een pc-herstart;
   regel in `Vocal/scripts/diensten.ps1` (rij "Superaanbieding", poort 8092, https :8445) en dagelijkse echte run van de verzamelaars.
3. Boon's week 43 (en elke week): folder https://online.flippingbook.com/view/572493953/ lezen naar `invoer/boons-w43.json`;
   week 42 verloopt 2026-10-18.
4. AH `100 GRAM VOOR 2.99` herkennen: `effectievePrijs` in `winkels/ah.mjs` geeft prijs 2.99 en 11,5 EUR/kg voor een kogelbiefstuk (ca. 260 g,
   2 items) die echt 29,9 EUR/kg is.

## Openstaand

- Twijfelpunten uit de reviewronde van 2026-10-11 (6 reviewers, geen unanieme stem) beslissen: A4 familie in de vergelijkingssleutel (`vergelijk.mjs` `sleutel`), A7 aanbiedingen zonder `normaalPrijs` (256 stuks) filteren of alleen documenteren, B5 één falende referentie-aanvraag laten falen of doorgaan (ah/jumbo/dirk), C7/D4 verlopen of stale data tonen bij offline gebruik (`pagina.html`, `pwa/sw.js`), D7/D8 ToS-risico vastleggen in `docs/bronnen.md` en verversfrequentie/backoff op 429 (`serve.mjs`), E7 contractvalidatie-test, plus een waarschuwing voor `geldigTot` in een ander formaat dan jjjj-mm-dd (`verlopen()` in `vergelijk.mjs` laat dat stil door).
- `haalToken` in `winkels/ah.mjs` valt niet onder de retry-lus van `zoek`: één time-out van 30 s op de tokenfetch stopt de hele AH-run.
- Online-multipacks (4164 AH-aanbiedingen, "4-pack", "volume voordeel") hebben geen prijs per kg/l en zijn "Geen vergelijking": eenheidsprijs uit het basisproduct afleiden of weglaten (`winkels/ah.mjs`, `maakProduct`).
- Beslissen of een alleen-online product het alternatief van een winkelproduct mag zijn (nu wel, kaart zegt "alleen online"; `vergelijk.mjs`, `beoordeel`); zie `docs/besluiten/beste-en-online.md`.

- Plus ontbreekt (bot-bescherming, alleen via browser); onderzoek in `docs/bronnen.md`.
- Mobiele layout (390 px) niet op een echte telefoon bekeken; filterrij controleren op de Motorola.
- Huismerklijsten Dirk (Silvo, Daily Chef, Bits & Bites, Derlon) en Aldi/Lidl deels onbevestigd.
- Families te grof (kip, kaas, sauzen, toetjes): alternatief kan goedkoper maar niet gelijkwaardig zijn.
- Brood per stuk tegenover per kg (Dirk Polders): geen gewicht per brood in de data.
