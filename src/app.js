// Interfaccia di Sampietrino: la mappa, un biglietto per tappa, l'esito della sola tua risposta,
// il diario finale con tutte le risposte tappa per tappa.
import {
  SCALA, MASSIMO_AL_GIORNO, fascia, risposte, nuovaDomanda, pinna, totale, domandeDelGiorno, DOMANDE_AL_GIORNO,
} from './motore.js';
import { creaMappa, COLORI_FASCE } from './mappa.js';
import { suoni, sblocca, eMuto, cambiaMuto, audioAttivo } from './suoni.js';
import { creaStoria } from './storia.js';
import { oggi, giocabile, sposta, dataIt, leggi, scrivi, serie, contesto, partita, partiteLocali, ripristinaPartite, PRIMO_GIORNO, gradoDi } from './storico.js';
import { disegnaMiniMappa } from './minimappa.js';
import { avviaConto, quandoCambia, utente, sincronizza, salvaStorico, pubblicaPunteggio, pubblicaSettimana, aggiornaNomeInClassifica, classifica, conta } from './conto.js';
import { aggiornaSouvenir } from './souvenir.js';
import { creaTaccuino } from './taccuino.js';

const $ = (id) => document.getElementById(id);

// Il giorno in gioco: oggi, o uno dei 7 giorni prima aperto dal diario di bordo.
let giorno = oggi;
const chiave = () => `sampietrino:${giorno}`;
const TEMPO = 60; // secondi per tappa
const MOTO_RIDOTTO = matchMedia('(prefers-reduced-motion: reduce)');
const dopo = (ms) => (MOTO_RIDOTTO.matches ? 0 : ms);
let orologio = null;

let dati, zonePerId, domande, stati, corrente, selezionata, mappa, taccuino, aperta = -1;
// Le attese della chiusura tappa: cambiando giorno a meta animazione si cancellano.
let attese = [];
const programma = (fn, ms) => attese.push(setTimeout(fn, ms));

function salva() {
  try {
    localStorage.setItem(chiave(), JSON.stringify({ ids: domande.map((d) => d.id), stati: stati.map((s) => ({ pin: s.pin, inizio: s.inizio })), corrente }));
  } catch { /* senza memoria si gioca lo stesso */ }
}

