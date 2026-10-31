// Interfaccia di Sampietrino: mappa SVG, pin, banca, riepilogo.
import {
  punti, nuovaDomanda, pinna, fermati, totale, domandeDelGiorno, PIN_PER_DOMANDA, DOMANDE_AL_GIORNO,
} from './motore.js';

const NS = 'http://www.w3.org/2000/svg';
const $ = (id) => document.getElementById(id);

const oggi = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
const CHIAVE = `sampietrino:${oggi}`;

let dati, notorieta, zonePerId, domande, stati, corrente, selezionata;
const percorsi = new Map();

function salva() {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify({ stati: stati.map((s) => ({ pin: s.pin, banco: s.banco, esito: s.esito })), corrente }));
  } catch { /* senza memoria si gioca lo stesso */ }
}

function ripristina() {
  try {
    const v = JSON.parse(localStorage.getItem(CHIAVE));
    if (!v || v.stati.length !== domande.length) return false;
    stati = v.stati.map((s, i) => ({ ...s, domanda: domande[i] }));
    corrente = v.corrente;
    return true;
  } catch { return false; }
}

async function avvia() {
  dati = await (await fetch('dati/gioco.json')).json();
  notorieta = Object.fromEntries(dati.zone.map((z) => [z.id, z.notorieta]));
  zonePerId = Object.fromEntries(dati.zone.map((z) => [z.id, z]));
  domande = domandeDelGiorno(oggi, dati.domande);
  if (!ripristina()) {
    stati = domande.map(nuovaDomanda);
    corrente = 0;
  }
  $('data').textContent = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  $('attribuzione').textContent = dati.attribuzione;
  disegnaMappa();
  attivaZoom();
  if (corrente >= domande.length) mostraFine();
  else mostraDomanda();
}

function el(tag, attr = {}, padre) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attr)) e.setAttribute(k, v);
  if (padre) padre.appendChild(e);
  return e;
}

