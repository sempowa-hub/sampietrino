// Interfaccia di Sampietrino: la mappa, un biglietto per tappa, l'esito della sola tua risposta,
// il diario finale con tutte le risposte tappa per tappa.
import {
  SCALA, MASSIMO_AL_GIORNO, fascia, risposte, nuovaDomanda, pinna, totale, domandeDelGiorno, DOMANDE_AL_GIORNO,
} from './motore.js';
import { creaMappa, COLORI_FASCE } from './mappa.js';
import { suoni, sblocca, eMuto, cambiaMuto, audioAttivo } from './suoni.js';
import { creaStoria } from './storia.js';
import { disegnaMiniMappa } from './minimappa.js';

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
    localStorage.setItem(CHIAVE, JSON.stringify({ ids: domande.map((d) => d.id), stati: stati.map((s) => ({ pin: s.pin, inizio: s.inizio })), corrente }));
  } catch { /* senza memoria si gioca lo stesso */ }
}

function ripristina() {
  try {
    const v = JSON.parse(localStorage.getItem(CHIAVE));
    // Se le domande del giorno sono cambiate (dati nuovi pubblicati) la partita salvata non vale piu.
    if (!v || v.stati.length !== domande.length || v.ids?.join() !== domande.map((d) => d.id).join()) return false;
    stati = v.stati.map((s, i) => ({ ...s, domanda: domande[i] }));
    // Fascia e punti si ricalcolano dal catalogo: se le diciture cambiano, le partite salvate restano valide.
    for (const s of stati) {
      if (!s.pin?.zona) continue;
      const f = fascia(s.domanda, s.pin.zona);
      s.pin = { ...s.pin, fascia: f?.nome ?? null, punti: f?.punti ?? 0 };
    }
    corrente = v.corrente;
    return true;
  } catch { return false; }
}

const nomeZona = (id) => (id ? zonePerId[id].nome : 'tempo scaduto');
const livelloDi = (nomeFascia) => SCALA.findIndex((f) => f.nome === nomeFascia);
const coloreT = (liv) => `var(--f${liv}-t)`;
// La faccia di Mino per ogni esito (strumenti/disegna_mino.py): una per fascia, mano in faccia per la buca,
// triste se scade il tempo.
const FACCE_FASCIA = ['dubbioso', 'sorriso', 'occhiolino', 'risata', 'stupore'];
const faccia = (pin) => (pin.fascia ? FACCE_FASCIA[livelloDi(pin.fascia)] : pin.zona ? 'buca' : 'triste');
function mettiFaccia(el, nome, anima = true) {
  el.src = `img/mino-${nome}.png`;
  el.classList.remove('reagisce');
  if (anima) { void el.offsetWidth; el.classList.add('reagisce'); }
}