function ripristina() {
  try {
    const v = JSON.parse(localStorage.getItem(chiave()));
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
  $('attribuzione').textContent = dati.attribuzione;
  mappa = creaMappa($('tela'), dati, { onTocca: tocca, onSopra: () => suoni.sopra() });
  $('tela').mappa = mappa; // maniglia per le prove nel browser
  $('scala').replaceChildren(...[...SCALA].reverse().map((f) => {
    const li = document.createElement('li');
    const liv = livelloDi(f.nome);
    li.style.setProperty('--colore', COLORI_FASCE[liv]);
    li.style.setProperty('--colore-t', coloreT(liv));
    li.innerHTML = `<i></i><span>${f.nome}</span><b>+${f.punti}</b>`;
    return li;
  }));
  // Souvenir gia meritati con lo storico di prima (giocatori della prima ora): arrivano da scartare.
  const st = leggi();
  if (aggiornaSouvenir(st, contesto(st, dati.zone), oggi).length) scrivi(st);
  taccuino = creaTaccuino({ dati, colori: COLORI_FASCE, suoni, gioca: (d) => apriGiorno(d, true), regole: apriCopertina, giorno: () => giorno, dopoLogin: sincronizzaConto,
    ripubblica: () => { const s = leggi(); if (s.giorni[oggi]) { delete s.giorni[oggi].pubblicato; delete s.giorni[oggi].settimana; scrivi(s); } return pubblicaOggi(); } });
  mostraSplash();
  apriGiorno(oggi, false);
  // L'account arriva dopo, senza fermare il gioco: anonimo per tutti, con Google le partite si sincronizzano.
  avviaConto().then(sincronizzaConto);
  let ultimo = null;
  quandoCambia((u) => { if (u && !u.anonimo && u.uid !== ultimo) { ultimo = u.uid; sincronizzaConto(); } if (!u || u.anonimo) ultimo = null; });
}

// Storico del browser <-> account Google. Se la partita di oggi era gia stata giocata su un altro telefono,
// si riapre quella. Poi il punteggio di oggi (se c'e) prende nome e foto in classifica.
let sincronizzando = null;
function sincronizzaConto() {
  const u = utente();
  if (!u || u.anonimo) return Promise.resolve();
  sincronizzando ??= (async () => {
    try {
      const s = leggi();
      const unito = await sincronizza({ ...s, partite: partiteLocali(s) });
      if (!unito) return;
      const { partite, ...resto } = unito;
      const nonIniziata = !stati?.some((x) => x.pin);
      ripristinaPartite(partite);
      scrivi({ ...leggi(), ...resto });
      if (nonIniziata && partite?.[giorno] && !document.querySelector('dialog[open]:not(#copertina)')) {
        $('copertina').close();
        apriGiorno(giorno, false);
      }
      taccuino.aggiornaSegno();
      pubblicaOggi();
      pubblicaIeri();
      aggiornaNomeInClassifica(oggi);
    } catch (e) { console.warn('Sincronizzazione non riuscita:', e?.code || e?.message); } finally { sincronizzando = null; }
  })();
  return sincronizzando;
}

// Ieri finita nel suo giorno ma rimasta fuori dalla classifica (login arrivato dopo, scrittura persa):
// le regole la accettano ancora per un giorno, va su in silenzio. Lo stesso se le domande di ieri sono state corrette.
async function pubblicaIeri() {
  const ieri = sposta(oggi, -1);
  const g = leggi().giorni[ieri];
  const u = utente();
  if (!g?.finita || g.recupero || !g.livelli || !u || u.anonimo) return;
  try { await pubblicaGiorno(ieri, u); } catch (e) { console.warn('Classifica di ieri non raggiunta:', e?.code || e?.message); }
}

// Punteggio di un giorno in classifica e nella settimana. Si ricorda per quale account e con quale totale:
// se le domande vengono corrette a giornata in corso, il totale ricalcolato da ripristina() e diverso e si
// aggiorna quello pubblicato (sul server non c'e la zona scelta per ogni tappa, il ricalcolo lo fa solo il telefono).
async function pubblicaGiorno(data, u) {
  const g = leggi().giorni[data];
  const segna = (campi) => { const s = leggi(); Object.assign(s.giorni[data], campi); scrivi(s); };
  if (g.pubblicato !== u.uid || g.pubblicatoTot !== g.tot) {
    if (!(await pubblicaPunteggio(data, { tot: g.tot, livelli: g.livelli }))) return false;
    segna({ pubblicato: u.uid, pubblicatoTot: g.tot });
  }
  if ((g.settimana !== u.uid || g.settimanaTot !== g.tot) && (await pubblicaSettimana(data, g.tot))) {
    segna({ settimana: u.uid, settimanaTot: g.tot });
  }
  return true;
}

// Punteggio di oggi in classifica, e la riga "meglio del X%" nel diario.
// Si ricorda per quale account e stato pubblicato: chi esce e rientra con un altro account (anonimo -> Google)
// ritrova il punteggio di oggi sul nuovo, col suo nome.
async function pubblicaOggi() {
  const g = leggi().giorni[oggi];
  if (!g?.finita || g.recupero || !g.livelli) return;
  try {
    const u = await avviaConto();
    if (!u) return;
    if (u.anonimo) {
      // Senza login niente classifica: un invito al posto del "meglio del X%".
      if (giorno === oggi && !$('pagina-diario').hidden) {
        $('meglio').innerHTML = 'Entra con Google per finire in classifica';
        $('meglio').dataset.apri = 'account';
        $('meglio').hidden = false;
      }
      return;
    }
    $('meglio').dataset.apri = 'classifica';
    if (!(await pubblicaGiorno(oggi, u))) return;
    if (giorno !== oggi || $('pagina-diario').hidden) return;
    const c = await classifica(oggi, 1);
    if (!c?.mio || giorno !== oggi) return;
    // Niente "X su Y": con pochi giocatori il numero smonta. Solo la percentuale, e niente "meglio dello 0%".
    if (!c.percento) return;
    $('meglio').innerHTML = `Meglio del <b>${c.percento}%</b> di chi ha giocato oggi`;
    $('meglio').hidden = false;
  } catch (e) { console.warn('Classifica non raggiunta:', e?.code || e?.message); }
}

// Apre la partita di un giorno: quella salvata se c'e, altrimenti nuova. Fuori dalla finestra dei
// 7 giorni si apre solo una partita gia giocata, per rivederne il diario.
function apriGiorno(data, anima) {
  if (data !== oggi && !giocabile(data) && !leggi().giorni[data]) return;
  // Giorno finito su un altro telefono e non ancora sincronizzato: niente partita nuova sopra quella vera.
  if (leggi().giorni[data]?.finita && !partita(data)) return;
  clearInterval(orologio);
  attese.forEach(clearTimeout);
  attese = [];
  giorno = data;
  aperta = -1;
  selezionata = null;
  domande = domandeDelGiorno(giorno, dati.domande, dati.calendario);
  // Partita gia iniziata: tiene le sue domande anche se nel frattempo ne sono arrivate di nuove.
  try {
    const salvata = JSON.parse(localStorage.getItem(chiave()));
    const perId = Object.fromEntries(dati.domande.map((d) => [d.id, d]));
    if (salvata?.ids?.length === domande.length && salvata.ids.every((id) => perId[id])) domande = salvata.ids.map((id) => perId[id]);
  } catch { /* niente partita salvata */ }
  if (!ripristina()) {
    stati = domande.map(nuovaDomanda);
    corrente = 0;
  }
  document.body.classList.remove('in-diario');
  document.body.classList.toggle('giorno-arretrato', giorno !== oggi);
  $('tappe').replaceChildren();
  $('cartellino').hidden = true;
  $('data').textContent = dataIt(giorno, { weekday: 'long', day: 'numeric', month: 'long' });
  $('vai-oggi').hidden = giorno === oggi;
  $('totale').textContent = totale(stati);
  // Copertina solo a giornata non ancora iniziata. Si apre prima di mostrare la domanda:
  // a copertina aperta l'orologio aspetta DAJE!, altrimenti la tappa 1 perde secondi.
  if (corrente === 0 && !stati[0].pin && !splashAperto()) apriCopertina();
  if (corrente >= domande.length) mostraFine(anima);
  else if (stati[corrente].pin) mostraEsito(false);
  else mostraTappa(anima);
}

// --- Splash d'apertura, come la prima pagina di un diario: Roma che scorre dietro, il numero del giorno,
// la serie, un tasto solo per partire. Il gioco (e l'orologio) parte solo da qui. ---

const splashAperto = () => !$('splash').hidden;
let splashAscolta = false; // mostraSplash si riapre dal tasto Home: l'ascolto del login una volta sola

function mostraSplash() {
  const s = leggi();
  const g = s.giorni[oggi];
  const p = partita(oggi);
  const fatte = p?.stati?.filter((x) => x.pin).length ?? 0;
  const n = Math.round((Date.parse(`${oggi}T12:00:00Z`) - Date.parse(`${PRIMO_GIORNO}T12:00:00Z`)) / 864e5) + 1;
  $('splash-banda').textContent = `Diario di bordo n° ${n} · ${dataIt(oggi, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  $('splash-sotto').textContent = g?.finita ? `Oggi: ${g.tot} sampietrini · ${gradoDi(g.tot).nome}` : 'Oggi: 5 tappe dentro il Raccordo';
  $('splash-daje').textContent = g?.finita ? 'Guarda il diario di oggi' : fatte ? `Continua: tappa ${Math.min(fatte + 1, 5)} di 5` : 'Daje, si parte!';
  const serieN = serie(s.giorni);
  const mezzanotte = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
  const minuti = 24 * 60 - (mezzanotte.getHours() * 60 + mezzanotte.getMinutes());
  const prossima = `prossima tra ${Math.floor(minuti / 60)} h ${minuti % 60} min`;
  $('splash-serie').innerHTML = serieN
    ? `<svg viewBox="0 0 8 10" width="12" height="15" shape-rendering="crispEdges" aria-hidden="true"><path fill="#e8b33a" d="M3 0h1v1h1v2h1v1h1v4H6v1H5v1H3V9H2V8H1V4h1V3h1z"/><path fill="#c43a28" d="M3 5h2v1h1v2H5v1H3V8H2V6h1z"/></svg> Serie: ${serieN} ${serieN === 1 ? 'giorno' : 'giorni'} · ${prossima}`
    : g?.finita ? `Partita di oggi finita · ${prossima}` : 'Cinque tappe nuove ogni giorno, a mezzanotte';
  $('splash-mese').textContent = dataIt(oggi, { month: 'short' }).replace('.', '');
  $('splash-giorno').textContent = Number(oggi.slice(8));
  $('splash-pass').textContent = ` ${Object.keys(s.timbri).filter((id) => zonePerId[id]).length} di ${dati.zone.length}`;
  const u = utente();
  $('splash-entra').hidden = !!(u && !u.anonimo);
  if (!splashAscolta) { splashAscolta = true; quandoCambia((x) => { $('splash-entra').hidden = !!(x && !x.anonimo); }); }
  disegnaFondoSplash(s);
  $('splash').hidden = false;
  document.body.classList.add('con-splash');
}

// Roma intera dietro lo splash, con le zone del passaporto nei colori delle fasce; scorre piano (CSS).
function disegnaFondoSplash(s) {
  const cv = $('splash-mappa');
  // Poco piu grande dello schermo (scorre di poco) e Roma intera dentro, col Raccordo che si vede tutto.
  const w = innerWidth * 1.25, h = innerHeight * 1.25;
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  cv.style.width = `${w}px`;
  cv.style.height = `${h}px`;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#c4c4aa';
  ctx.fillRect(0, 0, cv.width, cv.height);
  const colori = Object.fromEntries(Object.entries(s.timbri).filter(([id]) => zonePerId[id]).map(([id, l]) => [id, COLORI_FASCE[l]]));
  disegnaMiniMappa(ctx, dati, { x: cv.width * 0.07, y: cv.height * 0.07, w: cv.width * 0.86, h: cv.height * 0.86, colori, filo: dpr, contorno: false });
}

function chiudiSplash() {
  const sp = $('splash');
  sp.classList.add('esce');
  document.body.classList.remove('con-splash');
  setTimeout(() => { sp.hidden = true; sp.classList.remove('esce'); }, dopo(420));
  const s = stati[corrente];
  if (corrente >= domande.length) return; // partita finita: c'e gia il diario
  if (s && !s.pin && corrente === 0 && !Object.keys(leggi().giorni).length) { apriCopertina(); return; } // prima volta: le regole
  sblocca().then(() => suoni.daje());
  if (s && !s.pin) avviaOrologio();
}

function apriCopertina() {
  $('copertina-data').textContent = dataIt(giorno, { day: 'numeric', month: 'long' });
  $('copertina-arretrato').hidden = giorno === oggi;
  if (!$('copertina').open) $('copertina').showModal();
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
  if (!$('copertina').open && !splashAperto()) avviaOrologio();
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
  const nuovo = !!stati[corrente].pin.fascia && !(id in leggi().timbri);
  registra();
  $('pianta').disabled = true;
  const s = stati[corrente];
  if (!id) {
    suoni.scaduto();
    preparaCartellino(s, false);
    rivelaTappa(s, true);
    programma(() => { aggiornaTappe(); mostraPaginaEsito(true); }, dopo(500));
    return;
  }
  suoni.timbro();
  mappa.imposta({ stato: (z) => (z === id ? 'attesa' : 'normale'), selezione: id, etichette: [{ id }] });
  mappa.inquadra({ zone: [id], durata: dopo(VOLO), alza: 0.16 }, true);
  programma(() => preparaCartellino(s, true, nuovo), dopo(250));
  programma(() => suoni.attesa((VOLO - 250) / 1000), dopo(250));
  programma(() => {
    mappa.imposta({ stato: (z) => (z === id ? 'attesa' : 'normale'), selezione: id, etichette: [{ id }], pins: [{ id, cade: true }] });
    suoni.caduta();
  }, dopo(VOLO - 150));
  programma(() => suoni.tocco(), dopo(VOLO - 150 + CADUTA));
  const rivela = VOLO - 150 + CADUTA + 450;
  programma(() => {
    const liv = s.pin.fascia ? livelloDi(s.pin.fascia) : null;
    rivelaTappa(s, true);
    rivelaCartellino();
    suoni.rivela(liv);
    aggiornaTappe();
    contaFino($('totale'), prima, totale(stati));
  }, dopo(rivela));
  programma(() => mostraPaginaEsito(true), dopo(rivela + 650));
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
  'ville-themino': 'nessun parco sopra i 15 ettari',
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
    motivo = `A ${nome} non c'è ${MANCA[d.id] || d.manca || 'nessun luogo giusto'}. Il più vicino è ${vicino[0]}${dove && dove !== pin.zona ? `, a ${zonePerId[dove].nome}` : ''}: circa ${km(dist)} dal centro della zona.`;
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
  const n = serie(leggi().giorni);
  const arretrato = giorno !== oggi;
  $('diario-titolo').textContent = arretrato ? `Diario del ${dataIt(giorno, { day: 'numeric', month: 'long' })}` : 'Diario di oggi';
  $('serie').textContent = arretrato ? 'Giorno arretrato: non conta per la serie' : n > 1 ? `Serie: ${n} giorni di fila` : n === 1 ? 'Serie: primo giorno. Torna domani!' : '';
  $('nota-domani').hidden = arretrato;
  $('meglio').hidden = true;
  if (!arretrato) pubblicaOggi();
  else if (giorno === sposta(oggi, -1)) pubblicaIeri(); // il diario di ieri riaperto dopo una correzione
  $('torna-oggi').hidden = !arretrato;
  // Souvenir nuovi: i pacchetti arrivano dopo che il diario si e acceso.
  if (anima) programma(() => { if (!document.querySelector('dialog[open]')) taccuino.scartaNuovi(); }, dopo(2200));
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

// --- Storico (src/storico.js): giornata, timbri del passaporto, souvenir ---

// Registra la giornata e timbra nel passaporto le zone indovinate, con la fascia migliore.
// Un giorno iniziato dopo la sua data e un recupero: si gioca, ma non conta per la serie.
function registra() {
  const s = leggi();
  for (const st of stati) {
    if (!st.pin?.fascia) continue;
    s.timbri[st.pin.zona] = Math.max(s.timbri[st.pin.zona] ?? -1, livelloDi(st.pin.fascia));
  }
  const prima = s.giorni[giorno];
  const recupero = prima ? !!prima.recupero : giorno !== oggi;
  s.giorni[giorno] = {
    tot: totale(stati), finita: stati.every((x) => x.pin),
    livelli: stati.map((x) => (x.pin ? (x.pin.fascia ? livelloDi(x.pin.fascia) : -1) : null)),
    ...(recupero ? { recupero: true } : {}),
    ...Object.fromEntries(['pubblicato', 'pubblicatoTot', 'settimana', 'settimanaTot'].filter((k) => prima?.[k] !== undefined).map((k) => [k, prima[k]])),
  };
  // Contatore: solo il passaggio (prima tappa timbrata, partita finita), non ogni volta che si riapre il diario.
  const ora = s.giorni[giorno];
  if (!recupero && !prima?.livelli?.some((l) => l !== null) && ora.livelli.some((l) => l !== null)) conta(oggi, 'iniziate');
  if (!prima?.finita && ora.finita) conta(oggi, recupero ? 'arretrati' : 'finite');
  aggiornaSouvenir(s, contesto(s, dati.zone), oggi);
  scrivi(s);
  salvaStorico({ ...s, partite: partiteLocali(s) });
  taccuino?.aggiornaSegno();
}

const facciaFine = (tot) => (tot >= 32 ? 'stupore' : tot >= 24 ? 'risata' : tot >= 16 ? 'sorriso' : tot >= 8 ? 'dubbioso' : tot > 0 ? 'triste' : 'buca');

// --- Comandi ---

document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return;
  if (splashAperto()) { if (e.key === 'Enter') { e.preventDefault(); chiudiSplash(); } return; }
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
$('splash-daje').addEventListener('click', chiudiSplash);
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
// Foglio "Condividi": anteprima del biglietto e tre strade. La storia (PNG 9:16) si prepara appena il foglio
// si apre, cosi al tocco la condivisione parte subito (sul telefono il permesso vale solo dentro il gesto).
// Il testo, come Wordle: un quadratino per tappa col colore della fascia, punti, serie, posizione e link.
const QUADRATI = ['⬜', '🟩', '🟦', '🟧', '🟨'];
const TOCCO = matchMedia('(pointer: coarse)').matches && !!navigator.share;
let storia = null, testoCondiviso = '';

function scriviTestoCondiviso(extra) {
  const tot = totale(stati);
  const n = Math.round((Date.parse(`${giorno}T12:00:00Z`) - Date.parse(`${PRIMO_GIORNO}T12:00:00Z`)) / 864e5) + 1;
  testoCondiviso = [
    `Sampietrino n° ${n} · ${dataIt(giorno, { day: 'numeric', month: 'long' })}`,
    stati.map((s) => (s.pin?.fascia ? QUADRATI[livelloDi(s.pin.fascia)] : '⬛')).join(''),
    `${tot} sampietrini · ${gradoDi(tot).nome}`,
    ...(extra.length ? [extra.map((e) => `${e.icona} ${e.testo}`).join(' · ')] : []),
    'https://themino.it',
  ].join('\n');
  $('cd-whatsapp').href = `https://wa.me/?text=${encodeURIComponent(testoCondiviso)}`;
  $('cd-extra').hidden = !extra.length;
  $('cd-extra').textContent = extra.map((e) => e.testo).join(' · ');
}

async function apriCondividi() {
  const tot = totale(stati);
  const n = Math.round((Date.parse(`${giorno}T12:00:00Z`) - Date.parse(`${PRIMO_GIORNO}T12:00:00Z`)) / 864e5) + 1;
  $('cd-titolo').textContent = `Sampietrino n° ${n} · ${dataIt(giorno, { day: 'numeric', month: 'long' })}`;
  $('cd-tappe').replaceChildren(...stati.map((s, k) => {
    const q = document.createElement('i');
    const l = s.pin?.fascia ? livelloDi(s.pin.fascia) : -1;
    if (l < 0) q.className = 'buca';
    else q.style.setProperty('--colore', COLORI_FASCE[l]);
    q.style.animationDelay = `${120 + k * 90}ms`;
    q.title = s.pin?.fascia || 'Buca';
    return q;
  }));
  $('cd-punti').innerHTML = `<b>${tot}</b> sampietrini · ${gradoDi(tot).nome}`;
  const extra = [];
  const filo = giorno === oggi ? serie(leggi().giorni) : 0;
  if (filo >= 2) extra.push({ icona: '🔥', testo: `${filo} giorni di fila` });
  scriviTestoCondiviso(extra);
  $('cd-copia-nome').textContent = TOCCO ? 'Altre app' : 'Copia';
  $('cd-copia-sotto').textContent = TOCCO ? 'Telegram, Messaggi...' : 'Per ogni altra chat';
  $('cd-anteprima').hidden = true;
  $('cd-storia').disabled = true;
  storia = null;
  suoni.pagina();
  $('condividi-foglio').showModal();
  // La storia e la posizione in classifica arrivano dopo, senza far aspettare il foglio.
  const chiesto = giorno;
  creaStoria({
    totale: tot, massimo: MASSIMO_AL_GIORNO, faccia: facciaFine(tot), colori: COLORI_FASCE, chicca: chiccaDelGiorno(),
    data: dataIt(giorno, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    tappe: stati.map((s) => ({ livello: s.pin?.fascia ? livelloDi(s.pin.fascia) : null, punti: s.pin?.punti ?? 0 })),
    serie: filo, timbrati: Object.keys(leggi().timbri).filter((id) => zonePerId[id]).length,
  }).then((blob) => {
    if (chiesto !== giorno) return;
    storia = new File([blob], `sampietrino-${giorno}.png`, { type: 'image/png' });
    const img = $('cd-anteprima');
    if (img.src) URL.revokeObjectURL(img.src);
    img.src = URL.createObjectURL(blob);
    img.hidden = false;
    $('cd-storia').disabled = false;
  }).catch(() => { $('cd-storia').querySelector('small').textContent = 'Non riesco a prepararla'; });
  if (giorno === oggi && utente() && !utente().anonimo) {
    try {
      const c = await classifica(oggi, 1);
      if (c?.mio?.pubblico && c.posizione && chiesto === giorno && $('condividi-foglio').open) {
        extra.push({ icona: '🏆', testo: `${c.posizione}° in classifica oggi` });
        scriviTestoCondiviso(extra);
      }
    } catch { /* senza classifica il testo resta com'e */ }
  }
}

$('condividi').addEventListener('click', apriCondividi);
// Home: la pagina d'apertura. Da un giorno arretrato si torna a oggi, sotto lo splash (l'orologio aspetta il tasto).
$('home').addEventListener('click', () => { suoni.copia(); mostraSplash(); if (giorno !== oggi) apriGiorno(oggi, false); });
$('cd-chiudi').addEventListener('click', () => $('condividi-foglio').close());
{
  // Tocco fuori dal foglio: si chiude (pressione e rilascio entrambi fuori, come per i fogli del taccuino).
  const dlg = $('condividi-foglio');
  const fuori = (e) => { const r = dlg.getBoundingClientRect(); return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom; };
  let premutoFuori = false;
  dlg.addEventListener('pointerdown', (e) => { premutoFuori = fuori(e); });
  dlg.addEventListener('click', (e) => { if (premutoFuori && fuori(e)) dlg.close(); premutoFuori = false; });
}
$('cd-storia').addEventListener('click', async () => {
  if (!storia) return;
  const sotto = $('cd-storia').querySelector('small');
  try {
    if (navigator.canShare?.({ files: [storia] })) await navigator.share({ files: [storia], title: 'Sampietrino' });
    else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(storia);
      a.download = storia.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      sotto.textContent = 'Scaricata: caricala nella storia';
    }
    suoni.copia();
  } catch (e) {
    if (e?.name !== 'AbortError') sotto.textContent = 'Non riesco, riprova';
  }
});
$('cd-whatsapp').addEventListener('click', () => suoni.copia());
$('cd-copia').addEventListener('click', async () => {
  const sotto = $('cd-copia-sotto');
  try {
    if (TOCCO) await navigator.share({ text: testoCondiviso });
    else {
      await navigator.clipboard.writeText(testoCondiviso);
      $('cd-copia').classList.add('fatto');
      sotto.textContent = 'Copiato: incollalo in chat';
      setTimeout(() => { $('cd-copia').classList.remove('fatto'); sotto.textContent = 'Per ogni altra chat'; }, 2500);
    }
    suoni.copia();
  } catch (e) {
    if (e?.name !== 'AbortError') sotto.textContent = 'Non riesco, riprova';
  }
});
$('vai-oggi').addEventListener('click', () => apriGiorno(oggi, true));
$('torna-oggi').addEventListener('click', () => apriGiorno(oggi, true));

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
