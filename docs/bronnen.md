# Bronnen per winkel (onderzoek 2026-10-11)

Stand 2026-10-11: dit is onderzoek; de verzamelaars die erop draaien staan in `winkels/`.

Alles hieronder is met een handvol requests per winkel getest. Browser-achtige `User-Agent` (Chrome 130 op Windows)
en `Accept-Language: nl-NL` volstaan overal waar curl werkt; gebruik `--compressed`/`Accept-Encoding: gzip` en volg
redirects (Jumbo stuurt `/aanbiedingen` door naar `/aanbiedingen/nu`; zonder redirect-volgen krijg je een bytes-rommel van 108 B).

Volgorde van gemak: **1 Aldi, 2 Jumbo, 3 Lidl, 4 Plus**. Alleen Plus heeft de browser nodig.

## Voorwaarden en belasting van de bronnen (besluit 2026-10-11)

- ⚠️ **Alle bronnen zijn onofficieel** (Aldi: de Next-data van de gewone pagina): de AH app-API (`api.ah.nl`, anoniem token, app-UA), Jumbo `api/graphql`
  (met nagebootste `apollographql-client-*`-headers), Dirk GraphQL en Lidl `q/api/search` zijn geen gepubliceerde API's. De voorwaarden van die winkels
  staan geautomatiseerd uitlezen van de site/app waarschijnlijk niet toe en kunnen het blokkeren (IP, token, headers); dit is niet per winkel nagelezen.
