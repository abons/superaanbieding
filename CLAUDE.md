# superaanbieding — signpost for a fresh session

Local tool, plain Node 22 ES modules + one HTML page, no dependencies. Dutch UI. Same pattern as `growatt`.
See `README.md` for use, `docs/contract.md` for the data format (the contract between collectors, merger and page),
`todo.md` for what is open.

| file | what |
| --- | --- |
| `winkels/<winkel>.mjs` | one collector per supermarket -> `data/<winkel>.json` (owned by whoever writes that shop) |
| `vergelijk.mjs` | merges `data/*.json`, judges each offer (`beoordeel`), writes `data/aanbiedingen.json` + `build/`; `--fixtures` reads `fixtures/` |
| `familie.mjs` | coarse product family per product (keywords on category + title), `familieNaam`, `STUK_FAMILIES` |
| `serve.mjs` | serves `build/` on 127.0.0.1:8092; runs collectors one by one, then `vergelijk.mjs`, at start and hourly; `--fixtures` skips collectors, `--geen-ophalen` skips them too but keeps real data; serves the pre-gzipped `build/*.gz` |
| `pagina.html` | the page (static, copied to `build/index.html`; fetches `aanbiedingen.json`, renders 60 cards at a time + 'Toon meer'), mobile first, filters in localStorage (`sa-` keys) |
| `pwa/` | manifest, `sw.js`, icons (`maak-iconen.mjs` draws the PNGs without libs) |
| `fixtures/` | `ah.json`, `dirk.json` test data covering most of the five verdicts |
| `test.mjs` | asserts on the judging rule, covers all five verdicts: `node test.mjs` |

## Rules

- ⚠️ **`serve.mjs` listens on 127.0.0.1 only and the page has no login.** Reach it with `tailscale serve`
  (planned `--https=8445`), never `funnel`, never `0.0.0.0`.
- ⚠️ **The judging rule lives in `vergelijk.mjs` and is written down in `docs/contract.md`**: change both and `test.mjs`
  together. Same `eenheid`; narrow `categorie` first, the `familie` when the category has < 3 comparable products or none from another shop/brand; `beste` (cheapest or equal) / `goed` (within 5% of cheapest) only with a real comparison (>= 3, one other shop/brand), else `onbekend`.
- ⚠️ **A failing collector must never break the others or the merge**: `serve.mjs` spawns each as its own process,
  writes `data/laatste-fout.txt`, and the page shows it as a warning. Missing or corrupt `data/<winkel>.json` is skipped with a warning.
- `data/` and `build/` are gitignored (generated). `build/index.html` is a small static page; the data is `build/aanbiedingen.json` (compact form, see contract), both cached by `sw.js`.
- `aanbiedingen.json` in `data/` is the merger's output and is never read back as a shop file.
- Port 8092 is a table row elsewhere too (growatt is 8090); do not reuse it for something else.
- Windows PowerShell 5.1 corrupts files on a Get-/Set-Content round trip: edit with the editor tools. Heredocs with
  `\u` escapes break in Bash here: write such files with the Write tool.
