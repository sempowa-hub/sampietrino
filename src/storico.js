// Storico del giocatore, nel browser finche non arriva il login: giorni giocati (serie, archivio, statistiche),
// zone timbrate (passaporto), souvenir presi. Tutto in una chiave sola di localStorage.
import { SCALA, MASSIMO_AL_GIORNO } from './motore.js';

export const oggi = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
export const GIORNI_INDIETRO = 7; // oggi piu i 7 giorni prima si possono giocare dal diario
export const PRIMO_GIORNO = '2026-10-31'; // il primo giorno di Sampietrino: l'archivio non va piu indietro

// Date come stringhe AAAA-MM-GG, spostate a mezzogiorno UTC: niente sorprese con l'ora legale.
export const sposta = (data, n) => new Date(Date.parse(`${data}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
export const giocabile = (data) => data <= oggi && data >= PRIMO_GIORNO && data >= sposta(oggi, -GIORNI_INDIETRO);
export const dataIt = (data, opzioni) => new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', ...opzioni }).format(new Date(`${data}T12:00:00Z`));

// I gradi della giornata, dal totale: stessi nomi e colori della storia da condividere.
export const GRADI = [
  { nome: 'Da Mino', min: 32, livello: 4, faccia: 'stupore' },
  { nome: 'Chicca', min: 24, livello: 3, faccia: 'risata' },
  { nome: 'Romano de Roma', min: 16, livello: 2, faccia: 'sorriso' },
  { nome: 'Ce sta', min: 8, livello: 1, faccia: 'dubbioso' },
  { nome: 'Da cartolina', min: 1, livello: 0, faccia: 'triste' },
  { nome: 'Buca totale', min: 0, livello: -1, faccia: 'buca' },
];
export const gradoDi = (tot) => GRADI.find((g) => tot >= g.min);

const CHIAVE = 'sampietrino:storico';
const livelloDi = (nome) => SCALA.findIndex((f) => f.nome === nome);

export function leggi() {
  let s;
  try { s = JSON.parse(localStorage.getItem(CHIAVE)) || {}; } catch { s = {}; }
  s = { giorni: {}, timbri: {}, souvenir: {}, ...s };
  // Prima versione dello storico: niente zone "viste", tutte quelle gia timbrate contano come viste.
  if (!s.visti) s.visti = Object.keys(s.timbri);
  // Giorni registrati prima delle statistiche: i livelli tappa per tappa si ricostruiscono dalla partita salvata.
  for (const [data, g] of Object.entries(s.giorni)) {
    if (g.livelli) continue;
    try {
      const v = JSON.parse(localStorage.getItem(`sampietrino:${data}`));
      if (v?.stati) g.livelli = v.stati.map((x) => (x.pin ? (x.pin.fascia ? livelloDi(x.pin.fascia) : -1) : null));
    } catch { /* partita persa: restano solo i punti */ }
  }
  return s;
}

export function scrivi(s) {
  try { localStorage.setItem(CHIAVE, JSON.stringify(s)); } catch { /* senza memoria si gioca lo stesso */ }
}

// Partita salvata di un giorno: serve al diario per sapere se e iniziata, finita o da giocare.
export function partita(data) {
  try { return JSON.parse(localStorage.getItem(`sampietrino:${data}`)); } catch { return null; }
}

// Serie: giorni di fila con la partita finita nel suo giorno (i recuperi dal diario non contano),
// fino a oggi, o fino a ieri se oggi non e ancora finita.
const vale = (g) => g?.finita && !g.recupero;
export function serie(giorni) {
  let d = vale(giorni[oggi]) ? oggi : sposta(oggi, -1);
  let n = 0;
  while (vale(giorni[d])) { n += 1; d = sposta(d, -1); }
  return n;
}
export function serieMigliore(giorni) {
  let migliore = 0;
  for (const d of Object.keys(giorni)) {
    if (!vale(giorni[d]) || vale(giorni[sposta(d, -1)])) continue;
    let n = 0, x = d;
    while (vale(giorni[x])) { n += 1; x = sposta(x, 1); }
    migliore = Math.max(migliore, n);
  }
  return migliore;
}

// Numeri per souvenir e statistiche, calcolati dallo storico e dalle zone del gioco.
export function contesto(s, zone) {
  const perId = Object.fromEntries(zone.map((z) => [z.id, z]));
  const giorni = Object.values(s.giorni);
  const finiti = giorni.filter((g) => g.finita);
  const timbrati = Object.keys(s.timbri).filter((id) => perId[id]);
  const rioni = zone.filter((z) => z.tipo === 'rione');
  const livelli = giorni.flatMap((g) => g.livelli || []);
  // Municipio piu vicino a essere completato.
  const perCasa = {};
  for (const z of zone) {
    const c = (perCasa[z.casa] ??= { tot: 0, presi: 0 });
    c.tot += 1;
    if (z.id in s.timbri) c.presi += 1;
  }
  const casa = Object.values(perCasa).sort((a, b) => b.presi / b.tot - a.presi / a.tot || a.tot - b.tot)[0] || { tot: 1, presi: 0 };
  return {
    finiti: finiti.length,
    timbrati: timbrati.length,
    zone: zone.length,
    rioni: rioni.filter((z) => z.id in s.timbri).length,
    rioniTot: rioni.length,
    casa,
    serieMigliore: serieMigliore(s.giorni),
    record: Math.max(0, ...finiti.map((g) => g.tot)),
    massimo: MASSIMO_AL_GIORNO,
    daMinoInUnGiorno: Math.max(0, ...giorni.map((g) => (g.livelli || []).filter((l) => l === 4).length)),
    chicche: livelli.filter((l) => l === 3).length,
    bucaTotale: finiti.some((g) => g.tot === 0),
    recuperi: giorni.filter((g) => g.recupero && g.finita).length,
  };
}

// Partite finite salvate nel browser, per portarle sull'account (e rivederne il diario da un altro telefono).
export function partiteLocali(s) {
  const out = {};
  for (const [d, g] of Object.entries(s.giorni)) {
    if (!g.finita) continue;
    const p = partita(d);
    if (p) out[d] = p;
  }
  return out;
}
export function ripristinaPartite(partite = {}) {
  for (const [d, p] of Object.entries(partite)) {
    try { if (!localStorage.getItem(`sampietrino:${d}`)) localStorage.setItem(`sampietrino:${d}`, JSON.stringify(p)); } catch { /* pieno */ }
  }
}
