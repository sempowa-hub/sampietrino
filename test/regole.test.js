// Regole di Firestore provate con l'API di test di Firebase Rules: valuta firestore.rules senza pubblicarle e
// senza toccare i dati. Serve gcloud con accesso al progetto; senza, i test si saltano.
// L'API passa i numeri come decimali: per lei "is int" e sempre falso e una lista non si legge con un indice
// decimale. Qui, e solo qui, "is int" diventa "is number" e l'indice dei punti passa da int(); il resto delle regole
// e quello vero.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const PROGETTO = 'sampietrino-roma';
let token = '';
try { token = execSync('gcloud auth print-access-token', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* niente gcloud */ }
const salta = token ? false : 'serve gcloud con accesso a sampietrino-roma';
const sorgente = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8').replaceAll('is int', 'is number').replace('[l + 1]', '[int(l) + 1]');

const DOC = '/databases/(default)/documents';
const OGGI = '2026-11-10', IERI = '2026-11-09', LUNEDI = '2026-11-09';
const ORA = `${OGGI}T12:00:00Z`;
const google = (uid = 'u1') => ({ uid, token: { firebase: { sign_in_provider: 'google.com' } } });
const anonimo = (uid = 'u1') => ({ uid, token: { firebase: { sign_in_provider: 'anonymous' } } });
const chi = { pubblico: true, nome: 'Mino', foto: '' };

// Un caso: chi scrive, dove, il documento prima e dopo, e (per la settimana) quanto vale il giorno in partite/.
function caso(nome, attesa, { auth = google(), path, method = 'update', prima, dopo, time = ORA, delGiorno }) {
  return {
    nome,
    expectation: attesa,
    request: { auth, path: `${DOC}/${path}`, method, time, resource: { data: dopo } },
    ...(prima ? { resource: { data: prima } } : {}),
    functionMocks: delGiorno === undefined ? [] : [{ function: 'get', args: [{ anyValue: {} }], result: { value: { data: { tot: delGiorno } } } }],
  };
}

const giornoPrima = { tot: 16, livelli: [4, 2, -1, 3, -1], ora: '2026-11-10T09:00:00Z', ...chi };
const giornoGiusto = { ...giornoPrima, tot: 17, livelli: [4, 2, -1, 3, 0] };
const punteggio = (data = OGGI, uid = 'u1') => `partite/${data}/punteggi/${uid}`;

const settimanaPrima = { giorni: { [IERI]: 10, [OGGI]: 14 }, tot: 24, n: 2, ultimo: OGGI, ora: '2026-11-10T09:00:00Z', ...chi };
const settimanaGiusta = { ...settimanaPrima, giorni: { [IERI]: 10, [OGGI]: 16 }, tot: 26, corretto: OGGI };
const settimana = (uid = 'u1') => `settimane/${LUNEDI}/punteggi/${uid}`;

const CASI = [
  // Punteggio del giorno
  caso('giorno: correzione con fasce e totale giusti', 'ALLOW', { path: punteggio(), prima: giornoPrima, dopo: giornoGiusto }),
  caso('giorno: correzione di ieri, ancora vicina', 'ALLOW', { path: punteggio(IERI), prima: giornoPrima, dopo: giornoGiusto }),
  caso('giorno: totale che non torna con le fasce', 'DENY', { path: punteggio(), prima: giornoPrima, dopo: { ...giornoGiusto, tot: 30 } }),
  caso('giorno: fascia fuori scala', 'DENY', { path: punteggio(), prima: giornoPrima, dopo: { ...giornoGiusto, livelli: [4, 2, -1, 3, 5], tot: 21 } }),
  caso('giorno: quattro fasce', 'DENY', { path: punteggio(), prima: giornoPrima, dopo: { ...giornoGiusto, livelli: [4, 2, -1, 3], tot: 16 } }),
  caso('giorno: data lontana', 'DENY', { path: punteggio('2026-11-05'), prima: giornoPrima, dopo: giornoGiusto }),
  caso('giorno: anonimo', 'DENY', { auth: anonimo(), path: punteggio(), prima: giornoPrima, dopo: giornoGiusto }),
  caso('giorno: punteggio di un altro', 'DENY', { auth: google('u2'), path: punteggio(), prima: giornoPrima, dopo: giornoGiusto }),
  caso('giorno: l\'ora non si sposta', 'DENY', { path: punteggio(), prima: giornoPrima, dopo: { ...giornoGiusto, ora: ORA } }),
  caso('giorno: nome e foto come prima', 'ALLOW', { path: punteggio(), prima: giornoPrima, dopo: { ...giornoPrima, nome: 'Themino' } }),
  caso('giorno: creazione come prima', 'ALLOW', { method: 'create', path: punteggio(), dopo: { ...giornoGiusto, ora: ORA } }),
  // Settimana
  caso('settimana: correzione del giorno uguale al punteggio del giorno', 'ALLOW', { path: settimana(), prima: settimanaPrima, dopo: settimanaGiusta, delGiorno: 16 }),
  caso('settimana: seconda correzione dello stesso giorno', 'ALLOW', { path: settimana(), prima: { ...settimanaGiusta }, dopo: { ...settimanaGiusta, giorni: { [IERI]: 10, [OGGI]: 18 }, tot: 28 }, delGiorno: 18 }),
  caso('settimana: correzione di ieri dopo oggi', 'ALLOW', { path: settimana(), prima: settimanaPrima, dopo: { ...settimanaPrima, giorni: { [IERI]: 7, [OGGI]: 14 }, tot: 21, corretto: IERI }, delGiorno: 7 }),
  caso('settimana: diversa dal punteggio del giorno', 'DENY', { path: settimana(), prima: settimanaPrima, dopo: settimanaGiusta, delGiorno: 14 }),
  caso('settimana: totale sbagliato', 'DENY', { path: settimana(), prima: settimanaPrima, dopo: { ...settimanaGiusta, tot: 40 }, delGiorno: 16 }),
  caso('settimana: due giorni cambiati', 'DENY', { path: settimana(), prima: settimanaPrima, dopo: { ...settimanaGiusta, giorni: { [IERI]: 12, [OGGI]: 16 }, tot: 28 }, delGiorno: 16 }),
  caso('settimana: giorno nuovo spacciato per correzione', 'DENY', { path: settimana(), time: '2026-11-11T12:00:00Z', prima: settimanaPrima, dopo: { ...settimanaPrima, giorni: { ...settimanaPrima.giorni, '2026-11-11': 9 }, tot: 33, corretto: '2026-11-11' }, delGiorno: 9 }),
  caso('settimana: correzione che cambia anche n', 'DENY', { path: settimana(), prima: settimanaPrima, dopo: { ...settimanaGiusta, n: 3 }, delGiorno: 16 }),
  caso('settimana: giorno non piu vicino', 'DENY', { path: settimana(), time: '2026-11-12T12:00:00Z', prima: settimanaPrima, dopo: { ...settimanaPrima, giorni: { [IERI]: 7, [OGGI]: 14 }, tot: 21, corretto: IERI }, delGiorno: 7 }),
  caso('settimana: anonimo', 'DENY', { auth: anonimo(), path: settimana(), prima: settimanaPrima, dopo: settimanaGiusta, delGiorno: 16 }),
  caso('settimana: giorno nuovo aggiunto come prima', 'ALLOW', { path: settimana(), time: '2026-11-11T12:00:00Z', prima: settimanaPrima, dopo: { ...settimanaPrima, giorni: { ...settimanaPrima.giorni, '2026-11-11': 9 }, tot: 33, n: 3, ultimo: '2026-11-11', ora: '2026-11-11T12:00:00Z' }, delGiorno: 9 }),
];

test('regole: correzione del punteggio del giorno e della settimana', { skip: salta }, async () => {
  const testCases = CASI.map(({ nome, ...c }) => c);
  const r = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROGETTO}:test`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'x-goog-user-project': PROGETTO, 'content-type': 'application/json' },
    body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: sorgente }] }, testSuite: { testCases } }),
  });
  const risposta = await r.json();
  assert.equal(r.status, 200, JSON.stringify(risposta.error || risposta).slice(0, 500));
  const sbagliati = risposta.testResults.map((t, i) => (t.state === 'SUCCESS' ? null : `${CASI[i].nome} (atteso ${CASI[i].expectation})`)).filter(Boolean);
  assert.deepEqual(sbagliati, []);
});