- Daarom: alleen eigen gebruik (server op 127.0.0.1, tailscale, geen publieke pagina, geen herpublicatie van de data), geen omzeiling van
  bot-bescherming (Plus is daarom niet gedaan), `robots.txt` is per bron handmatig nagelezen (Boon's: `?offer=` niet gebruikt); de code controleert het niet zelf.
- Belasting: `serve.mjs` laat een verzamelaar hoogstens elke 6 uur lopen (`SA_VERS_UUR`, 0 = altijd) en na een fout (ook 429) 2 uur niet; AH wacht daarbij
  zelf 2/4/6 s tussen pogingen op 429/5xx en pauzeert 220 ms per request. Aanbiedingen wisselen per dag/week, vaker verversen levert niets.
- Blijft een winkel blokkeren: de collector faalt geisoleerd (pagina toont de waarschuwing); niet doorzetten met rotatie van UA/IP.

## Aldi — plain fetch, een request voor alles (makkelijkst)

- `GET https://www.aldi.nl/aanbiedingen.html` (deze week) en `.../aanbiedingen-volgende-week.html` (beide 200, ~435 KB).
- Embedded JSON: `<script id="__NEXT_DATA__">` -> `props.pageProps.apiData` is een **JSON-string** (in de dump als
  tekenobject; gewoon `JSON.parse` van de string) -> array `[["OFFER_GET",{req,res}]]` -> `res.algoliaDataMap`
  = object `artikelnr -> product` (242 stuks op 2026-10-11, incl. non-food). `res.categories` geeft de weekblokken
  (`startDate`, `endDate`, `content[].productIds`).
- Velden: `name`, `brandName` (198 van 242; "CUCINA", "ALDI"-merken), `salesUnit` ("500 ml", "6x330 ml", "Ca. 800 g",
  "Per stuk"), `currentPrice.priceValue`, `currentPrice.strikePrice.strikePriceValue` (normaalprijs, 37 stuks),
  **`currentPrice.basePrice[0].{basePriceValue,basePriceScale}` (prijs per kg/l, maar bij slechts 46 stuks)**,
  `currentPrice.priceTagLabels.promoText1` ("-25%", "OP=OP", "2 VOOR", "VANAF"), `validFrom/validUntil` (unix, ook
  `promotionPrices[].validFromLocalDate`/`validUntilLocalDate` = `2026-10-11`), `hierarchicalCategories.lvl1`
  (maar 34 stuks), `mainCategoryID` ("vleeswaren", "kaas", "bier"...), `assets[type=primary].url`, `productSlug`.
- Voorbeeld (ingekort):
  `{"name":"Ardenner boterhamworst","salesUnit":"150 g","currentPrice":{"priceValue":1.19,"strikePrice":{"strikePriceValue":1.59},"basePrice":[{"basePriceValue":7.93,"basePriceScale":"kg"}],"priceTagLabels":{"promoText1":"-25%"},"validUntil":1791755999},"mainCategoryID":"vleeswaren","hierarchicalCategories":{"lvl1":["Kaas en vleeswaren > Vleeswaren"]}}`
- Wat ontbreekt: bij ~80% geen `basePrice` -> **zelf uitrekenen uit `salesUnit`** ("500 ml", "6x330 ml", "4 stuks, 240 g",
  "450-465 g" = midden nemen, "Per stuk"/"2-pack" = geen kg/l). Meeste promo's zijn "OP=OP" (geen normaalprijs bekend).
  Categorie is grof; leid hem af uit `mainCategoryID`/`hierarchicalCategories`/naam.
- **Referentie (normale prijzen): niet beschikbaar.** `/producten/<cat>/<subcat>.html` (bv. `producten/zuivel-eieren-boter/verse-zuivel.html`)
  geeft alleen categorietekst + navigatie, geen productlijst of prijzen; Aldi toont alleen aanbiedingsartikelen met prijs.
  Enige "normaal"-info = `strikePrice` bij de 37 afgeprijsde artikelen.
- Effort: klein (~80 regels, 2 requests, geen browser). Risico: laag-middel (Next-pagina; structuur `apiData` kan wijzigen,
  `buildId` verandert elke deploy maar speelt geen rol). Parse defensief.

## Jumbo — site-HTML en open GraphQL werken, alleen `mobileapi` is dicht

Twee routes, allebei plain fetch vanuit Node:

### A. Aanbiedingenpagina's (Nuxt SSR) — geeft de actie-structuur
- `GET https://www.jumbo.com/aanbiedingen` -> 301 -> `/aanbiedingen/nu` (200, 1 MB). `<script type="application/json" id="__NUXT_DATA__">`
  is een **devalue-gelijkmaakte array** (indices = verwijzingen; ~25 regels reviver, zie hieronder). Na ontrafelen:
  `data.nuTab.activeTab.runtimes[].sections[].promotions[]` (41 promo's nu; runtime `actieprijs_20261007-20261013`, ook
  runtimes voor volgende week).
- Promo: `{id:"3020936", title:"Royal Club of Rivella", subtitle:"Alle flessen à 1 liter", tags:[{text:"2 voor 3,25"}],
  start/end:{iso}, url:"/aanbiedingen/royal-club-of-rivella/3020936", image}` — **geen producten of prijzen** in de lijst.
- Producten per promo: `GET https://www.jumbo.com/aanbiedingen/<slug>/<id>` (200, 224 KB, 1 request per promo, 41x) -> zelfde
  `__NUXT_DATA__` -> `data["promotion-detail:<id>"].products[]`:
  `{id:"469606FLS", brand:"Royal Club", category:"Frisdrank en sappen", title:"Royal Club Bitter Lemon Fles 1L",
  price:{price:249, promoPrice:null, pricePerUnit:{price:249, unit:"l"}}, promotions:[{tags:[{text:"2 voor 3,25"}], maxPromotionQuantity:18}]}`.
  **Prijzen zijn in centen**. `unit` = `l` / `kg` / `pieces` (pieces: geen kg/l). Meervoudsactie ("2 voor 3,25", "1+1 gratis",
  "25% korting", "voor 0,99") staat alleen als tagtekst -> zelf `prijsPerEenheid` effectief uitrekenen.
- Devalue-reviver (minimaal): `h(i)`: `-1`->undefined, `-2`->null; primitieven direct; array met string op [0] (`"Reactive"`,
  `"ShallowReactive"`, `"Ref"`, `"ShallowRef"`) -> `h(v[1])`; gewone array -> map(h); object -> per key h(value). Memoiseren.
  Staat in de scratchpad van deze sessie (`devalue.mjs`), niet in de repo.

### B. GraphQL `https://www.jumbo.com/api/graphql` — open, geen login/cookie, vrije queries
- `POST`, `content-type: application/json`, **verplicht** `apollographql-client-name: JUMBO_WEB-search` en
  `apollographql-client-version: master-v29.4.0-web` (zonder: `{"errors":[{"message":"No client headers set"}]}` 401). Introspectie staat uit.
- Zoeken (getest): `query($input:ProductSearchInput!){searchProducts(input:$input){count start products{id title brand category link
  price{price promoPrice pricePerUnit{price unit}} promotions{id tags{text} end{iso}}} facets{key values{id count name}}}}` met
  `input = {"searchType":"keyword","searchTerms":"cola","offSet":0,"limit":24}` (`searchTerms` verplicht, niet leeg).
- Alleen aanbiedingen: `"filters":[{"key":"Aanbiedingen","values":["Alle aanbiedingen"]}]` (let op: array van objecten).
- Antwoord (ingekort): `{"id":"629680PAK","title":"Jumbo Cola Regular 6 x 1,5 L","brand":"Jumbo","category":"Frisdrank en sappen",
  "price":{"price":474,"promoPrice":null,"pricePerUnit":{"price":53,"unit":"l"}},"promotions":[]}` (centen!); met aanbieding:
  `"price":{"price":109,"promoPrice":99,"pricePerUnit":{"price":1165,"unit":"kg"}},"promotions":[{"id":"3020854","tags":[{"text":"voor 0,99"}],"end":{"iso":"2026-10-13T23:59:59+02:00"}}]`.
- **Referentie: ja.** Zelfde query zonder filter geeft alle producten incl. Jumbo-huismerk (`brand:"Jumbo"`) met `pricePerUnit`;
  `category` is grof ("Frisdrank en sappen"). Facetten geven Merk/Dieet/Aanbiedingen. Categoriezoeken (`searchType:"category"`,
  `friendlyUrl`) gaf NPE + "searchTerms must not be blank" -> werkt met onbekende combinatie; zoek op trefwoord (cola, pindakaas, melk...)
  per subcategorie-trefwoord, pagineer met `offSet` (+`limit`). HTML-categoriepagina's (`/producten/...`) renderen server-side
  geen productlijst bruikbaar (wortellijst met 24 willekeurige producten).
- Niet getest: maximale `limit` (24 en 100 geaccepteerd, `count` 94 voor "a"+aanbiedingsfilter dus waarschijnlijk afgekapt op trefwoordmatch).
- Effort: klein-middel (route B: ~60 regels, N trefwoorden x pagina's; route A: ~100 regels incl. devalue, 42 requests).
  Risico: middel (headers/versie-string kan verlopen, ongedocumenteerde API; `mobileapi.jumbo.com` blijft 403 -> niet gebruiken).
  Beleefd: ~50 requests, 0,5 s pauze.
- Aanbeveling: route B voor referentie + aanbiedingen (prijs per kg/l kant en klaar), route A als check op de actietekst/geldigheid.

## Lidl — open zoek-API, maar voedselinfo is mager

- `GET https://www.lidl.nl/q/api/search?offset=0&fetchsize=48&locale=nl_NL&assortment=NL&version=2.1.0&q=<zoekterm>` (200, JSON,
  `application/mindshift.search+json`, geen cookie/header nodig; max `fetchsize` 1000). `numFound`, `items[]`, `facets[]`
  (category, price, brand...). Zonder `q` met `category.id=10068374` ("Eten & drinken") komt er een gemengde, onvolledige lijst (60 van 185).
- Item: `items[].gridbox.data`: `fullTitle`, `keyfacts.analyticsCategory` ("Food"/"Non Food"), `keyfacts.wonCategoryPrimary`
  ("Werelden van nood/Eten en dichtbij voedsel/Muesli & broodbeleg/Muesli & ontbijtgranen"), `price.price`, `price.oldPrice`,
  `price.discount.{percentageDiscount,deletedPrice}`, `price.packaging.text` ("500 g", "0,75 l" — niet altijd), `keyfacts.description`
  (`<li>750 g</li>`, niet altijd), `storeStartDate/storeEndDate` (unix, winkelaanbieding), `regionsPrices[1].currentPrice.{endDate,startDate}`,
  `canonicalUrl` (`/p/crunchy-muesli-appel-rozijnen/p11208810`), `image`.
- Voorbeeld: `{"fullTitle":"Crunchy muesli appel rozijnen","price":{"price":2.09,"oldPrice":2.57,"discount":{"percentageDiscount":18}},"storeStartDate":1791756000,"storeEndDate":1792360799,"category":"Food"}`;
  `MILBONA Geraspte mozzarella` -> `price 4.99, packaging {"text":"500 g"}`.
- Problemen: `price.basePrice` is leeg ({prefix:false}) voor voedsel; hoeveelheid ontbreekt vaak in de API (`Crunchy muesli`, `Tortellini`).
  Productpagina `https://www.lidl.nl/p/<slug>/p<id>` (200, ~200 KB) bevat `ld+json` (Product/Offer: prijs) en de hoeveelheid in de tekst (`800 g`),
  dus voor ontbrekende inhoud 1 extra fetch per product (of regex op `keyfacts`/titel). Dit is ook de bron voor "huidige aanbiedingen":
  de week-folder (`https://www.lidl.nl/c/aanbiedingen/a10008785`, folder-viewer `/l/folders/...`) levert de voedselacties, maar zonder eigen JSON-feed
  (HTML 200, `ld+json` alleen Organization); gebruik de zoek-API met `q` per voedseltrefwoord en filter op `Food` + (`oldPrice` of
  `storeStartDate` in de komende/lopende week).
- Referentie: wat in `search` zonder korting staat (huismerk Milbona, Chef Select, Mona...) telt als referentie; maar het winkelassortiment is smal en
  is wekelijks wisselend, dus referentieprijzen zijn dun.
- Effort: middel (zoeken per trefwoord, inhoud uit titel/pagina, ontbrekende data). Risico: middel (API `version=2.1.0` + `assortment=NL` kan wijzigen;
  veel items zonder prijs/inhoud).
- Aanbeveling: zoek-API als bron, productpagina's voor ontbrekende inhoud; of accepteer "onbekend" bij ontbrekende inhoud.

## Plus — alleen via browser (Incapsula), data zelf is netjes

- curl naar `https://www.plus.nl/aanbiedingen` en `/sitemap.xml`: 403 (Incapsula, cookies `incap_ses_*`, JS-challenge); alleen een echte browser komt door.
- Site is een OutSystems-SPA zonder `__NEXT_DATA__`/ld+json; data via `POST /screenservices/<module>/<flow>/<block>/DataAction...`
  met JSON-body en **header `X-CSRFToken`** (uit cookie `nr2Users`, `crf=`) + `OutSystems-locale` + `Content-Type: application/json`.
  Vanuit een geladen plus.nl-tab werkt een eigen `fetch` met de gekopieerde headers (getest: 200 en echte data; zonder CSRF-header: "Invalid Login").
- Aanbiedingenlijst: `/aanbiedingen` rendert tegels `a[href^="/aanbiedingen/4450-"]` (21 stuks in de DOM bij laden;
  tekst `Milka / t/m 13 okt / 1.00 / 1.55 - 2.49`), data uit `.../ECP_Composition_CW/Promotions/Promotion_LP_Content_TF_OptimizationECOP9566/DataActionGetPromotionList_Optimization`.
  Periode `Woensdag 7 t/m dinsdag 13 oktober` + "Vanaf woensdag" (volgende week).
- Detail per aanbieding: `POST /screenservices/ECP_Promotion_CW/PromotionDetailsFlow/PromotionOffer_DP_Content/DataActionPromotionOfferDetail_Get`
  body `{"versionInfo":{"moduleVersion":"<uit pagina>","apiVersion":"<uit pagina>"},"viewName":"MainFlow.Promotions","screenData":{"variables":{"PromotionOfferId":"4450-31",...}}}`
  (moduleVersion/apiVersion zijn per deploy anders: haal ze uit een eigen pagina-XHR of `/moduleservices/moduleversioninfo`). Antwoord (ingekort):
  `data.PromotionOfferDetail = {Offer_Id:"31", Brand:"Milka", Variant:"Alle repen à 87-100 gram", Package:"Per reep", Price:"1", StartDate:"2026-10-07", EndDate:"2026-10-13",
  ProductList:{List:[{PLP_Str:{SKU:"138978",Brand:"Milka",Name:"Chocoladereep Cookies",Product_Subtitle:"Per 100 g",Slug:"milka-chocoladereep-cookies-wikkel-100-g-138978"},Price_Original:"2.09"}]}}`.
  `Price` = actieprijs per stuk/kg zoals de actie dat noemt; `Price_Original` = normale prijs; `PLP_Str.NewPrice/OriginalPrice` zijn 0.0 zonder winkelkeuze.
  Mechanisme-tekst ("1+1 gratis", "2e halve prijs") zit in `DisplayInfo_Label`/`Explanation`/tegeltekst; niet alle varianten bekeken.
- Referentie: productlijsten `https://www.plus.nl/producten/<cat>/<sub>` (voorbeeld `frisdrank-sappen-koffie-thee/frisdrank`, 567 producten, via
  `.../ECOP/MainFlow/ProductListPage/DataActionGetPLPContent` / `.../ECP_Composition_CW/ProductLists/PLP_Content/DataActionGetProductListAndCategoryInfo`).
  DOM-tegel: `PLUS Cola zero / Per 1500 ml / 0.89` (huismerk), `Coca-Cola Original taste / Per 1000 ml / 2.19`: **inhoud + prijs staan erbij** -> per l/kg uit te rekenen.
  De request-body van die lijst-call heb ik niet kunnen vastleggen (alleen `GetPLPContent` gezien), dus nog te bepalen; DOM-scrape (`get_page_text`/`innerText`, "Toon meer") werkt wel.
  Filter "Nu in de aanbieding (70)" bestaat in de zijbalk.
- Effort: groot (browser-sessie nodig vanuit het pc-script: MCP-Chrome of Puppeteer/CDP naar de eigen Chrome; Node zonder dependencies kan
  CDP via `ws`... Node 22 heeft een ingebouwde WebSocket, dus `chrome --remote-debugging-port` + eigen CDP-client past). Risico: hoog
  (bot-bescherming, OutSystems-versies, moduleVersion). 
- Aanbeveling: laatst doen. Variant 1 (simpelst): Claude/MCP laadt `/aanbiedingen`, scrapet de tegels en laat per promo `DataActionPromotionOfferDetail_Get`
  uit de pagina lopen en schrijft `data/plus.json`. Variant 2: Node start Chrome met `--remote-debugging-port=9222` en doet hetzelfde via CDP (`Runtime.evaluate`).

### Besluit Plus (2026-10-11): geen `winkels/plus.mjs`

- Herhaalde test: curl met browser-UA op `/aanbiedingen` en `/robots.txt` geeft 403 (Incapsula).
- Alleen een echte of door CDP aangestuurde Chrome komt door de JS-challenge: dat is de bot-bescherming omzeilen, geen gewone fetch. Dat doen we niet,
  ook niet "beleefd" (onbewaakt via `serve.mjs`, om de 6 uur).
- Niet onderzocht: folder-aggregators (zoals folderz.nl) voor Plus; een gewone fetch daarop is de enige legitieme kandidaat en nog te doen.
- Daarnaast fragiel: moduleVersion/apiVersion en CSRF-token wisselen per deploy; vereist Chrome op de pc; botst met "plain Node, geen afhankelijkheden, collector als eigen proces".
- Gevolg: Plus ontbreekt in de tool, ook als referentieprijs. Heroverwegen alleen bij een open feed of toestemming van Plus.

## Referentieproducten, samengevat

| winkel | referentie via | kwaliteit |
| --- | --- | --- |
| Jumbo | GraphQL `searchProducts` zonder aanbiedingsfilter, `pricePerUnit` per kg/l kant en klaar, huismerk `brand:"Jumbo"` | goed |
| Plus | productlijst (browser), prijs + inhoud in tegel | goed, maar browser |
| Lidl | `q/api/search` items zonder korting (Food) | matig: inhoud vaak ontbrekend, smal assortiment |
| Aldi | geen online assortimentsprijzen; alleen `strikePrice` bij 37 aanbiedingen | niet beschikbaar |

## Aanbevolen volgorde

1. Aldi (1 request, JSON in de pagina) — direct `data/aldi.json`; inhoud -> prijs per kg/l zelf rekenen.
2. Jumbo (open GraphQL met 2 headers, centen, `pricePerUnit` meegeleverd; ook referentie).
3. Lidl (open zoek-API, maar inhoud/eenheidsprijs vaak zelf af te leiden uit titel/pagina).
4. Plus (browser + CSRF/Incapsula; nu alleen via MCP of CDP).

## Boon's — geen machineleesbare bron (onderzoek 2026-10-11), geen `winkels/boons.mjs`

⚠️ **Bijgewerkt 2026-10-28: de FlippingBook-pagina's zijn wél te halen** (de "DRM, 403" hieronder klopt niet). De viewer-HTML geeft
een signed CloudFront-policy (`var initialPolicies`), en daarmee zijn `common/pages/html5substrates/pageNNNN_4.jpg` (2050 px) en de
tekstlaag `common/pages/vector/NNNN.svg` (woorden in `<svg:tspan>`) gewoon op te halen: `node boons-folder.mjs`.
⚠️ De jpg is alleen achtergrond (lege prijsvlakken); namen en prijzen staan in de svg, dus lees `spreadSS.html` (beide gestapeld). Nog steeds
geen prijzen als gestructureerde data: de invoer blijft vision/handwerk naar `invoer/boons-w<week>.json`. `boonsmarkt.nl/folder`
linkt ook Dagmarkt-folders en soms al de volgende week; de juiste titel is "Boons Markt Folder Compleet W<nn>".

- Site is `boonsmarkt.nl` (niet boons-markt.nl: dat domein heeft een verkeerd certificaat). Vestiging Zuidland = locatie-id 26839,
  hoort bij de folder "Boon's Markt" (niet Dagmarkt); alle ~26 Markt-vestigingen delen een landelijke folder per week
  (`/folder`, `data-locids`, week 42 = 12-18 okt). Geen prijzen of aanbiedingen als tekst op de site (`/acties` = spaaractie).
- De folder is een FlippingBook (`online.flippingbook.com/view/572493953/`, 24 pagina's, W42 titel "Folder-Versweken", dus
  waarschijnlijk alleen vers): pagina's zijn afbeeldingen achter DRM-sleutels + signed CloudFront-cookies, geen tekstlaag/JSON (403).
- Folderz (`folderz.nl/winkels/boon-s-markt/...`, folder 3841620): alleen de folderafbeeldingen; `dynamic-filters` geeft
  `totalOffers: 0`, geen losse aanbiedingen voor de lopende week (losse offer-pagina's bestaan alleen voor oude folders, bv. 3-9 aug).
- Geen API, geen webshop met prijzen. Alternatief: folderpagina's als afbeelding lezen (OCR/vision per week, foutgevoelig) of
  handmatig invoeren; niet in deze tool gedaan om geen nepdata te maken.

### Boon's, tweede ronde (2026-10-11): ook via derden niets bruikbaars, nog steeds geen `winkels/boons.mjs`

Gecontroleerd met gewone fetch (browser-UA, enkele requests per site), niets omzeild:
- `foldervolgendeweek.nl/winkels/boon-s-markt/` en `/aanbiedingen/`: kent folder week 42 (12-18 okt), maar de folderpagina's hebben
  geen producttekst; de enige tekstuele aanbiedingen (titel, prijs, normaalprijs, % korting) zijn van **26 jan-1 feb 2026**: verouderd.
- `allefolders.nl/boon-s-markt/folder-aanbiedingen`: alleen week 41 (24 paginabeelden); losse `?offer=`-pagina's zijn hotspots op
  afbeeldingen en `robots.txt` verbiedt `/*?offer=`: niet gebruikt.
- `folderz.nl` (zie hierboven: `totalOffers: 0`), `promotiesfolders.nl` (alleen galerijafbeeldingen, geen prijzen als tekst),
  `folderfeest.nl` en `1folders.nl` (alleen foldertegel/afbeelding, geen prijzen), `folders.nl/boons-markt` (lege shell).
- `supermarktaanbiedingen.com` heeft geen Boon's (404); `aanbiedingen.nl` en `reclamefolder.nl` (DPG-consentmuur) geven geen data.
- `boonsmarkt.nl`: robots.txt sluit alleen `/cpresources/`, `/vendor/` en `.env` uit, maar de site heeft geen prijzen; `dagmarkt.nl`
  stuurt naar dezelfde site. Geen JSON/Next-data met aanbiedingen.
Conclusie: de week-42-prijzen bestaan online alleen als folderafbeelding (DRM-FlippingBook of aggregator-afbeeldingen). Zou
je het toch willen: vision/OCR op die afbeeldingen (de aggregator-afbeeldingen zijn derde partij, foutgevoelig, week 42 pas vanaf ma 12 okt).
Geen nepdata geschreven.
