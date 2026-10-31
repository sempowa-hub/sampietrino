// Motore di Sampietrino: regole pure, senza mappa e senza DOM.
// Ogni domanda ha un catalogo: per ogni zona giusta, la sua fascia nella scala dei punteggi.

export const DOMANDE_AL_GIORNO = 5;
export const MIN_RISPOSTE = 5;
export const MAX_RISPOSTE = 40;
export const MAX_PER_TIPO = 1;

// La scala: dalla risposta che dicono tutti a quella che conosce solo chi vive per strada.
// Diciture scelte da Themino; le registrera anche a voce.
export const SCALA = [
  { nome: 'Da cartolina', punti: 1 },
  { nome: 'Ce sta', punti: 2 },
  { nome: 'Da romano de Roma', punti: 3 },
  { nome: 'Chicca', punti: 5 },
  { nome: 'Da Mino', punti: 8 },
];
export const MASSIMO_AL_GIORNO = DOMANDE_AL_GIORNO * SCALA.at(-1).punti;

// Fascia di una zona per questa domanda, o null se la zona non e una risposta giusta.
export function fascia(domanda, zonaId) {
  const livello = domanda.catalogo[zonaId];
  if (livello === undefined) return null;
  if (!SCALA[livello]) throw new Error(`fascia ${livello} fuori scala per "${zonaId}" in "${domanda.id}"`);
  return SCALA[livello];
}

export function punti(domanda, zonaId) {
  return fascia(domanda, zonaId)?.punti ?? 0;
}

export function risposte(domanda) {
  return Object.keys(domanda.catalogo);
}

// Un pin per tappa: lo metti e la tappa e chiusa.
export function nuovaDomanda(domanda) {
  return { domanda, pin: null };
}

export function pinna(stato, zonaId) {
  if (stato.pin) throw new Error('tappa gia chiusa');
  const f = fascia(stato.domanda, zonaId);
  return { ...stato, pin: { zona: zonaId, punti: f?.punti ?? 0, fascia: f?.nome ?? null } };
}

export function totale(stati) {
  return stati.reduce((s, d) => s + (d.pin?.punti ?? 0), 0);
}

// Hash FNV-1a 32 bit: stessa partita per tutti nello stesso giorno.
export function fnv1a(testo) {
  let h = 0x811c9dc5;
  for (let i = 0; i < testo.length; i++) {
    h ^= testo.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function generatore(seme) {
  let s = seme || 1;
  // Con semi vicini (date consecutive) i primi numeri dello xorshift si somigliano: il Tevere usciva
  // cinque giorni su sette. Si buttano i primi 32.
  const avanza = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; };
  for (let i = 0; i < 32; i++) avanza();
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
}

// Solo le domande giocabili: abbastanza risposte per avere scelta, non troppe, tutte le fasce coperte.
export function giocabili(pool) {
  return pool.filter((d) => {
    const n = risposte(d).length;
    // Ogni fascia deve avere almeno una zona: il punteggio massimo dev'essere sempre possibile.
    const fasce = new Set(Object.values(d.catalogo));
    return n >= MIN_RISPOSTE && n <= MAX_RISPOSTE && SCALA.every((_, i) => fasce.has(i));
  });
}

export const A_MANO_AL_GIORNO = 2;
// Dal 1 novembre 2026 niente domande di riserva e dentro quelle generate. I giorni prima restano identici
// (stessa scelta, stesse domande): le partite salvate, il diario e la classifica di quei giorni non cambiano.
export const DATA_NUOVE = '2026-11-01';

function mescola(lista, caso) {
  const mazzo = [...lista];
  for (let i = mazzo.length - 1; i > 0; i--) {
    const j = Math.floor(caso() * (i + 1));
    [mazzo[i], mazzo[j]] = [mazzo[j], mazzo[i]];
  }
  return mazzo;
}

export function domandeDelGiorno(dataISO, pool) {
  const vecchio = dataISO < DATA_NUOVE;
  const valide = giocabili(pool.filter((d) => (vecchio ? !d.generata : !d.riserva)));
  if (valide.length < DOMANDE_AL_GIORNO) {
    throw new Error(`servono almeno ${DOMANDE_AL_GIORNO} domande giocabili, ce ne sono ${valide.length} su ${pool.length}`);
  }
  const caso = generatore(fnv1a(`sampietrino:${dataISO}`));
  const mazzo = mescola(valide, caso);
  const scelte = [];
  const perTipo = {};
  const prendi = (gruppo, fino, conTetto) => {
    for (const d of gruppo) {
      if (scelte.length >= fino) break;
      if (scelte.includes(d)) continue;
      const t = d.tipo ?? 'senza-tipo';
      if (conTetto && (perTipo[t] ?? 0) >= MAX_PER_TIPO) continue;
      perTipo[t] = (perTipo[t] ?? 0) + 1;
      scelte.push(d);
    }
  };
  if (vecchio) {
    // Fino al 31 ottobre: prima le domande di categoria, poi quelle di riserva; al massimo MAX_PER_TIPO per tipo,
    // poi si riempie col resto del gruppo.
    for (const gruppo of [mazzo.filter((d) => !d.riserva), mazzo.filter((d) => d.riserva)]) {
      prendi(gruppo, DOMANDE_AL_GIORNO, true);
      prendi(gruppo, DOMANDE_AL_GIORNO, false);
    }
    return scelte;
  }
  // Dal 1 novembre: fino a A_MANO_AL_GIORNO domande scritte a mano (le prime 9 e le chicche di Mino), poi le generate
  // (strumenti/genera_domande.py). Stesso tetto per tipo. Poi le tappe in ordine sparso.
  // Ordine per punteggio di ogni domanda nel giorno (hash di data e id), non per mescolata del mazzo: aggiungere o
  // togliere una domanda cambia il giorno solo se e proprio quella a entrare o uscire.
  const punteggio = (d) => fnv1a(`${dataISO}:${d.id}`);
  const ordinate = [...valide].sort((a, b) => punteggio(a) - punteggio(b) || (a.id < b.id ? -1 : 1));
  const aMano = ordinate.filter((d) => !d.generata);
  const generate = ordinate.filter((d) => d.generata);
  prendi(aMano, A_MANO_AL_GIORNO, true);
  for (const gruppo of [generate, aMano]) {
    prendi(gruppo, DOMANDE_AL_GIORNO, true);
    prendi(gruppo, DOMANDE_AL_GIORNO, false);
  }
  return mescola(scelte, caso);
}
