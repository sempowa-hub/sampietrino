// Controlla dati/zone.json e dice sempre quanto ha guardato.
// Esce con errore se trova zero zone o zone non giocabili: niente silenzio verde.
import { readFileSync } from 'node:fs';

const file = new URL('../dati/zone.json', import.meta.url);
const { zone } = JSON.parse(readFileSync(file, 'utf8'));
const problemi = [];

if (!Array.isArray(zone) || zone.length === 0) {
  console.error('ERRORE: nessuna zona letta da dati/zone.json');
  process.exit(1);
}

const visti = new Set();
for (const z of zone) {
  if (visti.has(z.id)) problemi.push(`id ripetuto: ${z.id}`);
  visti.add(z.id);
  if (typeof z.notorieta !== 'number' || z.notorieta < 0 || z.notorieta > 100) {
    problemi.push(`${z.id}: notorieta fuori scala (${z.notorieta})`);
  }
}

const senzaConfini = zone.filter((z) => !z.confini).map((z) => z.id);

console.log(`Zone lette: ${zone.length}`);
console.log(`Con confini: ${zone.length - senzaConfini.length} su ${zone.length}`);
for (const p of problemi) console.log(`PROBLEMA: ${p}`);
if (senzaConfini.length) {
  console.log(`NON GIOCABILI (senza confini): ${senzaConfini.length}`);
  console.log(`  ${senzaConfini.join(', ')}`);
}

process.exit(problemi.length || senzaConfini.length ? 1 : 0);
