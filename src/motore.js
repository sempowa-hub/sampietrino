// Motore di Sampietrino: regole pure, senza mappa e senza DOM.
// Ogni domanda ha un catalogo: per ogni zona giusta, la sua fascia nella scala dei punteggi.

export const DOMANDE_AL_GIORNO = 5;
export const MIN_RISPOSTE = 4;
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

// Solo le domande giocabili: abbastanza risposte per avere scelta, non troppe.
export function giocabili(pool) {
  return pool.filter((d) => {
    const n = risposte(d).length;
    return n >= MIN_RISPOSTE && n <= MAX_RISPOSTE;
  });
}

export function domandeDelGiorno(dataISO, pool) {
  const valide = giocabili(pool);
  if (valide.length < DOMANDE_AL_GIORNO) {
    throw new Error(`servono almeno ${DOMANDE_AL_GIORNO} domande giocabili, ce ne sono ${valide.length} su ${pool.length}`);
  }
  const caso = generatore(fnv1a(`sampietrino:${dataISO}`));
  const mazzo = [...valide];
  for (let i = mazzo.length - 1; i > 0; i--) {
    const j = Math.floor(caso() * (i + 1));
    [mazzo[i], mazzo[j]] = [mazzo[j], mazzo[i]];
  }
  // Prima le domande di categoria (metro, Trapizzino...), poi quelle di riserva. In ciascun gruppo
  // varieta: al massimo MAX_PER_TIPO domande dello stesso tipo, poi si riempie col resto del gruppo.
  const scelte = [];
  const perTipo = {};
  for (const gruppo of [mazzo.filter((d) => !d.riserva), mazzo.filter((d) => d.riserva)]) {
    for (const d of gruppo) {
      if (scelte.length === DOMANDE_AL_GIORNO) break;
      const t = d.tipo ?? 'senza-tipo';
      if ((perTipo[t] ?? 0) >= MAX_PER_TIPO) continue;
      perTipo[t] = (perTipo[t] ?? 0) + 1;
      scelte.push(d);
    }
    for (const d of gruppo) {
      if (scelte.length === DOMANDE_AL_GIORNO) break;
      if (!scelte.includes(d)) scelte.push(d);
    }
  }
  return scelte;
}
