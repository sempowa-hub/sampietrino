// Interfaccia di Sampietrino: mappa a pixel, un biglietto per tappa, catalogo delle risposte, riepilogo.
import {
  SCALA, MASSIMO_AL_GIORNO, risposte, nuovaDomanda, pinna, totale, domandeDelGiorno, DOMANDE_AL_GIORNO,
} from './motore.js';
import { creaMappa } from './mappa-pixel.js';

const $ = (id) => document.getElementById(id);

const oggi = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
const CHIAVE = `sampietrino:${oggi}`;

let dati, zonePerId, domande, stati, corrente, selezionata, mappa;

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

function ridisegna() {
  const s = stati[corrente];
  const d = s?.domanda;
  const chiusa = !!s?.pin;
  const pin = s?.pin;

  // Stato di ogni zona. Il bersaglio si mostra solo a tappa chiusa: prima rivelerebbe le risposte.
  const stato = (id) => {
    if (pin?.zona === id) return pin.fascia ? 'giusta' : 'sbagliata';
    if (id === selezionata) return 'scelta';
    if (chiusa && d.evidenzia?.includes(id)) return 'bersaglio';
    if (chiusa && id in d.catalogo) return 'soluzione';
    return 'normale';
  };
  const etichette = [];
  if (chiusa) for (const id of d.evidenzia || []) etichette.push({ id, inverso: true });
  if (pin) etichette.push({ id: pin.zona });
  mappa.imposta({ stato, etichette, municipio: chiusa ? d.evidenziaMunicipio : null });

  const ol = $('pin');
  ol.replaceChildren();
  const li = document.createElement('li');
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
  // A tappa aperta la mappa parte intera: inquadrare il bersaglio rivelerebbe dove sta.
  mappa.inquadra();
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
  // A tappa chiusa la mappa inquadra la zona (o il municipio) della domanda.
  mappa.inquadra({ zone: s.domanda.evidenzia || [], municipio: s.domanda.evidenziaMunicipio || null });
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
$('daje').addEventListener('click', () => $('copertina').close());
$('pianta').addEventListener('click', pianta);
$('avanti').addEventListener('click', avanti);
$('copia').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('condividi').textContent); $('copia').textContent = 'Copiato'; } catch { $('copia').textContent = 'Copia a mano dal riquadro'; }
});

avvia().catch((err) => {
  $('testo').textContent = `Errore nel caricare il gioco: ${err.message}`;
});
