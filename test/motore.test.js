// Test del motore. I dati qui sono finti apposta: servono a provare le regole, non il gioco.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  punti, nuovaDomanda, pinna, fermati, totale, domandeDelGiorno, giocabili, fnv1a,
} from '../src/motore.js';

const notorieta = { a: 90, b: 70, c: 50, d: 30, e: 10, f: 50 };
const dom = { id: 'prova', testo: 'prova', risposte: ['a', 'b', 'c', 'd', 'e'] };

test('la piu nota vale 1, la meno nota 10', () => {
  assert.equal(punti(dom, 'a', notorieta), 1);
  assert.equal(punti(dom, 'e', notorieta), 10);
  assert.equal(punti(dom, 'c', notorieta), 6);
});

test('zona sbagliata vale null, non zero', () => {
  assert.equal(punti(dom, 'f', notorieta), null);
});

test('a pari notorieta stesso punteggio', () => {
  const d = { risposte: ['a', 'c', 'f', 'e'] };
  assert.equal(punti(d, 'c', notorieta), punti(d, 'f', notorieta));
});

test('notorieta mancante fa errore, non passa in silenzio', () => {
  assert.throws(() => punti({ risposte: ['a', 'zz'] }, 'a', notorieta), /notorieta mancante/);
});

test('tre pin giusti chiudono la domanda piena', () => {
  let s = nuovaDomanda(dom);
  s = pinna(s, 'e', notorieta);
  s = pinna(s, 'd', notorieta);
  s = pinna(s, 'a', notorieta);
  assert.equal(s.esito, 'piena');
  assert.equal(s.banco, 10 + 8 + 1);
});

test('un pin sbagliato azzera la domanda', () => {
  let s = nuovaDomanda(dom);
  s = pinna(s, 'e', notorieta);
  s = pinna(s, 'f', notorieta);
  assert.equal(s.esito, 'buca');
  assert.equal(s.banco, 0);
  assert.throws(() => pinna(s, 'a', notorieta), /chiusa/);
});

test('fermarsi mette in banca', () => {
  let s = nuovaDomanda(dom);
  assert.throws(() => fermati(s), /almeno un pin/);
  s = fermati(pinna(s, 'e', notorieta));
  assert.equal(s.esito, 'fermata');
  assert.equal(totale([s]), 10);
});

test('pin ripetuto non conta e non chiude', () => {
  let s = pinna(nuovaDomanda(dom), 'e', notorieta);
  s = pinna(s, 'e', notorieta);
  assert.equal(s.pin.length, 1);
  assert.equal(s.ripetuta, 'e');
  assert.equal(s.esito, 'aperta');
});

test('stesso giorno, stesse domande; giorni diversi possono cambiare', () => {
  const pool = Array.from({ length: 12 }, (_, i) => ({ id: `q${i}`, risposte: ['a', 'b', 'c', 'd'] }));
  const ids = (d) => domandeDelGiorno(d, pool).map((q) => q.id).join();
  assert.equal(ids('2026-11-01'), ids('2026-11-01'));
  assert.equal(domandeDelGiorno('2026-11-01', pool).length, 5);
  assert.throws(() => domandeDelGiorno('2026-11-01', pool.slice(0, 4)), /almeno 5/);
  const giorni = new Set(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'].map(ids));
  assert.ok(giorni.size > 1);
});

test('pool troppo povero fa errore e dice quanto ha guardato', () => {
  const pool = [{ id: 'x', risposte: ['a'] }, { id: 'y', risposte: ['a', 'b', 'c', 'd'] }];
  assert.equal(giocabili(pool).length, 1);
  assert.throws(() => domandeDelGiorno('2026-11-01', pool), /ce ne sono 1 su 2/);
});

test('fnv1a valore noto', () => {
  assert.equal(fnv1a('a'), 0xe40c292c);
});
