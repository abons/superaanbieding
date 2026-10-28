# superaanbieding — signpost for a fresh session

Local tool, plain Node 22 ES modules + one HTML page, no dependencies. Dutch UI. Same pattern as `growatt`.
See `README.md` for use, `docs/contract.md` for the data format (the contract between collectors, merger and page),
`todo.md` for what is open.

| file | what |
| --- | --- |
| `winkels/<winkel>.mjs` | one collector per supermarket -> `data/<winkel>.json` (owned by whoever writes that shop) |
| `vergelijk.mjs` | merges `data/*.json`, judges each offer (`beoordeel`), writes `data/aanbiedingen.json` + `build/`; `--fixtures` reads `fixtures/` |
| `boons-folder.mjs` | downloads the weekly Boon's FlippingBook (page jpgs + text layer) to `$TEMP/boons-folder` for filling `invoer/boons-w<week>.json`; not in `winkels/` because `serve.mjs` runs everything there |
| `familie.mjs` | coarse product family per product (keywords on category + title), `familieNaam`, `STUK_FAMILIES` (per piece over the whole family), `STUK_CATEGORIE_FAMILIES` (per piece only within one category) |
| `docs/bronnen.md` | research per shop (endpoints, how each shop is fetched); state 2026-10-11, the collectors live in `winkels/` |
| `serve.mjs` | serves `build/` on 127.0.0.1:8092; runs collectors one by one, then `vergelijk.mjs`, at start and hourly (merge hourly, each collector at most every 6 h, 2 h pause after a failure); `--fixtures` skips collectors, `--geen-ophalen` skips them too but keeps real data; serves the pre-gzipped `build/*.gz` |
| `pagina.html` | the page (static, copied to `build/index.html`; fetches `aanbiedingen.json`, renders 60 cards at a time + 'Toon meer'), mobile first, filters in localStorage (`sa-` keys) |
| `.github/workflows/publiceer.yml` | daily Pages publish (see Rules) |
| `pwa/` | manifest, `sw.js`, icons (`maak-iconen.mjs` draws the PNGs without libs) |
| `fixtures/` | `ah.json`, `dirk.json` test data covering most of the five verdicts |
| `test.mjs` | asserts on the judging rule, covers all five verdicts: `node test.mjs` |

## Rules

- ⚠️ **`serve.mjs` listens on 127.0.0.1 only and the page has no login.** Reach it with `tailscale serve`
  (planned `--https=8445`), never `funnel`, never `0.0.0.0`.
  ✅ **Exception, on purpose (2026-10-11, user):** a public copy lives on GitHub Pages, https://abons.github.io/superaanbieding/
  (public repo `abons/superaanbieding`), built daily 04:00 UTC by `.github/workflows/publiceer.yml` (collectors + merge, `data/`
  in `actions/cache`). Only public offer data and code go there: never put secrets, `.env` or personal data in `data/`, `build/` or the repo.
  The local 127.0.0.1 rule still holds for `serve.mjs`.
- ⚠️ **The judging rule lives in `vergelijk.mjs` and is written down in `docs/contract.md`**: change both and `test.mjs`
  together. Same `eenheid`; narrow `categorie` first, the `familie` when the category has < 3 comparable products or none from another shop/brand; `beste` (cheapest or equal) / `goed` (within 5% of cheapest) only with a real comparison (>= 3, one other shop/brand), else `onbekend`.
- ⚠️ **A collector writes nothing (exit 1) on 0 offers or < 50% of the previous `data/<shop>.json`** (2026-10-11): a real, lasting drop needs `SA_FORCEER=1` or deleting that file.
- ⚠️ **A failing collector must never break the others or the merge**: `serve.mjs` spawns each as its own process,
  writes `data/laatste-fout.txt`, and the page shows it as a warning. Missing or corrupt `data/<winkel>.json` is skipped with a warning.
- `data/` and `build/` are gitignored (generated). `build/index.html` is a small static page; the data is `build/aanbiedingen.json` (compact form, see contract), both cached by `sw.js`.
- `aanbiedingen.json` in `data/` is the merger's output and is never read back as a shop file.
- Port 8092 is a table row elsewhere too (growatt is 8090); do not reuse it for something else.
- Windows PowerShell 5.1 corrupts files on a Get-/Set-Content round trip: edit with the editor tools. Heredocs (also a Python heredoc: `\\b` became a backspace byte in a regex, 2026-10-28) with
  `\u` escapes break in Bash here: write such files with the Write tool.
