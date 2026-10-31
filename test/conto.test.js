import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fondi, pulisciNome, nomeValido } from '../src/conto.js';

test('fondi: vince la partita finita, i timbri tengono la fascia migliore, i souvenir si sommano', () => {
  const browser = { giorni: { '2026-10-30': { tot: 5, finita: false, livelli: [1, 0, null, null, null] } }, timbri: { a: 1, b: 4 }, souvenir: { x: { data: '2026-10-30', scartato: false } }, visti: ['a'] };
  const conto = { giorni: { '2026-10-30': { tot: 21, finita: true, livelli: [4, 2, -1, 3, 1] } }, timbri: { a: 3 }, souvenir: { y: { data: '2026-10-01', scartato: true } }, visti: ['c'] };
  const u = fondi(browser, conto);
  assert.equal(u.giorni['2026-10-30'].tot, 21);
  assert.deepEqual(u.timbri, { a: 3, b: 4 });
  assert.deepEqual(Object.keys(u.souvenir).sort(), ['x', 'y']);
  assert.deepEqual(u.visti.sort(), ['a', 'c']);
});

test('fondi: un giorno giocato nel suo giorno su un dispositivo non e un recupero', () => {
  const u = fondi({ giorni: { d: { tot: 3, finita: true, livelli: [], recupero: true } } }, { giorni: { d: { tot: 3, finita: true, livelli: [] } } });
  assert.equal(u.giorni.d.recupero, undefined);
  const v = fondi({ giorni: { d: { tot: 3, finita: true, recupero: true } } }, {});
  assert.equal(v.giorni.d.recupero, true);
});

test('nickname: lettere, numeri e spazi, da 3 a 20 caratteri', () => {
  assert.equal(pulisciNome('  Mino   de  Roma!! '), 'Mino de Roma');
  assert.ok(nomeValido('Themino'));
  assert.ok(nomeValido("Nicolò D'Amico"));
  assert.ok(!nomeValido('ab'));
  assert.ok(!nomeValido('<script>'));
});
