// Motore di Sampietrino: regole pure, senza mappa e senza DOM.
// Una domanda ha un insieme di zone giuste; ogni zona ha una notorieta (0-100).

export const PIN_PER_DOMANDA = 3;
export const DOMANDE_AL_GIORNO = 5;
export const MIN_RISPOSTE = 4;
export const MAX_RISPOSTE = 25;

// Punti di una zona giusta: relativi alle altre risposte della stessa domanda.
// La piu nota vale 1, la meno nota 10. A parita di notorieta, rango medio.
export function punti(domanda, zonaId, notorieta) {
  const giuste = domanda.risposte;
  if (!giuste.includes(zonaId)) return null;
  if (giuste.length === 1) return 5;
  const n = (id) => {
    const v = notorieta[id];
    if (typeof v !== 'number') throw new Error(`notorieta mancante per "${id}"`);
    return v;
  };
  const mia = n(zonaId);
  const piuNote = giuste.filter((id) => n(id) > mia).length;
  const pari = giuste.filter((id) => n(id) === mia).length;
  const rango = piuNote + (pari - 1) / 2;
  return Math.round(1 + (9 * rango) / (giuste.length - 1));
}

// Stato di una domanda in corso. Esiti: aperta, fermata, piena, buca.
export function nuovaDomanda(domanda) {
  return { domanda, pin: [], banco: 0, esito: 'aperta' };
}

export function pinna(stato, zonaId, notorieta) {
  if (stato.esito !== 'aperta') throw new Error(`domanda gia chiusa (${stato.esito})`);
  if (stato.pin.some((p) => p.zona === zonaId)) return { ...stato, ripetuta: zonaId };
  const p = punti(stato.domanda, zonaId, notorieta);
  const pin = [...stato.pin, { zona: zonaId, punti: p }];
  if (p === null) return { ...stato, pin, banco: 0, esito: 'buca' };
  const banco = stato.banco + p;
  const esito = pin.length >= PIN_PER_DOMANDA ? 'piena' : 'aperta';
  return { ...stato, pin, banco, esito };
}

export function fermati(stato) {
  if (stato.esito !== 'aperta') throw new Error(`domanda gia chiusa (${stato.esito})`);
  if (stato.pin.length === 0) throw new Error('serve almeno un pin prima di fermarsi');
  return { ...stato, esito: 'fermata' };
}

export function totale(stati) {
  return stati.reduce((s, d) => s + (d.esito === 'buca' ? 0 : d.banco), 0);
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
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
}

// Solo le domande giocabili: abbastanza risposte per avere scelta, non troppe.
export function giocabili(pool) {
  return pool.filter((d) => d.risposte.length >= MIN_RISPOSTE && d.risposte.length <= MAX_RISPOSTE);
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
  return mazzo.slice(0, DOMANDE_AL_GIORNO);
}
