# todo — superaanbieding

Doel: huidige supermarkt-aanbiedingen tonen met oordeel (goede deal / huismerk of merk goedkoper per kg/l), filter op
supermarkt, familie en oordeel. Stand: AH, Dirk, Jumbo, Aldi, Lidl en Boon's (week 42) werken; PWA op :8092, tailscale :8445.

## Hier begint de volgende sessie

1. Hoge besparingen die blijven staan (vanillestokje 1000/kg, diffuser 220/l, bieslook 208): categorie/familie te breed, geen drempelprobleem;
   `MIN_VERHOUDING` in `vergelijk.mjs` is 0,2. Smaller indelen in `familie.mjs` of een bovengrens op besparing overwegen.
2. Automatisch verversen: server start nu handmatig (`node serve.mjs --geen-ophalen`) en draait niet mee na een pc-herstart;
   regel in `Vocal/scripts/diensten.ps1` (rij "Superaanbieding", poort 8092, https :8445) en dagelijkse echte run van de verzamelaars.
3. Boon's week 43 (en elke week): folder https://online.flippingbook.com/view/572493953/ lezen naar `invoer/boons-w43.json`;
   week 42 verloopt 2026-10-18.
4. AH `100 GRAM VOOR 2.99` herkennen: `effectievePrijs` in `winkels/ah.mjs` geeft prijs 2.99 en 11,5 EUR/kg voor een kogelbiefstuk (ca. 260 g,
   2 items) die echt 29,9 EUR/kg is.

## Openstaand

- Online-multipacks (4164 AH-aanbiedingen, "4-pack", "volume voordeel") hebben geen prijs per kg/l en zijn "Geen vergelijking": eenheidsprijs uit het basisproduct afleiden of weglaten (`winkels/ah.mjs`, `maakProduct`).
- Beslissen of een alleen-online product het alternatief van een winkelproduct mag zijn (nu wel, kaart zegt "alleen online"; `vergelijk.mjs`, `beoordeel`); zie `docs/besluiten/beste-en-online.md`.

- Plus ontbreekt (bot-bescherming, alleen via browser); onderzoek in `docs/bronnen.md`.
- Mobiele layout (390 px) niet op een echte telefoon bekeken; filterrij controleren op de Motorola.
- Huismerklijsten Dirk (Silvo, Daily Chef, Bits & Bites, Derlon) en Aldi/Lidl deels onbevestigd.
- Families te grof (kip, kaas, sauzen, toetjes): alternatief kan goedkoper maar niet gelijkwaardig zijn.
- Brood per stuk tegenover per kg (Dirk Polders): geen gewicht per brood in de data.
