# Aanbiedingen zonder `normaalPrijs` blijven staan (2026-10-11)

Aanleiding: reviewpunt A7, 256 van 11537 aanbiedingen hebben geen `normaalPrijs` (Aldi 203, vooral op=op-weekacties; Boon's 39 folderprijzen; AH 14 BONUS).
Besluit: niet filteren, alleen documenteren (`docs/contract.md`, test in `test.mjs`).
- De prijs per eenheid en het oordeel hangen niet aan `normaalPrijs`; het is alleen nodig voor 'geen echte korting' (`geenKorting`, daar telt alleen een geldige `normaalPrijs`) en de doorgestreepte prijs.
- Filteren zou de helft van Aldi en bijna alle Boon's wegnemen: echte weekacties die juist zonder vergelijkprijs worden aangeboden.
- Oordeelverdeling van de 256: 160 onbekend, 47 huismerk-goedkoper, 33 merk-goedkoper, 12 beste, 4 goed; niet afwijkend van de rest.
- Prijs blijft dus de enige bron; wie hier later op wil filteren, doet dat op `mechanisme` of per winkel, niet op ontbrekende `normaalPrijs`.
- Pro/debunk-subagents konden niet starten (limiet gelijktijdige subagents); besluit op eigen onderzoek.
