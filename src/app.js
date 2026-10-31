// Interfaccia di Sampietrino: mappa a pixel, un biglietto per tappa, catalogo delle risposte, riepilogo.
import {
  SCALA, MASSIMO_AL_GIORNO, risposte, nuovaDomanda, pinna, totale, domandeDelGiorno, DOMANDE_AL_GIORNO,
} from './motore.js';
import { creaMappa, COLORI_FASCE } from './mappa-pixel.js';

const $ = (id) => document.getElementById(id);

const oggi = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
const CHIAVE = `sampietrino:${oggi}`;
const TEMPO = 60; // secondi per tappa
let orologio = null;

let dati, zonePerId, domande, stati, corrente, selezionata, mappa;

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

const nomeZona = (id) => (id ? zonePerId[id].nome : 'tempo scaduto');
const livelloDi = (nomeFascia) => SCALA.findIndex((f) => f.nome === nomeFascia);

function ridisegna() {
  const s = stati[corrente];
  const d = s?.domanda;
  const chiusa = !!s?.pin;
  const pin = s?.pin;

  // Stato di ogni zona. A tappa chiusa ogni risposta giusta si accende col colore della sua fascia.
  // Il bersaglio si mostra solo a tappa chiusa: prima rivelerebbe le risposte.
  const stato = (id) => {
    if (chiusa) {
      if (pin.zona === id && !pin.fascia) return 'sbagliata';
      if (id in d.catalogo) return `f${d.catalogo[id]}`;
      if (d.evidenzia?.includes(id)) return 'bersaglio';
      return 'spento';
    }
    return id === selezionata ? 'scelta' : 'normale';
  };
  const etichette = [];
  if (pin?.zona) etichette.push({ id: pin.zona });
  if (chiusa) for (const id of d.evidenzia || []) etichette.push({ id, inverso: true });
  if (selezionata) etichette.push({ id: selezionata });
  mappa.imposta({ stato, etichette, municipio: chiusa ? d.evidenziaMunicipio : null });

  const ol = $('pin');
  ol.replaceChildren();
  const li = document.createElement('li');
  if (!pin) { li.className = 'vuoto'; li.textContent = 'biglietto da timbrare'; }
  else if (pin.fascia === null) { li.className = 'buca'; li.innerHTML = `<span>${nomeZona(pin.zona)}</span><b>buca</b>`; }
  else {
    li.innerHTML = `<span>${nomeZona(pin.zona)} · ${pin.fascia}</span><b>+${pin.punti}</b>`;
    li.style.setProperty('--fascia', COLORI_FASCE[livelloDi(pin.fascia)]);
    li.classList.add('timbrato');
  }
  li.title = pin ? nomeZona(pin.zona) : '';
  ol.appendChild(li);
  $('totale').textContent = totale(stati.slice(0, corrente + 1));
  $('pianta').disabled = !selezionata || chiusa;
  $('scelta').textContent = selezionata
    ? `Qui: ${zonePerId[selezionata].nome}`
    : chiusa ? (pin.fascia ? `${pin.fascia}: +${pin.punti}` : pin.zona ? 'Buca: questa tappa vale 0' : 'Tempo scaduto: questa tappa vale 0')
      : 'Tocca una zona sulla mappa';
  $('scelta').classList.toggle('qui', !!selezionata);
}

function mostraDomanda() {
  const s = stati[corrente];
  selezionata = null;
  $('numero').textContent = `Tappa ${corrente + 1} di ${DOMANDE_AL_GIORNO}`;
  $('testo').textContent = s.domanda.testo;
  // A tappa aperta la mappa parte intera: inquadrare il bersaglio rivelerebbe dove sta.
  mappa.inquadra();
  ridisegna();
  if (s.pin) mostraEsito();
  else if (!$('copertina').open) avviaOrologio();
}

// Il tempo parte quando vedi la domanda e sopravvive a una ricarica: ricaricare non regala secondi.
function avviaOrologio() {
  const s = stati[corrente];
  if (!s || s.pin) return;
  if (!s.inizio) { s.inizio = Date.now(); salva(); }
  clearInterval(orologio);
  const scatta = () => {
    const resto = Math.max(0, TEMPO - Math.floor((Date.now() - s.inizio) / 1000));
    $('tempo').textContent = resto;
    $('tempo').classList.toggle('poco', resto <= 10);
    if (resto === 0) {
      clearInterval(orologio);
      selezionata = null;
      stati[corrente] = pinna(stati[corrente], null);
      salva();
      ridisegna();
      setTimeout(mostraEsito, 400);
    }
  };
  scatta();
  orologio = setInterval(scatta, 250);
}

function tocca(id) {
  const s = stati[corrente];
  if (!s || s.pin) return;
  selezionata = selezionata === id ? null : id;
  ridisegna();
}

function pianta() {
  if (!selezionata) return;
  clearInterval(orologio);
  stati[corrente] = pinna(stati[corrente], selezionata);
  selezionata = null;
  salva();
  ridisegna();
  setTimeout(mostraEsito, 500);
}

