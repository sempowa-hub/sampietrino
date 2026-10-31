// Souvenir romani: si prendono giocando. Ognuno ha la sua icona a pixel (src/pixel.js), come si prende,
// e una chicca nello stile di Mino che si legge solo dopo averlo scartato.
// avanzamento(c) riceve il contesto di src/storico.js e torna [a che punto sei, obiettivo].
export const GRUPPI = ['Il tuo kit', 'Lungo la strada', 'La strada lunga', 'La via difficile', 'Curiosità'];

export const SOUVENIR = [
  {
    id: 'biglietto', icona: 'biglietto', gruppo: 0, nome: 'Biglietto timbrato', come: 'Finisci la prima partita',
    chicca: 'Il BIT dura 100 minuti: sul bus te lo godi tutto, in metro vale una corsa sola. Timbralo sempre, che i controllori ce stanno.',
    avanzamento: (c) => [c.finiti, 1],
  },
  {
    id: 'sampietrino', icona: 'sampietrino', gruppo: 0, nome: 'Sampietrino', come: 'Timbra la prima zona nel passaporto',
    chicca: 'Si chiama così perché il primo grande selciato fu Piazza San Pietro. È selce vulcanica: coi tacchi è una sfida, coi motorini pure.',
    avanzamento: (c) => [c.timbrati, 1],
  },
  {
    id: 'nasone', icona: 'nasone', gruppo: 0, nome: 'Nasone', come: 'Timbra 5 zone',
    chicca: 'Tappi il buco in fondo col dito e l\'acqua esce dal forellino sopra: così si beve da romani, senza piegarsi.',
    avanzamento: (c) => [c.timbrati, 5],
  },
  {
    id: 'tombino', icona: 'tombino', gruppo: 1, nome: 'Tombino SPQR', come: 'Timbra 25 zone',
    chicca: 'SPQR sta ovunque, pure sotto i piedi: Senatus Populusque Romanus. I romani dicono "Sono Pazzi Questi Romani", ma solo tra loro.',
    avanzamento: (c) => [c.timbrati, 25],
  },
  {
    id: 'carciofo', icona: 'carciofo', gruppo: 1, nome: 'Carciofo alla giudia', come: 'Timbra 50 zone',
    chicca: 'Al Ghetto lo friggono intero, due volte: si apre come un fiore e scrocchia come una patatina. Si mangia con le mani, foglia per foglia.',
    avanzamento: (c) => [c.timbrati, 50],
  },
  {
    id: 'lupa', icona: 'lupa', gruppo: 1, nome: 'Lupa capitolina', come: 'Timbra tutti i 22 rioni',
    chicca: 'I rioni sono 22: l\'ultimo arrivato è Prati, nel 1921. Chi abita a Prati te lo ricorda poco, chi abita a Trastevere te lo ricorda sempre.',
    avanzamento: (c) => [c.rioni, c.rioniTot],
  },
  {
    id: 'grattachecca', icona: 'grattachecca', gruppo: 1, nome: 'Grattachecca', come: 'Completa un municipio',
    chicca: 'Ghiaccio grattato a mano e sciroppo, lungo il Tevere. Non chiamarla granita davanti al chioschetto: è un\'altra cosa.',
    avanzamento: (c) => [c.casa.presi, c.casa.tot],
  },
  {
    id: 'colosseo', icona: 'colosseo', gruppo: 1, nome: 'Colosseo', come: 'Timbra tutte le zone dentro il Raccordo',
    chicca: 'Hai timbrato tutta Roma dentro il Raccordo. Manco il tassinaro più anziano di Termini: chapeau.',
    avanzamento: (c) => [c.timbrati, c.zone],
  },
  {
    id: 'gatto', icona: 'gatto', gruppo: 2, nome: 'Gatto di Largo Argentina', come: '3 giorni di fila',
    chicca: 'A Largo Argentina hanno fatto fuori Giulio Cesare. Oggi ci comandano i gatti, e hanno pure un rifugio tutto loro tra le rovine.',
    avanzamento: (c) => [c.serieMigliore, 3],
  },
  {
    id: 'vespa', icona: 'vespa', gruppo: 2, nome: 'Vespa', come: '7 giorni di fila',
    chicca: 'Vacanze romane, 1953: Audrey Hepburn e Gregory Peck in Vespa per il centro. Da allora mezzo mondo viene qui a rifare quel giro.',
    avanzamento: (c) => [c.serieMigliore, 7],
  },
  {
    id: 'sampietrino-oro', icona: 'sampietrino-oro', gruppo: 2, nome: 'Sampietrino d\'oro', come: '30 giorni di fila',
    chicca: 'Un mese intero senza saltare un giorno. A questo punto il sampietrino sei tu: duro, romano, e sempre al posto tuo.',
    avanzamento: (c) => [c.serieMigliore, 30],
  },
  {
    id: 'suppli', icona: 'suppli', gruppo: 3, nome: 'Supplì al telefono', come: 'Prendi la prima risposta Chicca',
    chicca: 'Lo spezzi e la mozzarella fa il filo, come la cornetta del telefono di una volta. Se non fa il filo, non è un supplì.',
    avanzamento: (c) => [c.chicche, 1],
  },
  {
    id: 'maritozzo', icona: 'maritozzo', gruppo: 3, nome: 'Maritozzo', come: 'Chiudi una partita da Romano de Roma (almeno 16)',
    chicca: 'Una volta il fidanzato ci nascondeva l\'anello dentro, sotto la panna. Oggi va bene pure senza anello, basta che sia fresco.',
    avanzamento: (c) => [Math.min(c.record, 16), 16],
  },
  {
    id: 'cupolone', icona: 'cupolone', gruppo: 3, nome: 'Cupolone', come: '3 risposte Da Mino nella stessa partita',
    chicca: 'Dal buco della serratura dell\'Aventino il Cupolone sta incorniciato in fondo al giardino. Chi lo sa, ci porta tutti.',
    avanzamento: (c) => [c.daMinoInUnGiorno, 3],
  },
  {
    id: 'moneta', icona: 'moneta', gruppo: 3, nome: 'Monetina di Trevi', come: 'Fai 40 su 40',
    chicca: 'Di spalle, mano destra sopra la spalla sinistra. Ogni anno nella fontana finisce più di un milione di euro, e va tutto in beneficenza.',
    avanzamento: (c) => [c.record, c.massimo],
  },
  {
    id: 'bocca', icona: 'bocca', gruppo: 4, nome: 'Bocca della Verità', come: 'Chiudi una partita a zero',
    chicca: 'Metti la mano e di\' la verità: oggi è andata male. Capita pure ai migliori. Domani se riparte.',
    avanzamento: (c) => [c.bucaTotale ? 1 : 0, 1],
  },
  {
    id: 'notturno', icona: 'notturno', gruppo: 4, nome: 'Biglietto del notturno', come: 'Recupera un giorno arretrato dal diario di bordo',
    chicca: 'I bus notturni a Roma hanno la N davanti. Arrivano quando vogliono, ma arrivano. Come chi recupera le partite.',
    avanzamento: (c) => [c.recuperi, 1],
  },
  {
    id: 'tazzina', icona: 'tazzina', gruppo: 4, nome: 'Caffè al bancone', come: 'Finisci 10 partite',
    chicca: 'Al bancone, in piedi, due sorsi e via. Seduto al tavolino costa di più: il romano lo sa e resta in piedi.',
    avanzamento: (c) => [c.finiti, 10],
  },
];

export const preso = (sv, c) => { const [a, b] = sv.avanzamento(c); return a >= b; };

// Aggiorna i souvenir presi nello storico. Torna gli id appena presi (da scartare).
export function aggiornaSouvenir(s, c, quando) {
  const nuovi = [];
  for (const sv of SOUVENIR) {
    if (s.souvenir[sv.id] || !preso(sv, c)) continue;
    s.souvenir[sv.id] = { data: quando, scartato: false };
    nuovi.push(sv.id);
  }
  return nuovi;
}