async function avvia() {
  // Le facce si caricano subito: al momento della rivelazione devono esserci gia.
  for (const f of [...FACCE_FASCIA, 'pensieroso', 'buca', 'triste']) new Image().src = `img/mino-${f}.png`;
  dati = await (await fetch('dati/gioco.json')).json();
  zonePerId = Object.fromEntries(dati.zone.map((z) => [z.id, z]));
  domande = domandeDelGiorno(oggi, dati.domande);
  if (!ripristina()) {
    stati = domande.map(nuovaDomanda);
    corrente = 0;
  }
  $('data').textContent = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  $('attribuzione').textContent = dati.attribuzione;
  mappa = creaMappa($('tela'), dati, { onTocca: tocca, onSopra: () => suoni.sopra() });
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
    const v = Math.round(a + (b - a) * (1 - Math.pow(1 - p, 3)));
    if (String(v) !== el.textContent) suoni.conta();
    el.textContent = v;
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
    if (resto <= 10 && resto > 0 && String(resto) !== $('tempo').textContent) suoni.tic(resto);
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
  if (selezionata) suoni.scegli(); else suoni.annulla();
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

// Chiude la tappa con un po' di suspense:
// 1. timbro: la zona resta a inchiostro col contorno che pulsa, la camera vola piano verso di lei,
//    il cartellino mostra il nome e tre puntini, i tic si fanno fitti;
// 2. cade il sampietrino, tocca terra, mezzo secondo di silenzio;
// 3. la zona si colora dal punto in cui e caduto, il timbro sbatte sul cartellino, fanfara, punti.
// Solo la tua risposta: le altre si vedono nel diario.
const VOLO = 1500, CADUTA = 420;
function chiudiTappa(id) {
  clearInterval(orologio);
  const prima = totale(stati);
  stati[corrente] = pinna(stati[corrente], id);
  salva();
  // Nuovo timbro: zona indovinata per la prima volta, va nel passaporto.
  const nuovo = !!stati[corrente].pin.fascia && !(id in leggiStorico().timbri);
  registra();
  $('pianta').disabled = true;
  const s = stati[corrente];
  if (!id) {
    suoni.scaduto();
    preparaCartellino(s, false);
    rivelaTappa(s, true);
    setTimeout(() => { aggiornaTappe(); mostraPaginaEsito(true); }, dopo(500));
    return;
  }
  suoni.timbro();
  mappa.imposta({ stato: (z) => (z === id ? 'attesa' : 'normale'), selezione: id, etichette: [{ id }] });
  mappa.inquadra({ zone: [id], durata: dopo(VOLO), alza: 0.16 }, true);
  setTimeout(() => preparaCartellino(s, true, nuovo), dopo(250));
  setTimeout(() => suoni.attesa((VOLO - 250) / 1000), dopo(250));
  setTimeout(() => {
    mappa.imposta({ stato: (z) => (z === id ? 'attesa' : 'normale'), selezione: id, etichette: [{ id }], pins: [{ id, cade: true }] });
    suoni.caduta();
  }, dopo(VOLO - 150));
  setTimeout(() => suoni.tocco(), dopo(VOLO - 150 + CADUTA));
  const rivela = VOLO - 150 + CADUTA + 450;
  setTimeout(() => {
    const liv = s.pin.fascia ? livelloDi(s.pin.fascia) : null;
    rivelaTappa(s, true);
    rivelaCartellino();
    suoni.rivela(liv);
    aggiornaTappe();
    contaFino($('totale'), prima, totale(stati));
  }, dopo(rivela));
  setTimeout(() => mostraPaginaEsito(true), dopo(rivela + 650));
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
    pins: pin.zona ? [{ id: pin.zona, livello: liv }] : [],
    etichette: [
      ...(pin.zona ? [{ id: pin.zona, colore: liv === null ? '#c43a28' : COLORI_FASCE[liv] }] : []),
      ...(d.evidenzia || []).map((e) => ({ id: e, inverso: true, ritardo: anima ? 500 : 0 })),
    ],
    municipio: d.evidenziaMunicipio ?? null,
    macchia: anima ? { ritardo: (id) => (id === pin.zona ? 0 : 350), durata: 650 } : null,
  });
  // Se la domanda ha un bersaglio (confina con X, municipio) la camera si allarga per mostrarlo.
  const fuoco = [...(pin.zona ? [pin.zona] : []), ...(d.evidenzia || [])];
  if (d.evidenzia?.length || !anima) {
    if (fuoco.length) mappa.inquadra({ zone: fuoco, durata: 900, alza: 0.16 }, anima);
  }
  if (d.evidenziaMunicipio) mappa.inquadra({ municipio: d.evidenziaMunicipio, alza: 0.16 }, anima);
}

function perche(domanda, id) {
  const luoghi = domanda.perche?.[id];
  return luoghi?.length ? luoghi.join(' · ') : '';
}

// --- Perche: ogni esito si argomenta coi dati ---

