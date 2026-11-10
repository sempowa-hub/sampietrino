import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fondi, pulisciNome, nomeValido, correzioneGiorno, correzioneSettimana } from '../src/conto.js';

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

test('correzioneGiorno: si aggiorna solo se totale o fasce sono cambiati', () => {
  const pubblicato = { tot: 16, livelli: [4, 2, -1, 3, -1], ora: 1, nome: 'Mino' };
  assert.equal(correzioneGiorno(pubblicato, { tot: 16, livelli: [4, 2, -1, 3, -1] }), null);
  assert.deepEqual(correzioneGiorno(pubblicato, { tot: 18, livelli: [4, 2, -1, 3, 1] }), { tot: 18, livelli: [4, 2, -1, 3, 1] });
  // Stesso totale con fasce diverse (Ce sta + buca = buca + Ce sta): le fasce in classifica vanno allineate lo stesso.
  assert.deepEqual(correzioneGiorno(pubblicato, { tot: 16, livelli: [4, -1, 2, 3, -1] }).livelli, [4, -1, 2, 3, -1]);
  // Fasce ridistribuite a giornata in corso: vale anche in giu.
  assert.deepEqual(correzioneGiorno(pubblicato, { tot: 9, livelli: [1, 2, -1, 3, -1] }), { tot: 9, livelli: [1, 2, -1, 3, -1] });
});

test('correzioneSettimana: cambia solo il giorno corretto e il totale della differenza', () => {
  const v = { giorni: { '2026-11-09': 10, '2026-11-10': 14 }, tot: 24, n: 2, ultimo: '2026-11-10' };
  assert.equal(correzioneSettimana(v, '2026-11-10', 14), null);
  assert.equal(correzioneSettimana(v, '2026-11-11', 20), null); // giorno non ancora in settimana: lo aggiunge pubblicaSettimana
  assert.deepEqual(correzioneSettimana(v, '2026-11-10', 16), { giorni: { '2026-11-09': 10, '2026-11-10': 16 }, tot: 26, corretto: '2026-11-10' });
  assert.equal(correzioneSettimana(v, '2026-11-09', 7).tot, 21);
  assert.equal(correzioneSettimana(null, '2026-11-10', 16), null);
});