function mostraEsito() {
  const s = stati[corrente];
  // La mappa zooma sulla zona timbrata, che si accende del colore della sua fascia.
  // Buca o tempo scaduto: inquadra la zona della domanda, o tutte le risposte.
  const fuoco = s.pin.zona && s.pin.fascia ? [s.pin.zona] : [...(s.pin.zona ? [s.pin.zona] : []), ...(s.domanda.evidenzia || [])];
  mappa.inquadra(fuoco.length || s.domanda.evidenziaMunicipio
    ? { zone: fuoco, municipio: fuoco.length ? null : s.domanda.evidenziaMunicipio }
    : { zone: risposte(s.domanda) });
  ridisegna();
  const nome = nomeZona(s.pin.zona);
  const liv = livelloDi(s.pin.fascia);
  $('esito-titolo').textContent = s.pin.fascia ? `${s.pin.fascia}!` : s.pin.zona ? 'Buca!' : 'Tempo scaduto!';
  $('esito-titolo').style.color = s.pin.fascia ? COLORI_FASCE[liv] : '';
  $('esito-testo').textContent = s.pin.fascia
    ? `${nome}: +${s.pin.punti} sampietrini.${perche(s.domanda, s.pin.zona)}`
    : s.pin.zona ? `${nome} non va bene: questa tappa vale 0.` : 'Niente timbro: questa tappa vale 0.';
  $('soluzioni').replaceChildren(...catalogoInBlocchi(s.domanda, s.pin.zona));
  $('esito').showModal();
}

function perche(domanda, id) {
  const luoghi = domanda.perche?.[id];
  return luoghi?.length ? ` Per: ${luoghi.join(', ')}.` : '';
}

// Il catalogo intero di una domanda, dalla fascia piu alta alla piu bassa, coi luoghi che rendono giusta la zona.
function catalogoInBlocchi(domanda, tua) {
  const blocchi = [];
  for (let liv = SCALA.length - 1; liv >= 0; liv--) {
    const ids = risposte(domanda).filter((id) => domanda.catalogo[id] === liv)
      .sort((a, b) => zonePerId[a].nome.localeCompare(zonePerId[b].nome, 'it'));
    if (!ids.length) continue;
    const li = document.createElement('li');
    const titolo = document.createElement('b');
    titolo.textContent = `${SCALA[liv].nome} +${SCALA[liv].punti}`;
    titolo.style.color = COLORI_FASCE[liv];
    li.append(titolo, document.createElement('br'));
    for (const [i, id] of ids.entries()) {
      const span = document.createElement('span');
      const luoghi = domanda.perche?.[id];
      span.textContent = zonePerId[id].nome + (luoghi?.length ? ` (${luoghi.join(', ')})` : '') + (i < ids.length - 1 ? ', ' : '');
      if (id === tua) span.className = 'tua';
      li.append(span);
    }
    blocchi.push(li);
  }
  return blocchi;
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
  const QUADRI = ['⬜', '🟩', '🟦', '🟧', '🟨'];
  const righe = stati.map((s) => {
    if (!s.pin?.fascia) return s.pin?.zona ? '🕳️ buca' : '⏱️ tempo scaduto';
    return `${QUADRI[livelloDi(s.pin.fascia)]} ${s.pin.fascia} +${s.pin.punti}`;
  });
  // Tutte le risposte che si potevano dare, tappa per tappa.
  $('riepilogo').replaceChildren(...stati.map((s, i) => {
    const det = document.createElement('details');
    const sum = document.createElement('summary');
    sum.textContent = `${i + 1}. ${s.domanda.testo}: ${nomeZona(s.pin?.zona)} ${s.pin?.fascia ? `+${s.pin.punti}` : '0'}`;
    const ul = document.createElement('ul');
    ul.className = 'soluzioni';
    ul.append(...catalogoInBlocchi(s.domanda, s.pin?.zona));
    det.append(sum, ul);
    return det;
  }));
  $('condividi').textContent = `Diario di Sampietrino ${oggi}\n${righe.join('\n')}\nTotale ${tot}/${MASSIMO_AL_GIORNO}`;
  $('numero').textContent = 'Fine';
  $('testo').textContent = `${tot} sampietrini oggi`;
  selezionata = null;
  corrente = domande.length;
  mappa.inquadra();
  ridisegna();
  $('fine').showModal();
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

// Rotazione del telefono o finestra ridimensionata: si ridisegna, e a larghezza nuova si reinquadra.
// Solo la larghezza: su telefono la barra degli indirizzi cambia l'altezza e azzererebbe lo zoom.
let ultimaLarghezza = 0;
new ResizeObserver(() => {
  if (!mappa) return;
  const w = Math.round($('tela').getBoundingClientRect().width);
  if (w !== ultimaLarghezza) {
    ultimaLarghezza = w;
    const s = stati?.[corrente];
    if (s?.pin) mappa.inquadra({ zone: s.domanda.evidenzia || [], municipio: s.domanda.evidenziaMunicipio || null });
    else mappa.inquadra();
  } else mappa.disegna();
}).observe($('mappa'));

$('piu').addEventListener('click', () => mappa.zoom(1 / 1.5));
$('meno').addEventListener('click', () => mappa.zoom(1.5));
$('daje').addEventListener('click', () => { $('copertina').close(); avviaOrologio(); });
$('pianta').addEventListener('click', pianta);
$('avanti').addEventListener('click', avanti);
$('copia').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('condividi').textContent); $('copia').textContent = 'Copiato'; } catch { $('copia').textContent = 'Copia a mano dal riquadro'; }
});

avvia().catch((err) => {
  $('testo').textContent = `Errore nel caricare il gioco: ${err.message}`;
});
