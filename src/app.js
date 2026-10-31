// Interfaccia di Sampietrino: la mappa, un biglietto per tappa, l'esito della sola tua risposta,
// il diario finale con tutte le risposte tappa per tappa.
import {
  SCALA, MASSIMO_AL_GIORNO, risposte, nuovaDomanda, pinna, totale, domandeDelGiorno, DOMANDE_AL_GIORNO,
} from './motore.js';
import { creaMappa, COLORI_FASCE } from './mappa.js';

const $ = (id) => document.getElementById(id);

const oggi = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
const CHIAVE = `sampietrino:${oggi}`;
const TEMPO = 60; // secondi per tappa
const MOTO_RIDOTTO = matchMedia('(prefers-reduced-motion: reduce)');
const dopo = (ms) => (MOTO_RIDOTTO.matches ? 0 : ms);
let orologio = null;

let dati, zonePerId, domande, stati, corrente, selezionata, mappa, aperta = -1;

function salva() {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify({ stati: stati.map((s) => ({ pin: s.pin, inizio: s.inizio })), corrente }));
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

const nomeZona = (id) => (id ? zonePerId[id].nome : 'tempo scaduto');
const livelloDi = (nomeFascia) => SCALA.findIndex((f) => f.nome === nomeFascia);
const coloreT = (liv) => `var(--f${liv}-t)`;

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
  mappa = creaMappa($('tela'), dati, { onTocca: tocca });
  $('tela').mappa = mappa; // maniglia per le prove nel browser
  $('totale').textContent = totale(stati);
  // Copertina solo a giornata non ancora iniziata. Si apre prima di mostrare la domanda:
  // a copertina aperta l'orologio aspetta DAJE!, altrimenti la tappa 1 perde secondi.
  if (corrente === 0 && !stati[0].pin) {
    $('scala').replaceChildren(...[...SCALA].reverse().map((f) => {
      const li = document.createElement('li');
      const liv = livelloDi(f.nome);
      li.style.setProperty('--colore', COLORI_FASCE[liv]);
      li.style.setProperty('--colore-t', coloreT(liv));
      li.innerHTML = `<i></i><span>${f.nome}</span><b>+${f.punti}</b>`;
      return li;
    }));
    $('copertina-data').textContent = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'long' }).format(new Date());
    $('copertina').showModal();
  }
  if (corrente >= domande.length) mostraFine(false);
  else if (stati[corrente].pin) mostraEsito(false);
  else mostraTappa(false);
}

function pagina(id, anima = true) {
  for (const p of ['pagina-tappa', 'pagina-esito', 'pagina-diario']) $(p).hidden = p !== id;
  const el = $(id);
  el.classList.remove('entra');
  if (anima) { void el.offsetWidth; el.classList.add('entra'); }
}

function aggiornaTappe() {
  const ol = $('tappe');
  if (ol.children.length !== domande.length) ol.replaceChildren(...domande.map(() => document.createElement('li')));
  stati.forEach((s, i) => {
    const li = ol.children[i];
    const liv = s.pin?.fascia ? livelloDi(s.pin.fascia) : -1;
    const fatta = !!s.pin;
    if (fatta && !li.classList.contains('fatta') && !li.classList.contains('buca')) {
      li.classList.add(liv >= 0 ? 'fatta' : 'buca');
      if (liv >= 0) li.style.backgroundColor = COLORI_FASCE[liv];
    }
    li.classList.toggle('ora', i === corrente && !fatta);
    li.title = fatta ? `${i + 1}. ${nomeZona(s.pin.zona)}${s.pin.fascia ? ` · ${s.pin.fascia}` : ''}` : `Tappa ${i + 1}`;
  });
}