const km = (d) => (d < 0.95 ? `${Math.max(100, Math.round(d * 10) * 100)} m` : `${d.toFixed(1).replace(/\.0$/, '').replace('.', ',')} km`);
const coppie = (d) => { const n = d.match(/-?\d+(?:\.\d+)?/g).map(Number); return Array.from({ length: n.length / 2 }, (_, i) => [n[2 * i], n[2 * i + 1]]); };
const distanza = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const elenco = (ids) => ids.map((i) => zonePerId[i].nome).join(', ').replace(/, ([^,]*)$/, ' e $1');
// "nessun ..." per categoria, per dire cosa manca nella zona sbagliata.
const MANCA = {
  'metro-a': 'nessuna fermata della Metro A', 'metro-b': 'nessuna fermata della Metro B', 'metro-c': 'nessuna fermata della Metro C',
  trapizzino: 'nessun Trapizzino', fontane: 'nessuna delle fontane famose in gara', ville: 'nessuna delle ville storiche in gara',
  movida: 'nessuno dei posti della movida in gara', 'stazione-fs': 'nessuna stazione dei treni',
  'belvedere-themino': 'nessuno dei belvederi segreti in gara', cupola: 'nessuno dei punti in gara da cui si vede il Cupolone',
  illusioni: 'nessuna delle illusioni in gara', misteri: 'nessuno dei misteri in gara', ossa: 'nessuna delle catacombe, cripte o cimiteri in gara',
  bernini: 'nessuna delle opere di Bernini in gara', borromini: 'nessuna delle opere di Borromini in gara', caravaggio: 'nessun Caravaggio',
  'roma-sotto': 'nessuno dei pezzi di Roma antica in gara', 'street-art': 'nessuno dei murales in gara', novecento: 'nessuno dei gioielli del Novecento in gara',
  estero: 'nessuno dei pezzetti di estero in gara', scalinate: 'nessuna delle scalinate in gara', orologi: 'nessuno degli orologi strani in gara',
  'ville-themino': 'nessuna delle ville e dei parchi in gara',
};
const PERCHE_FASCIA = [
  'È la prima che viene in mente a tutti: per questo vale poco.',
  'Giusta e nota: la danno in tanti.',
  'Una risposta da romano: non la dice chiunque.',
  'La sanno in pochi: questa la dà chi gira davvero la città.',
  'Quasi nessuno la nomina: risposta da sampietrino.',
];

// Due righe: cosa c'e (o non c'e) nella zona, e perche vale quei punti.
function argomenta(s) {
  const { pin, domanda: d } = s;
  const n = Object.keys(d.catalogo).length;
  if (!pin.zona) return [`Tempo scaduto prima del timbro: questa tappa vale 0.`, `Le zone giuste erano ${n}: le trovi tutte nel diario a fine giro.`];
  const z = zonePerId[pin.zona];
  const nome = z.nome;
  if (pin.fascia) {
    const liv = livelloDi(pin.fascia);
    const luoghi = perche(d, pin.zona);
    const prima = luoghi ? `Giusta, a ${nome}: ${luoghi.replace(/ · /g, ', ')}.`
      : d.tipo === 'acqua' ? `Giusta: il Tevere passa per ${nome}.`
        : d.tipo === 'confina' ? `Giusta: ${nome} confina con ${zonePerId[d.evidenzia[0]].nome}.`
          : d.tipo === 'municipio' ? `Giusta: ${nome} sta nel ${d.testo.replace('Una zona del ', '')}.`
            : d.tipo === 'raccordo' ? `Giusta: ${nome} arriva fino al Raccordo.`
              : d.tipo === 'vaticano' ? `Giusta: ${nome} tocca le mura del Vaticano.` : `Giusta.`;
    return [prima, `${PERCHE_FASCIA[liv]} Le zone giuste erano ${n}.`];
  }
  // Buca: si spiega perche no, coi dati della domanda.
  let motivo = `${nome} non è tra le ${n} zone giuste.`;
  if (d.luoghi?.length) {
    const [vicino, dist] = d.luoghi.map((l) => [l, distanza(z.centro, [l[1], l[2]])]).sort((a, b) => a[1] - b[1])[0];
    const dove = Object.keys(d.perche || {}).find((id) => d.perche[id].includes(vicino[0]));
    motivo = `A ${nome} non c'è ${MANCA[d.id] || 'nessun luogo giusto'}. Il più vicino è ${vicino[0]}${dove && dove !== pin.zona ? `, a ${zonePerId[dove].nome}` : ''}: circa ${km(dist)} dal centro della zona.`;
  } else if (d.tipo === 'acqua' && dati.tevere) {
    const dist = Math.min(...coppie(dati.tevere).map((p) => distanza(z.centro, p)));
    motivo = `Il Tevere non passa per ${nome}: dal centro della zona il fiume è a circa ${km(dist)}.`;
  } else if (d.tipo === 'confina') {
    const x = zonePerId[d.evidenzia[0]];
    motivo = `${nome} non tocca ${x.nome}. Con ${x.nome} confinano ${elenco(x.vicini)}.`;
  } else if (d.tipo === 'municipio') {
    motivo = z.municipio ? `${nome} sta nel Municipio ${ROMANI[z.municipio]}, non nel ${d.testo.replace('Una zona del Municipio ', '')}.` : `${nome} non sta per più di metà in nessun municipio.`;
  } else if (d.tipo === 'raccordo') {
    const dist = Math.min(...coppie(dati.comune).map((p) => distanza(z.centro, p)));
    motivo = `${nome} non arriva al Raccordo: dal centro della zona il GRA è a circa ${km(dist)}.`;
  } else if (d.tipo === 'vaticano') {
    motivo = `${nome} non tocca il Vaticano: le mura confinano con ${elenco(Object.keys(d.catalogo))}.`;
  }
  return [motivo, 'Buca: questa tappa vale 0. Tutte le risposte giuste le trovi nel diario a fine giro.'];
}
const ROMANI = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];

