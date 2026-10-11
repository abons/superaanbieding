# Plausibiliteitsgrens op alternatieven (2026-10-11)

Aanleiding: absurde besparingen (vanillestokje vs keukenzout "EUR 1249 per kg", diffuser vs spray): categorie of familie te breed.
Besluit: een kandidaat die per eenheid minder kost dan `MIN_VERHOUDING` x de aanbieding telt niet mee: 0,2 binnen de categorie,
0,5 bij de familie-terugval (families bevatten producten die niets met elkaar te maken hebben; blauwe bessen vs appeltjes, pesto vs lasagne).
- Een gemiste besparing is goedkoper dan een absurde; echte alternatieven zijn zelden meer dan 5x goedkoper.
- Verlopen aanbiedingen (`geldigTot` < vandaag) en prijs >= `normaalPrijs` tellen niet mee, als kandidaat noch als aanbieding.
- Categorie 'Overig' of leeg zegt niets over vergelijkbaarheid en doet alleen via de familie mee.
- ⚠️ De aanbieding zelf wordt uitgesloten op objectidentiteit of winkel + `id`, niet op prijs.
- Open: nog steeds hoge besparingen onder de grens; zie `todo.md`.
