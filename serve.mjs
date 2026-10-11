// Serveert build/ (de pagina als PWA) en ververst de data elk uur. Gebruik: node serve.mjs [--fixtures] [--geen-ophalen]
// Luistert alleen op localhost: later `tailscale serve --bg --https=8445 8092` voor HTTPS op het tailnet.
// Nooit `funnel` of 0.0.0.0, want er is geen inlog.
import { createServer } from 'node:http';
import { readFileSync, readdirSync, writeFileSync, appendFileSync, rmSync, mkdirSync, openSync, closeSync, existsSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

process.chdir(dirname(fileURLToPath(import.meta.url)));
mkdirSync('data', { recursive: true });
// serve.log wordt niet geroteerd: bij de start afkappen als hij groter is dan 1 MB.
try { if (statSync('data/serve.log').size > 1024 * 1024) rmSync('data/serve.log'); } catch {}

const PORT = Number(process.env.PORT) || 8092;
const FIXTURES = process.argv.includes('--fixtures');
const GEEN_OPHALEN = process.argv.includes('--geen-ophalen'); // alleen samenvoegen, verzamelaars niet laten lopen
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

const server = createServer((req, res) => {
  try {
    const pad = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const naam = normalize(pad === '/' ? 'index.html' : pad.slice(1));
    if (naam.startsWith('..') || naam.includes(':')) throw new Error('buiten build');
    const kop = { 'content-type': TYPES[extname(naam)] ?? 'application/octet-stream', 'cache-control': 'no-store', vary: 'Accept-Encoding' };
    let inhoud;
    if (/\bgzip\b/.test(req.headers['accept-encoding'] ?? '') && existsSync(join('build', naam + '.gz'))) {
      inhoud = readFileSync(join('build', naam + '.gz')); kop['content-encoding'] = 'gzip';
    } else inhoud = readFileSync(join('build', naam));
    kop['content-length'] = inhoud.length;
    res.writeHead(200, kop);
    res.end(req.method === 'HEAD' ? undefined : inhoud);
  } catch {
    res.writeHead(404).end('Niet gevonden (draai eerst: node vergelijk.mjs)');
  }
});
// Poort bezet (er draait al een serve.mjs): stoppen, anders blijft dit proces als zombie uurlijks verversen.
server.on('error', (e) => { console.error('listen', e.message); process.exit(1); });
server.listen(PORT, '127.0.0.1', () => console.log(`http://127.0.0.1:${PORT}`));
process.on('uncaughtException', (e) => console.error('uncaughtException', e));

// Draait een script; geeft null bij succes, anders de foutmelding. Max 5 minuten per script.
const draai = (script, args = []) => new Promise((klaar) => {
  const log = openSync('data/serve.log', 'a');
  let kind;
  try { kind = spawn(process.execPath, [script, ...args], { stdio: ['ignore', log, log], windowsHide: true }); }
  catch (e) { closeSync(log); return klaar(e.message); }
  closeSync(log);
  const timer = setTimeout(() => { kind.kill(); klaar('time-out na 5 minuten'); }, 5 * 60 * 1000);
  kind.on('error', (e) => { clearTimeout(timer); klaar(e.message); });
  kind.on('exit', (code) => { clearTimeout(timer); klaar(code === 0 ? null : `afgesloten met code ${code}`); });
});

let bezig = false;
const ververs = async () => {
  if (bezig) return;
  bezig = true;
  try {
    const fouten = [];
    if (!FIXTURES && !GEEN_OPHALEN) {
      let scripts = [];
      try { scripts = readdirSync('winkels').filter((n) => n.endsWith('.mjs')).sort(); } catch {}
      for (const s of scripts) {
        const f = await draai(join('winkels', s)); // een winkel die faalt breekt de rest niet
        if (f) fouten.push(`${s}: ${f}`);
      }
    }
    if (fouten.length) writeFileSync('data/laatste-fout.txt', `${new Date().toISOString()}\n${fouten.join('\n')}\n`);
    else rmSync('data/laatste-fout.txt', { force: true });
    const f = await draai('vergelijk.mjs', FIXTURES ? ['--fixtures'] : []);
    // Code 2 = lock bezet: een andere vergelijk-run (bv. met de hand) doet het samenvoegen al, dus geen fout om te tonen.
    if (f && f !== 'afgesloten met code 2') appendFileSync('data/laatste-fout.txt', `${fouten.length ? '' : new Date().toISOString() + '\n'}vergelijk.mjs: ${f}\n`); // aanvullen: de collector-fouten blijven staan
  } finally { bezig = false; }
};

// Eerst meteen samenvoegen wat er al ligt (pagina is dan direct beschikbaar), daarna de verzamelaars en elk uur opnieuw.
const meld = (e) => console.error('ververs', e);
(async () => {
  if (!existsSync('build/index.html') || !existsSync('build/aanbiedingen.json.gz')) await draai('vergelijk.mjs', FIXTURES ? ['--fixtures'] : []);
  await ververs();
})().catch(meld);
setInterval(() => ververs().catch(meld), 60 * 60 * 1000);