// --- Esito ---

// Il cartellino sulla mappa: in attesa mostra solo il nome e tre puntini.
function preparaCartellino(s, attesa, nuovo = false) {
  const { pin } = s;
  $('c-nuovo').hidden = !nuovo;
  const liv = pin.fascia ? livelloDi(pin.fascia) : null;
  const c = $('cartellino');
  c.hidden = false;
  c.style.setProperty('--colore-t', liv === null ? 'var(--rosso)' : coloreT(liv));
  c.classList.toggle('buca', liv === null);
  c.classList.toggle('attesa', attesa);
  mettiFaccia($('c-faccia'), attesa ? 'pensieroso' : faccia(pin), !attesa);
  c.classList.remove('rivelato', 'entra');
  $('c-tappa').textContent = `Tappa ${corrente + 1} di ${DOMANDE_AL_GIORNO}`;
  $('c-zona').textContent = pin.zona ? nomeZona(pin.zona) : 'Tempo scaduto';
  $('c-timbro').textContent = pin.fascia ?? (pin.zona ? 'Buca' : 'Capolinea');
  $('c-punti').textContent = pin.punti ? `+${pin.punti}` : '0';
  void c.offsetWidth;
  c.classList.add('entra');
  if (!attesa) c.classList.add('rivelato');
}

function rivelaCartellino() {
  const c = $('cartellino');
  const s = stati[corrente];
  mettiFaccia($('c-faccia'), faccia(s.pin));
  c.classList.remove('attesa');
  void c.offsetWidth;
  c.classList.add('rivelato');
}

function mostraPaginaEsito(anima) {
  const s = stati[corrente];
  const { pin } = s;
  const liv = pin.fascia ? livelloDi(pin.fascia) : null;
  $('esito-numero').textContent = `Tappa ${corrente + 1} di ${DOMANDE_AL_GIORNO}`;
  $('esito-domanda').textContent = s.domanda.testo;
  $('esito-zona').textContent = pin.zona ? nomeZona(pin.zona) : 'Tempo scaduto';
  const t = $('esito-timbro');
  t.textContent = pin.fascia ? `${pin.fascia} +${pin.punti}` : pin.zona ? 'Buca' : 'Capolinea';
  t.style.setProperty('--colore-t', liv === null ? 'var(--rosso)' : coloreT(liv));
  const [motivo, nota] = argomenta(s);
  $('esito-perche').textContent = motivo;
  $('esito-nota').textContent = nota;
  // Le domande con le chicche di Mino hanno una riga di contesto: "Mino dice", il racconto dietro la domanda.
  $('esito-contesto').hidden = !s.domanda.contesto;
  $('esito-contesto-testo').textContent = s.domanda.contesto || '';
  $('avanti').textContent = corrente === domande.length - 1 ? 'Apri il diario' : 'Prossima tappa';
  pagina('pagina-esito', anima);
}

// Dopo una ricarica a tappa chiusa: tutto subito, senza animazioni.
function mostraEsito() {
  const s = stati[corrente];
  rivelaTappa(s, false);
  preparaCartellino(s, false);
  $('cartellino').classList.remove('entra', 'rivelato');
  aggiornaTappe();
  mostraPaginaEsito(false);
}

