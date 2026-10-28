// Haalt de Boon's Markt-folder (FlippingBook) binnen als paginabeelden + tekstlaag, als hulp bij het handmatig/vision invullen van
// invoer/boons-w<week>.json. Schrijft niets naar data/. Gebruik: node boons-folder.mjs [<view-id>] [<uitmap>]
// Zonder view-id: de eerste "Boons Markt"-folder (niet Dagmarkt) die boonsmarkt.nl/folder linkt. Uitmap standaard: $TEMP/boons-folder.
// Staat bewust niet in winkels/: serve.mjs draait elk winkels/*.mjs als verzamelaar.
//
// Route (2026-10-28): de viewer-HTML bevat `var initialPolicies = [...]` met een CloudFront-pad + Policy/Signature/KeyId (geldig ~dagen).
// Met die drie als queryparameters zijn te halen: <pad>common/pager.json (pagina's, spreads `wide`), <pad>common/pages/html5substrates/
// page<NNNN>_4.jpg (2050 px hoog) en <pad>common/pages/vector/<NNNN>.svg (tekst in <svg:tspan>, zonder spaties, prijzen in stukken).
// ⚠️ De jpg bevat GEEN tekst of prijzen (lege prijsvlakken): die staan alleen in de svg. Lees dus spreadSS.html (beide gestapeld),
// bv. met headless Chrome `--screenshot`. Spreads worden niet gesplitst: pagina 1 en de laatste zijn enkel, de rest is twee folderpagina's naast elkaar.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' };
const tekst = async (url) => { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(`${r.status} ${url.split('?')[0]}`); return r.text(); };

async function zoekViewId() {
  const html = await tekst('https://www.boonsmarkt.nl/folder');
  const ids = [...new Set([...html.matchAll(/online\.flippingbook\.com\/view\/(\d+)/g)].map((m) => m[1]))];
  for (const id of ids) {
    const titel = (await tekst(`https://online.flippingbook.com/view/${id}/`)).match(/<title>([^<]*)<\/title>/)?.[1] || '';
    console.log(`  ${id}: ${titel}`);
    if (/markt/i.test(titel) && !/dagmarkt/i.test(titel)) return id;
  }
  throw new Error(`geen Boon's Markt-folder gevonden tussen ${ids.join(', ') || 'geen links'}`);
}

async function main() {
  const id = process.argv[2] || await zoekViewId();
  const uit = process.argv[3] || path.join(process.env.TEMP || os.tmpdir(), 'boons-folder');
  const html = await tekst(`https://online.flippingbook.com/view/${id}/`);
  const titel = html.match(/<title>([^<]*)<\/title>/)?.[1];
  const pol = JSON.parse(html.match(/var initialPolicies = (\[.*?\]);/)[1])[0];
  const basis = 'https' + pol.PathPrefix;
  const q = `?Policy=${pol.Policy}&Signature=${pol.Signature}&Key-Pair-Id=${pol.KeyId}`;
  fs.mkdirSync(uit, { recursive: true });
  const pager = JSON.parse(await tekst(basis + 'common/pager.json' + q));
  const n = Object.keys(pager.pages).filter((k) => /^\d+$/.test(k)).length;
  for (let i = 1; i <= n; i++) {
    const nn = String(i).padStart(4, '0');
    const r = await fetch(`${basis}common/pages/html5substrates/page${nn}_4.jpg${q}`, { headers: UA });
    if (!r.ok) throw new Error(`pagina ${i}: ${r.status}`);
    fs.writeFileSync(path.join(uit, `spread${String(i).padStart(2, '0')}.jpg`), Buffer.from(await r.arrayBuffer()));
    const svg = await tekst(`${basis}common/pages/vector/${nn}.svg${q}`);
    const ss = String(i).padStart(2, '0');
    // De jpg is alleen de achtergrond: namen en prijzen staan in de svg. spreadSS.html legt ze over elkaar (openen in een browser).
    fs.writeFileSync(path.join(uit, `spread${ss}.svg`), svg);
    fs.writeFileSync(path.join(uit, `spread${ss}.html`), `<html><body style="margin:0"><div style="position:relative"><img src="spread${ss}.jpg" style="display:block;height:2050px"><img src="spread${ss}.svg" style="position:absolute;inset:0;width:100%;height:100%"></div></body></html>`);
    const woorden = [...svg.matchAll(/<svg:tspan[^>]*>([^<]+)/g)].map((m) => m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
    fs.writeFileSync(path.join(uit, `tekst${String(i).padStart(2, '0')}.txt`), woorden.join('\n'));
  }
  console.log(`${titel} (${id}): ${n} spreads -> ${uit}`);
}

main().catch((e) => { console.error('boons-folder.mjs mislukt: ' + e.message); process.exit(1); });