// Il numero in testata sale contando, con uno scatto alla fine.
function contaFino(el, a, b, durata = 700) {
  if (a === b || MOTO_RIDOTTO.matches) { el.textContent = b; return; }
  const t0 = performance.now();
  const passo = (t) => {
    const p = Math.min(1, (t - t0) / durata);
    el.textContent = Math.round(a + (b - a) * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(passo);
    else { el.classList.remove('scatto'); void el.offsetWidth; el.classList.add('scatto'); }
  };
  requestAnimationFrame(passo);
}

// --- Tappa in corso ---

function mostraTappa(anima = true) {
  const s = stati[corrente];
  selezionata = null;
  $('cartellino').hidden = true;
  $('numero').textContent = `Tappa ${corrente + 1} di ${DOMANDE_AL_GIORNO}`;
  $('testo').textContent = s.domanda.testo;
  pagina('pagina-tappa', anima);
  aggiornaTappe();
  aggiornaBiglietto();
  aggiornaTempo(s.inizio ? Math.max(0, TEMPO - Math.floor((Date.now() - s.inizio) / 1000)) : TEMPO);
  // A tappa aperta la mappa parte intera: inquadrare il bersaglio rivelerebbe dove sta.
  mappa.imposta({ stato: () => 'normale', scegli: true });
  mappa.inquadra({}, anima);
  if (!$('copertina').open) avviaOrologio();
}

function aggiornaBiglietto() {
  const chiusa = !!stati[corrente]?.pin;
  $('pianta').disabled = !selezionata || chiusa;
  $('scelta').textContent = selezionata ? zonePerId[selezionata].nome : 'Tocca una zona sulla mappa';
  $('scelta').classList.remove('qui');
  if (selezionata) { void $('scelta').offsetWidth; $('scelta').classList.add('qui'); }
  if (chiusa) return;
  mappa.imposta({
    stato: (id) => (id === selezionata ? 'scelta' : 'normale'),
    selezione: selezionata,
    etichette: selezionata ? [{ id: selezionata }] : [],
    scegli: true,
  });
}

function aggiornaTempo(resto) {
  $('tempo').textContent = resto;
  $('tempo').parentElement.classList.toggle('poco', resto <= 10);
  $('barra').style.transform = `scaleX(${resto / TEMPO})`;
  $('barra').parentElement.classList.toggle('meta', resto <= 30 && resto > 10);
  $('barra').parentElement.classList.toggle('poco', resto <= 10);
}

// Il tempo parte quando vedi la domanda e sopravvive a una ricarica: ricaricare non regala secondi.
function avviaOrologio() {
  const s = stati[corrente];
  if (!s || s.pin) return;
  if (!s.inizio) { s.inizio = Date.now(); salva(); }
  clearInterval(orologio);
  const scatta = () => {
    const resto = Math.max(0, TEMPO - Math.floor((Date.now() - s.inizio) / 1000));
    aggiornaTempo(resto);
    if (resto === 0) {
      clearInterval(orologio);
      selezionata = null;
      chiudiTappa(null);
    }
  };
  scatta();
  orologio = setInterval(scatta, 250);
}

function tocca(id) {
  const s = stati[corrente];
  if (!s || s.pin || corrente >= domande.length) return;
  selezionata = selezionata === id ? null : id;
  aggiornaBiglietto();
}

function pianta() {
  if (!selezionata) return;
  const id = selezionata;
  selezionata = null;
  $('biglietto').classList.remove('timbrato');
  void $('biglietto').offsetWidth;
  $('biglietto').classList.add('timbrato');
  chiudiTappa(id);
}

// Chiude la tappa: il sampietrino cade, la zona si accende dal punto in cui e caduto,
// poi arriva il cartellino. Solo la tua risposta: le altre si vedono nel diario.
function chiudiTappa(id) {
  clearInterval(orologio);
  const prima = totale(stati);
  stati[corrente] = pinna(stati[corrente], id);
  salva();
  $('pianta').disabled = true;
  rivelaTappa(stati[corrente], true);
  setTimeout(() => {
    aggiornaTappe();
    contaFino($('totale'), prima, totale(stati));
  }, dopo(1250));
  setTimeout(() => mostraEsito(true), dopo(id ? 1050 : 350));
}

// La mappa a tappa chiusa: la tua zona col colore della fascia (o rossa), il bersaglio della domanda.
function rivelaTappa(s, anima) {
  const { pin, domanda: d } = s;
  const liv = pin.fascia ? livelloDi(pin.fascia) : null;
  mappa.imposta({
    stato: (id) => {
      if (id === pin.zona) return liv === null ? 'sbagliata' : `r${liv}`;
      if (d.evidenzia?.includes(id)) return 'bersaglio';
      return 'normale';
    },
    pins: pin.zona ? [{ id: pin.zona, livello: liv, cade: anima }] : [],
    etichette: [
      ...(pin.zona ? [{ id: pin.zona, colore: liv === null ? '#c43a28' : COLORI_FASCE[liv], ritardo: anima ? 900 : 0 }] : []),
      ...(d.evidenzia || []).map((e) => ({ id: e, inverso: true, ritardo: anima ? 1100 : 0 })),
    ],
    municipio: d.evidenziaMunicipio ?? null,
    macchia: anima ? { ritardo: (id) => (id === pin.zona ? 430 : 700), durata: 750 } : null,
  });
  const fuoco = [...(pin.zona ? [pin.zona] : []), ...(d.evidenzia || [])];
  if (fuoco.length) mappa.inquadra({ zone: fuoco, durata: 850, alza: 0.16 }, anima);
  else if (d.evidenziaMunicipio) mappa.inquadra({ municipio: d.evidenziaMunicipio, alza: 0.16 }, anima);
}

function perche(domanda, id) {
  const luoghi = domanda.perche?.[id];
  return luoghi?.length ? luoghi.join(' · ') : '';
}

function mostraEsito(anima) {
  const s = stati[corrente];
  const { pin } = s;
  const liv = pin.fascia ? livelloDi(pin.fascia) : null;
  if (!anima) rivelaTappa(s, false);
  aggiornaTappe();

  // Cartellino sulla mappa.
  const c = $('cartellino');
  c.hidden = false;
  c.style.setProperty('--colore-t', liv === null ? 'var(--rosso)' : coloreT(liv));
  c.classList.toggle('buca', liv === null);
  $('c-tappa').textContent = `Tappa ${corrente + 1} di ${DOMANDE_AL_GIORNO}`;
  $('c-zona').textContent = pin.zona ? nomeZona(pin.zona) : 'Tempo scaduto';
  $('c-timbro').textContent = pin.fascia ?? (pin.zona ? 'Buca' : 'Niente timbro');
  $('c-punti').textContent = pin.punti ? `+${pin.punti}` : '0';
  c.classList.remove('entra');
  if (anima) { void c.offsetWidth; c.classList.add('entra'); }

  // Foglio: la domanda, perche e giusta, avanti.
  $('esito-numero').textContent = `Tappa ${corrente + 1} di ${DOMANDE_AL_GIORNO}`;
  $('esito-domanda').textContent = s.domanda.testo;
  $('esito-zona').textContent = pin.zona ? nomeZona(pin.zona) : 'Tempo scaduto';
  const t = $('esito-timbro');
  t.textContent = pin.fascia ? `${pin.fascia} +${pin.punti}` : pin.zona ? 'Buca' : '0';
  t.style.setProperty('--colore-t', liv === null ? 'var(--rosso)' : coloreT(liv));
  const motivo = pin.fascia ? perche(s.domanda, pin.zona) : '';
  $('esito-perche').textContent = motivo ? `Giusta per: ${motivo}` : '';
  $('esito-nota').textContent = pin.fascia
    ? (liv >= 3 ? 'Questa la sanno in pochi.' : liv === 0 ? 'Giusta, ma la dicono tutti.' : '')
    : pin.zona ? `${nomeZona(pin.zona)} non va bene. Le risposte giuste le vedi nel diario a fine giro.`
      : 'Il tempo è finito prima del timbro. Le risposte giuste le vedi nel diario a fine giro.';
  $('avanti').textContent = corrente === domande.length - 1 ? 'Apri il diario' : 'Prossima tappa';
  pagina('pagina-esito', anima);
}

function avanti() {
  if ($('pagina-esito').hidden) return;
  corrente += 1;
  salva();
  if (corrente >= domande.length) mostraFine(true);
  else mostraTappa(true);
}

// --- Diario di fine giro ---

const FRASI = [
  [32, 'Da sampietrino vero: Roma la conosci sasso per sasso.'],
  [22, 'Ti muovi come un tassinaro a mezzanotte.'],
  [12, 'Romano sì, ma fuori dal tuo quartiere ti perdi.'],
  [1, 'Domani va meglio. Forse.'],
  [0, 'Zero sampietrini. Pure i turisti hanno fatto meglio.'],
];

function mostraFine(anima) {
  const tot = totale(stati);
  corrente = domande.length;
  document.body.classList.add('in-diario');
  clearInterval(orologio);
  $('cartellino').hidden = true;
  $('totale').textContent = tot;
  aggiornaTappe();
  pagina('pagina-diario', anima);
  contaFino($('fine-totale'), anima ? 0 : tot, tot, 900);
  $('fine-massimo').textContent = `/ ${MASSIMO_AL_GIORNO}`;
  $('fine-frase').textContent = FRASI.find(([min]) => tot >= min)[1];
  $('righe').replaceChildren(...stati.map((s, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    const liv = s.pin?.fascia ? livelloDi(s.pin.fascia) : null;
    b.style.setProperty('--colore-t', liv === null ? 'var(--rosso)' : coloreT(liv));
    b.setAttribute('aria-expanded', 'false');
    b.innerHTML = `<span class="n">${i + 1}</span><span class="d"></span><span class="p">${s.pin?.punti ? `+${s.pin.punti}` : '0'}</span><span class="z"><span class="nome"></span><span class="timbro"></span></span>`;
    b.querySelector('.d').textContent = s.domanda.testo;
    b.querySelector('.nome').textContent = nomeZona(s.pin?.zona);
    b.querySelector('.timbro').textContent = s.pin?.fascia ?? (s.pin?.zona ? 'Buca' : 'Tempo');
    b.addEventListener('click', () => apriTappa(aperta === i ? -1 : i));
    li.append(b);
    return li;
  }));
  const QUADRI = ['⬜', '🟩', '🟦', '🟧', '🟨'];
  const righe = stati.map((s) => (s.pin?.fascia ? QUADRI[livelloDi(s.pin.fascia)] : '🟥'));
  $('copia').dataset.testo = `Sampietrino ${oggi}\n${righe.join('')} ${tot}/${MASSIMO_AL_GIORNO}\n${stati.map((s, i) => `${i + 1}. ${nomeZona(s.pin?.zona)} ${s.pin?.fascia ? `+${s.pin.punti}` : '0'}`).join('\n')}`;
  $('copia').textContent = 'Copia il diario';
  const mezzanotte = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
  const minuti = 24 * 60 - (mezzanotte.getHours() * 60 + mezzanotte.getMinutes());
  $('prossima').textContent = ` · tra ${Math.floor(minuti / 60)} h ${minuti % 60} min`;
  apriTappa(-1, anima);
}

// Tutte le tue tappe sulla mappa; aprendone una, le sue risposte si accendono a cascata,
// dalla Scontata alla Da sampietrino.
function apriTappa(i, anima = true) {
  aperta = i;
  [...$('righe').querySelectorAll('button')].forEach((b, j) => b.setAttribute('aria-expanded', String(j === i)));
  if (i < 0) {
    $('risposte').replaceChildren();
    const mie = stati.filter((s) => s.pin?.zona);
    mappa.imposta({
      stato: (id) => {
        const s = mie.find((m) => m.pin.zona === id);
        if (!s) return 'normale';
        return s.pin.fascia ? `r${livelloDi(s.pin.fascia)}` : 'sbagliata';
      },
      pins: mie.map((s, j) => ({ id: s.pin.zona, livello: s.pin.fascia ? livelloDi(s.pin.fascia) : null, cade: anima, ritardo: j * 140 })),
      etichette: mie.map((s, j) => ({ id: s.pin.zona, colore: s.pin.fascia ? COLORI_FASCE[livelloDi(s.pin.fascia)] : '#c43a28', ritardo: anima ? 500 + j * 140 : 0 })),
      macchia: anima ? { ritardo: () => 300, durata: 600 } : null,
    });
    mappa.inquadra({}, anima);
    return;
  }
  const s = stati[i];
  const d = s.domanda;
  const tua = s.pin?.zona;
  const ordine = risposte(d).sort((a, b) => d.catalogo[a] - d.catalogo[b] || zonePerId[a].nome.localeCompare(zonePerId[b].nome, 'it'));
  mappa.imposta({
    stato: (id) => {
      if (id in d.catalogo) return `f${d.catalogo[id]}`;
      if (id === tua) return 'sbagliata';
      if (d.evidenzia?.includes(id)) return 'bersaglio';
      return 'spento';
    },
    pins: tua ? [{ id: tua, livello: s.pin.fascia ? livelloDi(s.pin.fascia) : null }] : [],
    etichette: [
      ...(tua ? [{ id: tua, colore: s.pin.fascia ? COLORI_FASCE[livelloDi(s.pin.fascia)] : '#c43a28' }] : []),
      ...(d.evidenzia || []).map((e) => ({ id: e, inverso: true })),
      ...ordine.filter((id) => d.catalogo[id] === SCALA.length - 1 && id !== tua)
        .map((id) => ({ id, colore: COLORI_FASCE[SCALA.length - 1], ritardo: anima ? 1500 : 0 })),
    ],
    municipio: d.evidenziaMunicipio ?? null,
    macchia: anima ? { ritardo: (id) => (id in d.catalogo ? d.catalogo[id] * 240 + ordine.indexOf(id) * 30 : 0), durata: 520 } : null,
  });
  mappa.inquadra({ zone: [...ordine, ...(tua ? [tua] : [])] }, anima);
  // Le risposte nel foglio, dalla fascia piu alta alla piu bassa.
  const blocchi = [];
  for (let liv = SCALA.length - 1; liv >= 0; liv--) {
    const ids = ordine.filter((id) => d.catalogo[id] === liv);
    if (!ids.length) continue;
    const div = document.createElement('div');
    div.className = 'fascia';
    div.style.setProperty('--colore', COLORI_FASCE[liv]);
    div.style.setProperty('--colore-t', coloreT(liv));
    div.style.animationDelay = `${(SCALA.length - 1 - liv) * 60}ms`;
    div.innerHTML = `<h3><i></i>${SCALA[liv].nome}<b>+${SCALA[liv].punti}</b></h3><p></p>`;
    const p = div.querySelector('p');
    ids.forEach((id, k) => {
      const span = document.createElement('span');
      span.textContent = zonePerId[id].nome;
      if (id === tua) span.className = 'tua';
      p.append(span);
      const luoghi = perche(d, id);
      if (luoghi) { const l = document.createElement('span'); l.className = 'luoghi'; l.textContent = ` (${luoghi})`; p.append(l); }
      if (k < ids.length - 1) p.append(' · ');
    });
    blocchi.push(div);
  }
  $('risposte').replaceChildren(...blocchi);
}

// --- Comandi ---

document.addEventListener('keydown', (e) => {
  if ($('copertina').open) return;
  if (e.key === 'Enter') {
    if (!$('pagina-esito').hidden) { e.preventDefault(); avanti(); }
    else if (!$('pagina-tappa').hidden && !$('pianta').disabled) { e.preventDefault(); pianta(); }
  } else if (e.key === 'Escape' && selezionata) { selezionata = null; aggiornaBiglietto(); }
});

// Rotazione del telefono o finestra ridimensionata: si ridisegna, e a larghezza nuova si reinquadra.
// Solo la larghezza: su telefono la barra degli indirizzi cambia l'altezza e azzererebbe lo zoom.
let ultimaLarghezza = 0;
new ResizeObserver(() => {
  if (!mappa) return;
  const w = Math.round($('tela').getBoundingClientRect().width);
  if (w === ultimaLarghezza) { mappa.disegna(); return; }
  ultimaLarghezza = w;
  const s = stati?.[corrente];
  if (s?.pin) {
    const fuoco = [...(s.pin.zona ? [s.pin.zona] : []), ...(s.domanda.evidenzia || [])];
    if (corrente < domande.length) mappa.inquadra(fuoco.length ? { zone: fuoco, alza: 0.16 } : { municipio: s.domanda.evidenziaMunicipio || null, alza: 0.16 });
  } else mappa.inquadra();
}).observe($('mappa'));

$('piu').addEventListener('click', () => mappa.zoom(1 / 1.5));
$('meno').addEventListener('click', () => mappa.zoom(1.5));
$('daje').addEventListener('click', () => {
  const c = $('copertina');
  c.classList.add('esce');
  setTimeout(() => { c.close(); c.classList.remove('esce'); avviaOrologio(); }, dopo(200));
});
$('pianta').addEventListener('click', pianta);
$('avanti').addEventListener('click', avanti);
$('copia').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('copia').dataset.testo); $('copia').textContent = 'Copiato!'; } catch { $('copia').textContent = 'Non riesco a copiare'; }
});

avvia().catch((err) => {
  $('testo').textContent = `Errore nel caricare il gioco: ${err.message}`;
});
