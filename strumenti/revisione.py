"""Pagina di revisione delle domande generate, per Simone e Themino: una scheda per domanda con le zone giuste
per fascia e i luoghi che le rendono giuste, e i tasti Sì / No che si salvano nel database dell'Artifact
(collezione "decisioni", un documento per domanda). Esce docs/revisione-domande.html, da pubblicare come Artifact.

Uso: python3 strumenti/revisione.py   (dopo strumenti/costruisci.py)
"""
import json
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
NOMI_FAMIGLIE = {'tipi': 'Tipi di luogo', 'architetti': 'Architetti', 'artisti': 'Artisti e opere', 'stili': 'Stili', 'dediche': 'Chiese per dedica',
                 'epoche': 'Epoche', 'sepolture': 'Sepolture', 'set': 'Set dei film', 'strade': 'Strade dedicate', 'linee': 'Vie, tram e treni',
                 'luoghi': 'Luoghi della città', 'nomi': 'Nomi delle strade', 'cucine': 'Cucine', 'locali': 'Locali', 'marchi': 'Marchi',
                 'committenti': 'Papi e proprietari', 'famiglie': 'Famiglie nobili'}

PAGINA = r'''<title>Domande da approvare</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400..700&family=Silkscreen&display=swap">
<style>
/* Layout: una colonna di schede su carta, barra dei filtri appiccicata in alto; i colori delle fasce sono quelli del gioco. */
:root {
  --carta: #f3e7c9; --scheda: #fbf4e0; --ink: #2a1f16; --ink2: #5a4636; --linea: rgba(42,31,22,.22); --rosso: #c43a28; --verde: #3f7a34;
  --f0: #a9a397; --f1: #6e9a5a; --f2: #5b8fb8; --f3: #d0663f; --f4: #e8b33a;
  --testo: 'Pixelify Sans', ui-sans-serif, system-ui, sans-serif; --titolo: 'Silkscreen', 'Pixelify Sans', ui-monospace, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --carta: #1f1813; --scheda: #2a211a; --ink: #f3e7c9; --ink2: #c9b796; --linea: rgba(243,231,201,.2); --rosso: #ef6a52; --verde: #8cc77c; color-scheme: dark } }
:root[data-theme="dark"] { --carta: #1f1813; --scheda: #2a211a; --ink: #f3e7c9; --ink2: #c9b796; --linea: rgba(243,231,201,.2); --rosso: #ef6a52; --verde: #8cc77c; color-scheme: dark }
* { box-sizing: border-box }
body { background: var(--carta); color: var(--ink); font: 17px/1.4 var(--testo); font-variant-ligatures: none }
.pagina { max-width: 920px; margin: 0 auto; padding-block: 22px 80px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)) }
h1 { font: 400 clamp(26px, 6vw, 40px)/1 var(--titolo); text-transform: uppercase; letter-spacing: .03em; margin: 0 0 8px; text-wrap: balance }
.intro { color: var(--ink2); margin: 0 0 14px; max-width: 66ch }
.conti { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 14px }
.conto { padding: 6px 10px; background: var(--scheda); box-shadow: 0 0 0 1px var(--ink); font-weight: 600 }
.conto b { font: 400 20px var(--titolo); margin-right: 4px; font-variant-numeric: tabular-nums }
.conto.si b { color: var(--verde) } .conto.no b { color: var(--rosso) }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--carta) }
.filtri { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; background: var(--carta); padding: 10px 0; display: flex; flex-direction: column; gap: 8px; border-bottom: 2px solid var(--ink) }
.riga { display: flex; flex-wrap: wrap; gap: 6px; align-items: center }
input[type=search] { flex: 1 1 220px; min-width: 0; padding: 9px 11px; border: none; background: var(--scheda); color: var(--ink); font: 600 16px var(--testo); box-shadow: inset 0 0 0 1px var(--ink) }
input[type=search]:focus { outline: 2px solid var(--rosso); outline-offset: 1px }
.chip { border: none; padding: 6px 9px; background: var(--scheda); color: var(--ink); font: 600 14px var(--testo); box-shadow: inset 0 0 0 1px var(--linea); cursor: pointer }
.chip[aria-pressed=true] { background: var(--ink); color: var(--carta) }
.chip:focus-visible, button:focus-visible { outline: 2px solid var(--rosso); outline-offset: 2px }
.stato { margin: 6px 0 0; font-size: 14px; color: var(--ink2); min-height: 1.2em }
.elenco { display: flex; flex-direction: column; gap: 8px; margin-top: 14px }
.scheda { background: var(--scheda); box-shadow: 0 0 0 1px var(--linea); padding: 10px 12px; display: grid; grid-template-columns: 1fr auto; gap: 6px 12px; align-items: start }
.scheda[data-voto=si] { box-shadow: 0 0 0 1px var(--linea), inset 4px 0 0 var(--verde) }
.scheda[data-voto=no] { box-shadow: 0 0 0 1px var(--linea), inset 4px 0 0 var(--rosso); opacity: .72 }
.testa { min-width: 0 }
.domanda { font-weight: 650; font-size: 18px; text-wrap: balance }
.meta { font-size: 13px; color: var(--ink2); margin-top: 2px }
.voti { display: flex; gap: 6px }
.voti button { min-width: 52px; padding: 7px 10px; border: none; background: var(--carta); color: var(--ink); font: 400 13px var(--titolo); box-shadow: 0 0 0 1px var(--ink), 0 3px 0 1px var(--ink); cursor: pointer }
.voti button:active { transform: translateY(2px); box-shadow: 0 0 0 1px var(--ink) }
.voti button[aria-pressed=true].si { background: var(--verde); color: var(--scheda) }
.voti button[aria-pressed=true].no { background: var(--rosso); color: var(--scheda) }
.voti button:disabled { opacity: .45; cursor: default }
details { grid-column: 1 / -1 }
summary { cursor: pointer; font-size: 14px; color: var(--ink2); font-weight: 600 }
.fasce { list-style: none; margin: 8px 0 2px; padding: 0; display: flex; flex-direction: column; gap: 5px }
.fasce li { font-size: 14px; display: grid; grid-template-columns: 9.5em 1fr; gap: 8px }
.fasce li > span:first-child { font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; display: flex; align-items: center; gap: 6px }
.fasce li > span:first-child::before { content: ""; width: 11px; height: 11px; flex: none; background: var(--c); box-shadow: 0 0 0 1px var(--ink) }
.luoghi { color: var(--ink2) }
.vuoto { padding: 30px 0; text-align: center; color: var(--ink2) }
@media (max-width: 560px) { .scheda { grid-template-columns: 1fr } .fasce li { grid-template-columns: 1fr } }
@media (prefers-reduced-motion: reduce) { * { transition: none !important } }
</style>
<div class="pagina">
  <h1>Domande da approvare</h1>
  <p class="intro">Le domande nuove per Sampietrino, generate da Wikidata e OpenStreetMap sul modello di quelle fatte a mano. Ognuna ha da 5 a 40 zone giuste e tutte e 5 le fasce: la zona col luogo più famoso vale Da cartolina, quella col più nascosto Da Mino. Dal 1° novembre sono in gioco tutte: segnate No su quelle da togliere e Sì su quelle buone. Le scelte si salvano per tutti e due e a ogni aggiornamento le scartate escono dal gioco.</p>
  <div class="conti" id="conti"></div>
  <div class="filtri">
    <div class="riga"><input type="search" id="cerca" placeholder="Cerca una domanda, una zona, un luogo" aria-label="Cerca"></div>
    <div class="riga" id="stati" role="group" aria-label="Filtra per decisione"></div>
    <div class="riga" id="famiglie" role="group" aria-label="Filtra per famiglia"></div>
  </div>
  <p class="stato" id="stato">Carico le decisioni…</p>
  <div class="elenco" id="elenco"></div>
</div>
<script id="dati" type="application/json">__DATI__</script>
<script>
const DATI = JSON.parse(document.getElementById('dati').textContent);
const FASCE = ['Da cartolina', 'Ce sta', 'Da romano de Roma', 'Chicca', 'Da Mino'];
const COLORI = ['var(--f0)', 'var(--f1)', 'var(--f2)', 'var(--f3)', 'var(--f4)'];
const decisioni = {};
let db = null, puoScrivere = false, filtroStato = 'tutte', filtroFam = 'tutte';
const $ = (id) => document.getElementById(id);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

function conta() {
  const n = { tutte: DATI.domande.length, si: 0, no: 0 };
  for (const d of DATI.domande) { const v = decisioni[d.id]?.voto; if (v === 'si') n.si++; else if (v === 'no') n.no++; }
  n.da = n.tutte - n.si - n.no;
  return n;
}
function disegnaConti() {
  const n = conta();
  $('conti').replaceChildren(...[['', n.tutte, 'domande'], ['si', n.si, 'approvate'], ['no', n.no, 'scartate'], ['', n.da, 'da vedere']].map(([c, v, t]) => {
    const s = el('span', 'conto ' + c); s.append(el('b', null, v), t); return s;
  }));
  $('stati').replaceChildren(...[['tutte', 'Tutte'], ['da', 'Da vedere'], ['si', 'Approvate'], ['no', 'Scartate']].map(([k, t]) => {
    const b = el('button', 'chip', `${t} ${k === 'tutte' ? n.tutte : n[k]}`);
    b.setAttribute('aria-pressed', String(filtroStato === k));
    b.addEventListener('click', () => { filtroStato = k; disegna(); });
    return b;
  }));
}
function disegnaFamiglie() {
  const per = {};
  for (const d of DATI.domande) per[d.famiglia] = (per[d.famiglia] || 0) + 1;
  $('famiglie').replaceChildren(...[['tutte', 'Tutte le famiglie', DATI.domande.length], ...Object.entries(per).sort((a, b) => b[1] - a[1]).map(([f, n]) => [f, DATI.famiglie[f] || f, n])].map(([k, t, n]) => {
    const b = el('button', 'chip', `${t} ${n}`);
    b.setAttribute('aria-pressed', String(filtroFam === k));
    b.addEventListener('click', () => { filtroFam = k; disegnaFamiglie(); disegna(); });
    return b;
  }));
}
function scheda(d) {
  const v = decisioni[d.id]?.voto || '';
  const s = el('article', 'scheda');
  s.dataset.voto = v;
  const testa = el('div', 'testa');
  testa.append(el('div', 'domanda', d.testo), el('div', 'meta', `${d.zone.length} zone giuste · ${DATI.famiglie[d.famiglia] || d.famiglia}`));
  const voti = el('div', 'voti');
  for (const [k, t] of [['si', 'Sì'], ['no', 'No']]) {
    const b = el('button', k, t);
    b.setAttribute('aria-pressed', String(v === k));
    b.disabled = !puoScrivere;
    b.addEventListener('click', () => vota(d.id, v === k ? null : k));
    voti.append(b);
  }
  const det = el('details');
  det.append(el('summary', null, 'Zone giuste per fascia'));
  const ul = el('ul', 'fasce');
  for (let liv = 4; liv >= 0; liv--) {
    const zs = d.zone.filter((z) => z[1] === liv);
    if (!zs.length) continue;
    const li = el('li');
    const f = el('span', null, FASCE[liv]); f.style.setProperty('--c', COLORI[liv]);
    const z = el('span');
    zs.forEach((x, i) => { z.append(el('b', null, x[0])); if (x[2]) z.append(el('span', 'luoghi', ` (${x[2]})`)); if (i < zs.length - 1) z.append(' · '); });
    li.append(f, z); ul.append(li);
  }
  det.append(ul);
  s.append(testa, voti, det);
  return s;
}
function disegna() {
  disegnaConti();
  const q = $('cerca').value.trim().toLowerCase();
  const lista = DATI.domande.filter((d) => {
    const v = decisioni[d.id]?.voto;
    if (filtroStato === 'si' && v !== 'si') return false;
    if (filtroStato === 'no' && v !== 'no') return false;
    if (filtroStato === 'da' && v) return false;
    if (filtroFam !== 'tutte' && d.famiglia !== filtroFam) return false;
    if (q && !(d.testo.toLowerCase().includes(q) || d.zone.some((z) => z[0].toLowerCase().includes(q) || (z[2] || '').toLowerCase().includes(q)))) return false;
    return true;
  });
  $('elenco').replaceChildren(...(lista.length ? lista.slice(0, 400).map(scheda) : [el('p', 'vuoto', 'Nessuna domanda con questi filtri.')]));
}
async function vota(id, voto) {
  if (!db) return;
  const prima = decisioni[id];
  decisioni[id] = { ...(prima || {}), voto };
  disegna();
  try { await db.doc('decisioni/' + id).set({ voto, quando: Date.now() }); }
  catch (e) { decisioni[id] = prima; disegna(); $('stato').textContent = 'Non sono riuscito a salvare: riprova tra un attimo.'; }
}
$('cerca').addEventListener('input', disegna);
disegnaFamiglie();
disegna();
(async () => {
  const tempo = setTimeout(() => { $('stato').textContent = 'Le decisioni non arrivano: puoi guardare le domande, ma per votare riapri la pagina.'; }, 10000);
  try {
    db = window.claude ? await window.claude.use('db') : null;
    const user = window.claude ? await window.claude.use('user') : null;
    if (!db) { clearTimeout(tempo); $('stato').textContent = 'Per votare entra in claude.ai con un account che può modificare questa pagina.'; return; }
    puoScrivere = (await user?.can?.('data.write')) !== false;
    db.collection('decisioni').onSnapshot((snap) => {
      clearTimeout(tempo);
      for (const k of Object.keys(decisioni)) delete decisioni[k];
      for (const doc of snap.docs) decisioni[doc.id] = doc.data();
      $('stato').textContent = puoScrivere ? 'Le decisioni si salvano da sole, per tutti e due.' : 'Puoi guardare, ma non votare: chiedi a Simone di darti i permessi di modifica.';
      disegna();
    }, () => { clearTimeout(tempo); $('stato').textContent = 'Non riesco a leggere le decisioni: riapri la pagina.'; });
  } catch { clearTimeout(tempo); $('stato').textContent = 'Non riesco a collegarmi alle decisioni: riapri la pagina.'; }
})();
</script>
'''


def main():
    g = json.loads((RADICE / 'dati' / 'gioco.json').read_text())
    zn = {z['id']: z['nome'] for z in g['zone']}
    gen = [d for d in g['domande'] if d.get('generata')]
    dati = {'famiglie': NOMI_FAMIGLIE, 'domande': [{
        'id': d['id'], 'testo': d['testo'], 'famiglia': d['famiglia'],
        'zone': sorted(([zn[z], l, ', '.join(d.get('perche', {}).get(z, []))] for z, l in d['catalogo'].items()), key=lambda x: (-x[1], x[0])),
    } for d in sorted(gen, key=lambda d: (d['famiglia'], d['testo']))]}
    testo = json.dumps(dati, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    out = RADICE / 'docs' / 'revisione-domande.html'
    out.write_text(PAGINA.replace('__DATI__', testo))
    print(f'Scritta {out.relative_to(RADICE)}: {len(gen)} domande generate, {out.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
