// Interfaccia di Sampietrino: mappa SVG, un biglietto per tappa, catalogo delle risposte, riepilogo.
import {
  SCALA, MASSIMO_AL_GIORNO, fascia, risposte, nuovaDomanda, pinna, totale, domandeDelGiorno, DOMANDE_AL_GIORNO,
} from './motore.js';

const NS = 'http://www.w3.org/2000/svg';
const $ = (id) => document.getElementById(id);

const oggi = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
const CHIAVE = `sampietrino:${oggi}`;

let dati, zonePerId, domande, stati, corrente, selezionata;
const percorsi = new Map();

function salva() {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify({ stati: stati.map((s) => ({ pin: s.pin })), corrente }));
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
  // Copertina solo a giornata non ancora iniziata.
  if (corrente === 0 && !stati[0].pin) {
    $('scala').replaceChildren(...[...SCALA].reverse().map((f) => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${f.nome}</span><b>+${f.punti}</b>`;
      return li;
    }));
    $('copertina-data').textContent = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'long' }).format(new Date());
    $('copertina').showModal();
  }
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
  el('rect', { width: 0.6, height: 0.6, fill: '#cddbd2' }, motivo);
  el('line', { x1: 0, y1: 0, x2: 0, y2: 0.6, stroke: '#b3c8bb', 'stroke-width': 0.25 }, motivo);
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

// Etichette sempre a 18 px sullo schermo, a qualsiasi zoom e su qualsiasi schermo.
function kmPerPixel() {
  const r = $('svg').getBoundingClientRect();
  return Math.max(vista.w / r.width, vista.h / r.height) || vista.w / 400;
}

function etichetta(z, classe = '') {
  const t = el('text', { x: z.centro[0], y: z.centro[1], class: `etichetta ${classe}`, 'font-size': 18 * kmPerPixel(), 'stroke-width': 4 * kmPerPixel() }, $('etichette'));
  t.textContent = z.nome;
}

function ridisegna() {
  const s = stati[corrente];
  const d = s?.domanda;
  const chiusa = !!s?.pin;
  for (const [id, p] of percorsi) {
    const pin = s?.pin?.zona === id ? s.pin : null;
    // Il bersaglio si mostra solo a domanda chiusa: prima rivelerebbe le risposte.
    p.classList.toggle('bersaglio', chiusa && !!d?.evidenzia?.includes(id));
    p.classList.toggle('scelta', id === selezionata);
    p.classList.toggle('giusta', !!pin && pin.fascia !== null);
    p.classList.toggle('sbagliata', !!pin && pin.fascia === null);
    p.classList.toggle('soluzione', chiusa && !pin && id in d.catalogo);
  }
  for (const m of document.querySelectorAll('.municipio')) {
    m.classList.toggle('acceso', chiusa && Number(m.dataset.num) === d?.evidenziaMunicipio);
  }
  $('etichette').replaceChildren();
  // Un'etichetta che cadrebbe sopra un'altra si salta: a mappa intera i centri sono vicini.
  const messe = [];
  const metti = (z, classe) => {
    const minimo = 60 * kmPerPixel();
    if (messe.some(([x, y]) => Math.abs(x - z.centro[0]) < minimo && Math.abs(y - z.centro[1]) < minimo / 3)) return;
    messe.push(z.centro);
    etichetta(z, classe);
  };
  if (chiusa) for (const id of d?.evidenzia || []) metti(zonePerId[id], 'bersaglio');
  if (s?.pin) metti(zonePerId[s.pin.zona]);

  const ol = $('pin');
  ol.replaceChildren();
  const li = document.createElement('li');
  const pin = s?.pin;
  if (!pin) { li.className = 'vuoto'; li.textContent = 'biglietto da timbrare'; }
  else if (pin.fascia === null) { li.className = 'buca'; li.innerHTML = `<span>${zonePerId[pin.zona].nome}</span><b>buca</b>`; }
  else li.innerHTML = `<span>${zonePerId[pin.zona].nome} · ${pin.fascia}</span><b>+${pin.punti}</b>`;
  li.title = pin ? zonePerId[pin.zona].nome : '';
  ol.appendChild(li);
  $('totale').textContent = totale(stati.slice(0, corrente + 1));
  $('pianta').disabled = !selezionata || chiusa;
  $('scelta').textContent = selezionata
    ? 'Zona scelta. Il nome lo scopri timbrando'
    : chiusa ? (pin.fascia ? `${pin.fascia}: +${pin.punti}` : 'Buca: questa tappa vale 0')
      : 'Tocca una zona sulla mappa';
}

function mostraDomanda() {
  const s = stati[corrente];
  selezionata = null;
  $('numero').textContent = `Tappa ${corrente + 1} di ${DOMANDE_AL_GIORNO}`;
  $('testo').textContent = s.domanda.testo;
  inquadra(s.domanda, false);
  ridisegna();
  if (s.pin) mostraEsito();
}

function tocca(id) {
  const s = stati[corrente];
  if (!s || s.pin) return;
  selezionata = selezionata === id ? null : id;
  ridisegna();
}

function pianta() {
  if (!selezionata) return;
  stati[corrente] = pinna(stati[corrente], selezionata);
  selezionata = null;
  salva();
  ridisegna();
  setTimeout(mostraEsito, 500);
}

function mostraEsito() {
  const s = stati[corrente];
  inquadra(s.domanda, true);
  ridisegna();
  const nome = zonePerId[s.pin.zona].nome;
  $('esito-titolo').textContent = s.pin.fascia ? `${s.pin.fascia}!` : 'Buca!';
  $('esito-testo').textContent = s.pin.fascia
    ? `${nome}: +${s.pin.punti} sampietrini. Tutte le risposte, fascia per fascia:`
    : `${nome} non va bene: questa tappa vale 0. Le risposte giuste erano:`;
  // Il catalogo intero, dalla fascia piu alta alla piu bassa.
  const blocchi = [];
  for (let liv = SCALA.length - 1; liv >= 0; liv--) {
    const zone = risposte(s.domanda).filter((id) => s.domanda.catalogo[id] === liv)
      .map((id) => zonePerId[id].nome).sort((a, b) => a.localeCompare(b, 'it'));
    if (!zone.length) continue;
    const li = document.createElement('li');
    const titolo = document.createElement('b');
    titolo.textContent = `${SCALA[liv].nome} +${SCALA[liv].punti}`;
    li.append(titolo, document.createElement('br'));
    for (const [i, n] of zone.entries()) {
      const span = document.createElement('span');
      span.textContent = n + (i < zone.length - 1 ? ', ' : '');
      if (n === nome) span.className = 'tua';
      li.append(span);
    }
    blocchi.push(li);
  }
  $('soluzioni').replaceChildren(...blocchi);
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
  $('fine-massimo').textContent = `sampietrini su ${MASSIMO_AL_GIORNO}`;
  const QUADRI = ['⬜', '🟨', '🟧', '🟥', '🟫'];
  const righe = stati.map((s) => {
    if (!s.pin?.fascia) return '🕳️ buca';
    const liv = SCALA.findIndex((f) => f.nome === s.pin.fascia);
    return `${QUADRI[liv]} ${s.pin.fascia} +${s.pin.punti}`;
  });
  $('condividi').textContent = `Diario di Sampietrino ${oggi}\n${righe.join('\n')}\nTotale ${tot}/${MASSIMO_AL_GIORNO}`;
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

// Tastiera su desktop: Invio timbra, Esc annulla la scelta.
document.addEventListener('keydown', (e) => {
  if ($('copertina').open) return;
  if ($('esito').open || $('fine').open) {
    if (e.key === 'Enter' && $('esito').open) { e.preventDefault(); avanti(); }
    return;
  }
  if (e.key === 'Enter' && !$('pianta').disabled) { e.preventDefault(); pianta(); }
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
  inquadra(s?.domanda || {}, !!s?.pin);
  ridisegna();
}).observe($('mappa'));

$('daje').addEventListener('click', () => $('copertina').close());
$('pianta').addEventListener('click', pianta);
$('avanti').addEventListener('click', avanti);
$('copia').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('condividi').textContent); $('copia').textContent = 'Copiato'; } catch { $('copia').textContent = 'Copia a mano dal riquadro'; }
});

avvia().catch((err) => {
  $('testo').textContent = `Errore nel caricare il gioco: ${err.message}`;
});