function disegnaMappa() {
  const svg = $('svg');
  const [w, h] = dati.dimensioni;
  vista = { x: 0, y: 0, w, h };
  aggiornaVista();
  const defs = el('defs', {}, svg);
  const motivo = el('pattern', { id: 'fuori', width: 0.6, height: 0.6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
  el('rect', { width: 0.6, height: 0.6, fill: '#ddd2bf' }, motivo);
  el('line', { x1: 0, y1: 0, x2: 0, y2: 0.6, stroke: '#cbbfa9', 'stroke-width': 0.25 }, motivo);
  el('path', { d: dati.comune, class: 'comune', 'fill-rule': 'evenodd' }, svg);
  const gZone = el('g', {}, svg);
  for (const z of dati.zone) {
    const p = el('path', { d: z.d, class: 'zona', 'data-id': z.id, 'fill-rule': 'evenodd' }, gZone);
    percorsi.set(z.id, p);
  }
  const gMun = el('g', { id: 'municipi' }, svg);
  for (const m of dati.municipi) el('path', { d: m.d, class: 'municipio', 'data-num': m.num }, gMun);
  el('g', { id: 'etichette' }, svg);
}

// Etichette sempre a 15 px sullo schermo, a qualsiasi zoom e su qualsiasi schermo.
function kmPerPixel() {
  const r = $('svg').getBoundingClientRect();
  return Math.max(vista.w / r.width, vista.h / r.height) || vista.w / 400;
}

function etichetta(z, classe = '') {
  const t = el('text', { x: z.centro[0], y: z.centro[1], class: `etichetta ${classe}`, 'font-size': 15 * kmPerPixel(), 'stroke-width': 3.5 * kmPerPixel() }, $('etichette'));
  t.textContent = z.nome;
}

function ridisegna() {
  const s = stati[corrente];
  const d = s?.domanda;
  const chiusa = s && s.esito !== 'aperta';
  for (const [id, p] of percorsi) {
    const pin = s?.pin.find((x) => x.zona === id);
    // Il bersaglio si mostra solo a domanda chiusa: prima rivelerebbe le risposte.
    p.classList.toggle('bersaglio', chiusa && !!d?.evidenzia?.includes(id));
    p.classList.toggle('scelta', id === selezionata);
    p.classList.toggle('giusta', !!pin && pin.punti !== null);
    p.classList.toggle('sbagliata', !!pin && pin.punti === null);
    p.classList.toggle('soluzione', chiusa && !pin && d.risposte.includes(id));
  }
  for (const m of document.querySelectorAll('.municipio')) {
    m.classList.toggle('acceso', chiusa && Number(m.dataset.num) === d?.evidenziaMunicipio);
  }
  $('etichette').replaceChildren();
  if (chiusa) for (const id of d?.evidenzia || []) etichetta(zonePerId[id], 'bersaglio');
  for (const pin of s?.pin || []) etichetta(zonePerId[pin.zona]);

  const ol = $('pin');
  ol.replaceChildren();
  for (let i = 0; i < PIN_PER_DOMANDA; i++) {
    const li = document.createElement('li');
    const pin = s?.pin[i];
    if (!pin) { li.className = 'vuoto'; li.textContent = `pin ${i + 1}`; }
    else if (pin.punti === null) { li.className = 'buca'; li.innerHTML = `${zonePerId[pin.zona].nome}<b>buca</b>`; }
    else li.innerHTML = `${zonePerId[pin.zona].nome}<b>+${pin.punti}</b>`;
    ol.appendChild(li);
  }
  $('totale').textContent = totale(stati.slice(0, corrente + (chiusa ? 1 : 0))) + (s && !chiusa ? s.banco : 0);
  $('pianta').disabled = !selezionata || chiusa;
  $('fermati').disabled = !s || chiusa || s.pin.length === 0;
  const messaggi = { buca: 'Buca: questa domanda vale 0', fermata: `In banca ${s?.banco}`, piena: `Tre su tre: ${s?.banco}` };
  $('scelta').textContent = selezionata
    ? 'Zona scelta. Il nome lo scopri col pin'
    : chiusa ? messaggi[s.esito]
      : s?.pin.length ? `In banca ${s.banco}. Ti fermi o rischi?` : 'Tocca una zona sulla mappa';
}

function mostraDomanda() {
  const s = stati[corrente];
  selezionata = null;
  $('numero').textContent = `Domanda ${corrente + 1} di ${DOMANDE_AL_GIORNO}`;
  $('testo').textContent = s.domanda.testo;
  inquadra(s.domanda, false);
  ridisegna();
  if (s.esito !== 'aperta') mostraEsito();
}

function tocca(id) {
  const s = stati[corrente];
  if (!s || s.esito !== 'aperta') return;
  if (s.pin.some((p) => p.zona === id)) return;
  selezionata = selezionata === id ? null : id;
  ridisegna();
}

function pianta() {
  if (!selezionata) return;
  stati[corrente] = pinna(stati[corrente], selezionata, notorieta);
  selezionata = null;
  salva();
  ridisegna();
  if (stati[corrente].esito !== 'aperta') setTimeout(mostraEsito, 500);
}

function fermaQui() {
  stati[corrente] = fermati(stati[corrente]);
  salva();
  ridisegna();
  mostraEsito();
}

function mostraEsito() {
  const s = stati[corrente];
  inquadra(s.domanda, true);
  ridisegna();
  const titoli = { buca: 'Buca!', fermata: 'In banca', piena: 'Tre su tre' };
  $('esito-titolo').textContent = titoli[s.esito];
  $('esito-testo').textContent = s.esito === 'buca'
    ? `${zonePerId[s.pin.at(-1).zona].nome} non va bene. Questa domanda vale 0.`
    : `Porti a casa ${s.banco} sampietrini. Ecco tutte le risposte giuste:`;
  const mie = new Set(s.pin.map((p) => p.zona));
  const lista = [...s.domanda.risposte]
    .map((id) => ({ id, p: punti(s.domanda, id, notorieta) }))
    .sort((a, b) => b.p - a.p);
  $('soluzioni').replaceChildren(...lista.map(({ id, p }) => {
    const li = document.createElement('li');
    li.innerHTML = `${zonePerId[id].nome} <b>${p}</b>`;
    if (mie.has(id)) li.className = 'tua';
    return li;
  }));
  $('esito').showModal();
}

function avanti() {
  $('esito').close();
  corrente += 1;
  salva();
  if (corrente >= domande.length) mostraFine();
  else mostraDomanda();
}

function mostraFine() {
  const tot = totale(stati);
  $('totale').textContent = tot;
  $('fine-totale').textContent = tot;
  const righe = stati.map((s) => {
    if (s.esito === 'buca') return '🕳️';
    return s.pin.map((p) => (p.punti >= 8 ? '🟫' : p.punti >= 4 ? '🟧' : '⬜')).join('') + ` ${s.banco}`;
  });
  $('condividi').textContent = `Sampietrino ${oggi}\n${righe.join('\n')}\nTotale ${tot}/150`;
  $('numero').textContent = 'Fine';
  $('testo').textContent = `${tot} sampietrini oggi`;
  selezionata = null;
  corrente = domande.length;
  inquadra({}, false);
  ridisegna();
  $('fine').showModal();
}

// Zoom e trascinamento: rotella, pizzico, bottoni. Un tocco senza movimento seleziona.
let vista;
function aggiornaVista() {
  $('svg').setAttribute('viewBox', `${vista.x} ${vista.y} ${vista.w} ${vista.h}`);
}

function zoomA(fattore, cx, cy) {
  const [W, H] = dati.dimensioni;
  const nw = Math.min(W, Math.max(1.5, vista.w * fattore));
  const k = nw / vista.w;
  vista = { x: cx - (cx - vista.x) * k, y: cy - (cy - vista.y) * k, w: nw, h: vista.h * k };
  aggiornaVista();
  ridisegna();
}

// A domanda aperta la mappa parte intera: inquadrare il bersaglio rivelerebbe dove sta.
// A domanda chiusa inquadra la zona (o il municipio) della domanda, per mostrare le soluzioni.
function inquadra(domanda, chiusa) {
  const [W, H] = dati.dimensioni;
  const forme = !chiusa ? [] : [
    ...(domanda.evidenzia || []).map((id) => percorsi.get(id)),
    ...[...document.querySelectorAll('.municipio')].filter((m) => Number(m.dataset.num) === domanda.evidenziaMunicipio),
  ];
  if (!forme.length) { vista = { x: 0, y: 0, w: W, h: H }; aggiornaVista(); return; }
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of forme) {
    const b = f.getBBox();
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
  }
  const margine = domanda.evidenziaMunicipio ? 1.25 : 3;
  const r = $('svg').getBoundingClientRect();
  const aspetto = r.width / r.height || W / H;
  let w = Math.max(5, (x1 - x0) * margine, (y1 - y0) * margine * aspetto);
  w = Math.min(w, W);
  const h = w / aspetto;
  vista = { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h };
  aggiornaVista();
}

function puntoSvg(ev) {
  const r = $('svg').getBoundingClientRect();
  const s = Math.max(vista.w / r.width, vista.h / r.height);
  const ox = (r.width * s - vista.w) / 2;
  const oy = (r.height * s - vista.h) / 2;
  return [vista.x - ox + (ev.clientX - r.left) * s, vista.y - oy + (ev.clientY - r.top) * s, s];
}

function attivaZoom() {
  const svg = $('svg');
  const tocchi = new Map();
  let mosso = false;
  let distanza0 = 0;

  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId);
    tocchi.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, target: e.target });
    mosso = false;
    if (tocchi.size === 2) {
      const [a, b] = [...tocchi.values()];
      distanza0 = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });
  svg.addEventListener('pointermove', (e) => {
    const t = tocchi.get(e.pointerId);
    if (!t) return;
    if (Math.hypot(e.clientX - t.x0, e.clientY - t.y0) > 6) mosso = true;
    if (tocchi.size === 1 && mosso) {
      const [, , s] = puntoSvg(e);
      vista.x -= (e.clientX - t.x) * s;
      vista.y -= (e.clientY - t.y) * s;
      aggiornaVista();
      svg.classList.add('trascino');
    }
    t.x = e.clientX; t.y = e.clientY;
    if (tocchi.size === 2) {
      const [a, b] = [...tocchi.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (distanza0 > 0) {
        const [cx, cy] = puntoSvg({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
        zoomA(distanza0 / d, cx, cy);
      }
      distanza0 = d;
    }
  });
  const fine = (e) => {
    const t = tocchi.get(e.pointerId);
    tocchi.delete(e.pointerId);
    svg.classList.remove('trascino');
    if (t && !mosso && tocchi.size === 0) {
      const id = document.elementFromPoint(e.clientX, e.clientY)?.dataset?.id;
      if (id) tocca(id);
    }
  };
  svg.addEventListener('pointerup', fine);
  svg.addEventListener('pointercancel', (e) => { tocchi.delete(e.pointerId); });
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [cx, cy] = puntoSvg(e);
    zoomA(e.deltaY > 0 ? 1.15 : 1 / 1.15, cx, cy);
  }, { passive: false });
  const centro = () => [vista.x + vista.w / 2, vista.y + vista.h / 2];
  $('piu').addEventListener('click', () => zoomA(1 / 1.5, ...centro()));
  $('meno').addEventListener('click', () => zoomA(1.5, ...centro()));
}

