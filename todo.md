# todo — superaanbieding

Doel: huidige supermarkt-aanbiedingen tonen, per aanbieding of het een goede deal is of dat huismerk/merk
goedkoper is per kg/liter. **Filter op supermarkt** (wens gebruiker, 2026-10-11).

## Besloten
- Architectuur: pc-verzamelaar (Node, zoals `growatt`) -> één JSON -> PWA (geen Android-app; 2026-10-11).
- Deal-oordeel: aanbiedingsprijs per kg/l vs. goedkoopste alternatief in dezelfde subcategorie (huismerk of merk).

## Onderzoek 2026-10-11
- AH werkt zonder login: token via `POST api.ah.nl/mobile-auth/v1/auth/token/anonymous` (clientId `appie`, header
  `X-Application: AHWEBSHOP`), daarna `mobile-services/product/search/v2?query=..&size=..&page=..`. Geeft
  `unitPriceDescription` ("prijs per liter €2.42"), `isBonus`, `brand`, `subCategory`. Een `filters=` param geeft 500;
  bonus-endpoint `bonuspage/v2/section` geeft 400 -> aanbiedingen eruit filteren op `isBonus` via categorie-crawl.
- Dirk: `web-gateway.dirk.nl/graphql` open, introspectie uit; `listOffers` bestaat, velden nog onbekend.
- Jumbo (`mobileapi.jumbo.com`), Plus en `ah.nl/gql`: 403 Access Denied (bot-bescherming).

## Open
- [ ] Verzamelaar AH: crawl subcategorieën, bewaar bonus + referentieprijzen per kg/l
- [ ] Verzamelaar Dirk: veldnamen listOffers achterhalen
- [ ] Jumbo/Plus/Aldi/Lidl: route kiezen (browser-scrape of folder)
- [ ] PWA (patroon van `growatt`: `serve.mjs` + `pagina.html` + `pwa/`), lijst + supermarkt-filter + deal-badge
- [ ] Bereikbaar maken via `tailscale serve` (nooit funnel), zoals growatt
