# Superaanbieding

Lokale tool (Node 22, geen dependencies) die supermarktaanbiedingen verzamelt en per aanbieding zegt of het een
goede deal is, of dat een huismerk of ander merk goedkoper is per kg of liter. Nederlandse pagina, installeerbaar als PWA.

## Gebruik

```
node serve.mjs              # pagina op http://127.0.0.1:8092, ververst elk uur
node serve.mjs --fixtures   # zelfde, maar met testdata uit fixtures/ (geen verzamelaars)
node serve.mjs --geen-ophalen  # echte data uit data/, verzamelaars niet draaien
node vergelijk.mjs          # alleen samenvoegen: data/*.json -> data/aanbiedingen.json + build/
node vergelijk.mjs --fixtures
node test.mjs               # test de oordeelslogica
```

- `winkels/<winkel>.mjs` haalt de aanbiedingen van een winkel op en schrijft `data/<winkel>.json`
  (formaat: `docs/contract.md`). `serve.mjs` draait ze één voor één; een winkel die faalt breekt de rest niet.
  Fouten staan in `data/laatste-fout.txt` en als waarschuwing op de pagina.
- `vergelijk.mjs` past de oordeelsregel toe en bouwt `build/` (kleine pagina, compacte `aanbiedingen.json`, PWA-bestanden, plus vooraf gecomprimeerde `.gz`).
- Alleen bereikbaar op 127.0.0.1. Voor de telefoon: `tailscale serve --bg --https=8445 8092` (nooit `funnel`).
- Iconen opnieuw tekenen: `node pwa/maak-iconen.mjs`.

## Oordeel

Een aanbieding wordt vergeleken met het goedkoopste product (referentie of andere aanbieding, ook bij een andere winkel)
in dezelfde categorie en eenheid, op prijs per kg/l. Binnen 5% van het goedkoopste is een goede deal; anders staat er
of het alternatief een huismerk of een merk is, met de besparing per kg/l. Zonder eenheidsprijs of vergelijkbaar product: onbekend.
