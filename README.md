# Superaanbieding

Local tool (Node 22, no dependencies) that collects Dutch supermarket offers and says, per offer, whether it is a good
deal or whether a house brand or another brand is cheaper per kg or litre. Dutch UI, installable as a PWA.

Stores: Albert Heijn, Dirk, Jumbo, Aldi, Lidl, and Boon's Markt (hand-read weekly folder). Plus is not covered yet.

## Usage

```
node serve.mjs                 # page on http://127.0.0.1:8092, merges hourly, collectors every 6 h
node serve.mjs --fixtures      # same, with test data from fixtures/ (collectors do not run)
node serve.mjs --geen-ophalen  # real data from data/, collectors do not run
node vergelijk.mjs             # merge only: data/*.json -> data/aanbiedingen.json + build/
node vergelijk.mjs --fixtures
node test.mjs                  # tests of the verdict logic
```

- `winkels/<store>.mjs` fetches a store's offers and writes `data/<store>.json` (format: `docs/contract.md`).
  `serve.mjs` runs them one by one; a failing store does not break the rest. Errors go to `data/laatste-fout.txt`
  and show as a warning on the page.
- `vergelijk.mjs` applies the verdict rule and builds `build/` (small page, compact `aanbiedingen.json`, PWA files,
  pre-compressed `.gz`).
- Boon's has no machine-readable source: `invoer/boons-w<week>.json` is read from the folder by hand each week.
- Reachable on 127.0.0.1 only. For a phone: `tailscale serve --bg --https=8445 8092` (never `funnel`).
- Redraw the icons: `node pwa/maak-iconen.mjs`.

## Verdict

An offer is compared per kg/l (or per piece where that makes sense) with the cheapest product (reference or other
offer, any store) in the same narrow category, falling back to a broad product family (bread, cheese, ...). Verdicts:

- **best**: the cheapest of the comparison, or equal to it.
- **good**: within 5% of the cheapest.
- **house brand cheaper** / **brand cheaper**: the cheaper alternative is shown with the saving per kg/l.
- **unknown** ("no good comparison"): a real comparison needs at least three candidates, one from another store or brand.

Online-only offers (Albert Heijn Online, Jumbo "only online") are included and can be filtered with the
Store / online filter on the page.