function avanti() {
  if ($('pagina-esito').hidden) return;
  suoni.pagina();
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
  mettiFaccia($('fine-faccia'), facciaFine(tot), anima);
  registra();
  const n = serie();
  $('serie').textContent = n > 1 ? `Serie: ${n} giorni di fila` : n === 1 ? 'Serie: primo giorno. Torna domani!' : '';
  $('righe').replaceChildren(...stati.map((s, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    const liv = s.pin?.fascia ? livelloDi(s.pin.fascia) : null;
    b.style.setProperty('--colore-t', liv === null ? 'var(--rosso)' : coloreT(liv));
    b.setAttribute('aria-expanded', 'false');
    b.innerHTML = `<span class="n">${i + 1}</span><span class="d"></span><span class="p">${s.pin?.punti ? `+${s.pin.punti}` : '0'}</span><span class="z"><span class="nome"></span><span class="timbro"></span></span>`;
    b.querySelector('.d').textContent = s.domanda.testo;
    b.querySelector('.nome').textContent = nomeZona(s.pin?.zona);
    b.querySelector('.timbro').textContent = s.pin?.fascia ?? (s.pin?.zona ? 'Buca' : 'Capolinea');
    b.addEventListener('click', () => apriTappa(aperta === i ? -1 : i));
    li.append(b);
    return li;
  }));
  const mezzanotte = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
  const minuti = 24 * 60 - (mezzanotte.getHours() * 60 + mezzanotte.getMinutes());
  $('prossima').textContent = ` · tra ${Math.floor(minuti / 60)} h ${minuti % 60} min`;
  apriTappa(-1, anima);
}

// Tutte le tue tappe sulla mappa; aprendone una, le sue risposte si accendono a cascata,
// da Da cartolina a Da Mino.
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
  if (anima) {
    suoni.pagina();
    ordine.slice(0, 30).forEach((id) => suoni.cascata(d.catalogo[id], (d.catalogo[id] * 240 + ordine.indexOf(id) * 30) / 1000));
  }
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
    // Compatte: solo i nomi delle zone. Toccando una zona si aprono i luoghi che la rendono giusta.
    ids.forEach((id, k) => {
      const luoghi = perche(d, id);
      const zona = document.createElement(luoghi ? 'button' : 'span');
      zona.className = `zona-ris${id === tua ? ' tua' : ''}`;
      zona.textContent = zonePerId[id].nome;
      p.append(zona);
      if (luoghi) {
        const l = document.createElement('span');
        l.className = 'luoghi';
        l.textContent = ` (${luoghi})`;
        l.hidden = true;
        zona.setAttribute('aria-expanded', 'false');
        zona.addEventListener('click', () => {
          l.hidden = !l.hidden;
          zona.setAttribute('aria-expanded', String(!l.hidden));
        });
        p.append(l);
      }
      if (k < ids.length - 1) p.append(' · ');
    });
    blocchi.push(div);
  }
  $('risposte').replaceChildren(...blocchi);
}

// --- Storico: giorni giocati (serie) e zone timbrate (passaporto). Nel browser, finche non arriva il login. ---

const STORICO = 'sampietrino:storico';
function leggiStorico() {
  try { return { giorni: {}, timbri: {}, ...JSON.parse(localStorage.getItem(STORICO)) }; } catch { return { giorni: {}, timbri: {} }; }
}

// Registra la giornata di oggi e timbra nel passaporto le zone indovinate, con la fascia migliore.
function registra() {
  const s = leggiStorico();
  for (const st of stati) {
    if (!st.pin?.fascia) continue;
    s.timbri[st.pin.zona] = Math.max(s.timbri[st.pin.zona] ?? -1, livelloDi(st.pin.fascia));
  }
  s.giorni[oggi] = { tot: totale(stati), finita: stati.every((x) => x.pin) };
  try { localStorage.setItem(STORICO, JSON.stringify(s)); } catch { /* senza memoria niente passaporto */ }
}

// Giorni di fila con la partita finita, fino a oggi (o fino a ieri, se oggi non e ancora finita).
function serie() {
  const g = leggiStorico().giorni;
  const giorno = (t) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date(t));
  let t = Date.now();
  if (!g[giorno(t)]?.finita) t -= 864e5;
  let n = 0;
  while (g[giorno(t)]?.finita) { n += 1; t -= 864e5; }
  return n;
}

const facciaFine = (tot) => (tot >= 32 ? 'stupore' : tot >= 24 ? 'risata' : tot >= 16 ? 'sorriso' : tot >= 8 ? 'dubbioso' : tot > 0 ? 'triste' : 'buca');