// Tastiera su desktop: Invio mette il pin, F ferma, Esc annulla la scelta.
document.addEventListener('keydown', (e) => {
  if ($('esito').open || $('fine').open) {
    if (e.key === 'Enter' && $('esito').open) { e.preventDefault(); avanti(); }
    return;
  }
  if (e.key === 'Enter' && !$('pianta').disabled) { e.preventDefault(); pianta(); }
  else if (e.key.toLowerCase() === 'f' && !$('fermati').disabled) fermaQui();
  else if (e.key === 'Escape' && selezionata) { selezionata = null; ridisegna(); }
});

// Rotazione del telefono o finestra ridimensionata: si ricalcola l'inquadratura.
let ultimaForma = '';
new ResizeObserver(() => {
  const r = $('svg').getBoundingClientRect();
  // Solo la larghezza: su telefono la barra degli indirizzi cambia l'altezza e azzererebbe lo zoom.
  const forma = `${Math.round(r.width)}`;
  if (!dati || forma === ultimaForma) return;
  ultimaForma = forma;
  const s = stati?.[corrente];
  inquadra(s?.domanda || {}, !!s && s.esito !== 'aperta');
  ridisegna();
}).observe($('mappa'));

$('pianta').addEventListener('click', pianta);
$('fermati').addEventListener('click', fermaQui);
$('avanti').addEventListener('click', avanti);
$('copia').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('condividi').textContent); $('copia').textContent = 'Copiato'; } catch { $('copia').textContent = 'Copia a mano dal riquadro'; }
});

avvia().catch((err) => {
  $('testo').textContent = `Errore nel caricare il gioco: ${err.message}`;
});
