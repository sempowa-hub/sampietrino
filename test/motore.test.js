// Test del motore. I dati qui sono finti apposta: servono a provare le regole, non il gioco.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCALA, MASSIMO_AL_GIORNO, fascia, punti, risposte, nuovaDomanda, pinna, totale,
  domandeDelGiorno, giocabili, fnv1a,
} from '../src/motore.js';

const dom = { id: 'prova', catalogo: { a: 0, b: 1, c: 2, d: 3, e: 4 } };

test('ogni fascia della scala da i suoi punti', () => {
  assert.deepEqual(['a', 'b', 'c', 'd', 'e'].map((z) => punti(dom, z)), [1, 2, 3, 5, 8]);
  assert.equal(fascia(dom, 'e').nome, 'Da sampietrino');
  assert.equal(MASSIMO_AL_GIORNO, 40);
});

test('zona fuori catalogo: fascia null, zero punti', () => {
  assert.equal(fascia(dom, 'zz'), null);
  assert.equal(punti(dom, 'zz'), 0);
});

test('fascia fuori scala fa errore, non passa in silenzio', () => {
  assert.throws(() => fascia({ id: 'x', catalogo: { a: 9 } }, 'a'), /fuori scala/);
});

test('un solo pin per tappa', () => {
  const s = pinna(nuovaDomanda(dom), 'd');
  assert.deepEqual(s.pin, { zona: 'd', punti: 5, fascia: 'Da tassinaro' });
  assert.throws(() => pinna(s, 'e'), /chiusa/);
});

test('pin sbagliato: zero punti, tappa chiusa lo stesso', () => {
  const s = pinna(nuovaDomanda(dom), 'zz');
  assert.equal(s.pin.punti, 0);
  assert.equal(s.pin.fascia, null);
  assert.equal(totale([s, pinna(nuovaDomanda(dom), 'e')]), 8);
});

test('stesso giorno, stesse 5 domande; giorni diversi possono cambiare', () => {
  const pool = Array.from({ length: 12 }, (_, i) => ({ id: `q${i}`, tipo: `t${i}`, catalogo: { a: 0, b: 1, c: 2, d: 3 } }));
  const ids = (d) => domandeDelGiorno(d, pool).map((q) => q.id).join();
  assert.equal(ids('2026-11-01'), ids('2026-11-01'));
  assert.equal(domandeDelGiorno('2026-11-01', pool).length, 5);
  const giorni = new Set(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'].map(ids));
  assert.ok(giorni.size > 1);
});

test('la varieta prende almeno 2 domande per tipo prima di riempire', () => {
  const c = { a: 0, b: 1, c: 2, d: 3 };
  const pool = [
    ...Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, tipo: 'metro', catalogo: c })),
    ...Array.from({ length: 3 }, (_, i) => ({ id: `t${i}`, tipo: 'trapizzino', catalogo: c })),
  ];
  for (const giorno of ['2026-11-01', '2026-11-02', '2026-11-03']) {
    const tipi = domandeDelGiorno(giorno, pool).map((q) => q.tipo);
    assert.equal(tipi.length, 5);
    // Prima passata: 2 per tipo (il tetto). La quinta riempie con quello che resta.
    const metro = tipi.filter((t) => t === 'metro').length;
    assert.ok(metro >= 2 && metro <= 3, `metro: ${metro}`);
    assert.ok(tipi.filter((t) => t === 'trapizzino').length >= 2);
  }
});

test('le domande di riserva escono solo se mancano quelle di categoria', () => {
  const c = { a: 0, b: 1, c: 2, d: 3 };
  const pool = [
    ...['metro-a', 'metro-b', 'metro-c'].map((id) => ({ id, tipo: 'metro', catalogo: c })),
    { id: 'trapizzino', tipo: 'trapizzino', catalogo: c },
    ...Array.from({ length: 30 }, (_, i) => ({ id: `confina-${i}`, tipo: 'confina', riserva: true, catalogo: c })),
  ];
  for (const giorno of ['2026-11-01', '2026-11-02', '2026-11-03']) {
    const scelte = domandeDelGiorno(giorno, pool);
    // 2 metro (tetto) + trapizzino, poi riserva per arrivare a 5.
    assert.equal(scelte.filter((q) => q.tipo === 'metro').length, 2);
    assert.equal(scelte.filter((q) => q.id === 'trapizzino').length, 1);
    assert.equal(scelte.filter((q) => q.riserva).length, 2);
  }
});

test('pool troppo povero fa errore e dice quanto ha guardato', () => {
  const pool = [{ id: 'x', catalogo: { a: 0 } }, { id: 'y', catalogo: { a: 0, b: 1, c: 2, d: 3 } }];
  assert.equal(giocabili(pool).length, 1);
  assert.equal(risposte(pool[1]).length, 4);
  assert.throws(() => domandeDelGiorno('2026-11-01', pool), /ce ne sono 1 su 2/);
});

test('la scala sale sempre', () => {
  for (let i = 1; i < SCALA.length; i++) assert.ok(SCALA[i].punti > SCALA[i - 1].punti);
});

test('fnv1a valore noto', () => {
  assert.equal(fnv1a('a'), 0xe40c292c);
});