function apriPassaporto() {
  const s = leggiStorico();
  const ids = Object.keys(s.timbri).filter((id) => zonePerId[id]).sort((a, b) => zonePerId[a].nome.localeCompare(zonePerId[b].nome, 'it'));
  $('pass-numero').textContent = ids.length;
  $('pass-totale').textContent = `su ${dati.zone.length} zone timbrate`;
  $('pass-riempi').style.transform = `scaleX(${ids.length / dati.zone.length})`;
  const n = serie();
  $('pass-serie').textContent = n ? `Serie: ${n} ${n === 1 ? 'giorno' : 'giorni di fila'}` : '';
  const cv = $('pass-mappa');
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  disegnaMiniMappa(ctx, dati, { x: 12, y: 12, w: cv.width - 24, h: cv.height - 24, colori: Object.fromEntries(ids.map((id) => [id, COLORI_FASCE[s.timbri[id]]])) });
  $('pass-elenco').replaceChildren(...(ids.length ? ids.map((id) => {
    const li = document.createElement('li');
    li.textContent = zonePerId[id].nome;
    li.style.setProperty('--colore-t', coloreT(s.timbri[id]));
    return li;
  }) : [Object.assign(document.createElement('li'), { className: 'vuoto', textContent: 'Ancora nessun timbro: indovina una zona e finisce qui, col colore della fascia.' })]));
  suoni.pagina();
  $('passaporto').showModal();
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
  sblocca().then(() => suoni.daje());
  const c = $('copertina');
  c.classList.add('esce');
  setTimeout(() => { c.close(); c.classList.remove('esce'); avviaOrologio(); }, dopo(200));
});
$('pianta').addEventListener('click', pianta);
$('avanti').addEventListener('click', avanti);
// Storia da condividere: il diario di oggi in formato storia Instagram. Sul telefono si apre la condivisione,
// sul computer si scarica il PNG.
// La chicca della storia: una tappa di oggi a caso. Se ha il suo "Mino dice" si usa quello, altrimenti
// la risposta Da Mino di quella domanda col luogo che la rende giusta. Ogni storia esce diversa.
function chiccaDelGiorno() {
  const s = stati[Math.floor(Math.random() * stati.length)];
  const d = s.domanda;
  if (d.contesto) return d.contesto;
  const rare = Object.keys(d.catalogo).filter((id) => d.catalogo[id] === SCALA.length - 1);
  const id = rare[Math.floor(Math.random() * rare.length)];
  if (!id) return '';
  const luoghi = perche(d, id);
  return `${d.testo}: la risposta da Mino era ${zonePerId[id].nome}${luoghi ? ` (${luoghi.replace(/ · /g, ', ')})` : ''}. Questa la sanno in pochi.`;
}
$('condividi').addEventListener('click', async () => {
  const b = $('condividi');
  b.disabled = true;
  b.textContent = 'Preparo la storia…';
  try {
    const tot = totale(stati);
    const blob = await creaStoria({
      totale: tot, massimo: MASSIMO_AL_GIORNO, faccia: facciaFine(tot), colori: COLORI_FASCE, chicca: chiccaDelGiorno(),
      data: new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()),
      tappe: stati.map((s) => ({ livello: s.pin?.fascia ? livelloDi(s.pin.fascia) : null, punti: s.pin?.punti ?? 0 })),
      serie: serie(), timbrati: Object.keys(leggiStorico().timbri).filter((id) => zonePerId[id]).length,
    });
    const nome = `sampietrino-${oggi}.png`;
    const file = new File([blob], nome, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Sampietrino' });
    else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = nome;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
    suoni.copia();
    b.textContent = 'Condividi nella storia';
  } catch (e) {
    b.textContent = e?.name === 'AbortError' ? 'Condividi nella storia' : 'Non riesco, riprova';
  } finally {
    b.disabled = false;
  }
});
$('apri-passaporto').addEventListener('click', apriPassaporto);
$('chiudi-passaporto').addEventListener('click', () => $('passaporto').close());

// Suoni: il primo gesto sblocca l'audio; il tasto in testata lo zittisce, e il browser se lo ricorda.
// Sui telefoni l'audio si sblocca solo con touchend o click (non con pointerdown): si riprova a ogni gesto
// finche non parte, poi gli ascoltatori se ne vanno.
for (const ev of ['touchend', 'click', 'keydown']) document.addEventListener(ev, function prova() {
  sblocca().then(() => { if (audioAttivo()) for (const e of ['touchend', 'click', 'keydown']) document.removeEventListener(e, prova); });
}, { passive: true });
$('suono').setAttribute('aria-pressed', String(!eMuto()));
$('suono').addEventListener('click', () => {
  sblocca();
  const muto = cambiaMuto();
  $('suono').setAttribute('aria-pressed', String(!muto));
  if (!muto) suoni.scegli();
});

avvia().catch((err) => {
  $('testo').textContent = `Errore nel caricare il gioco: ${err.message}`;
});
