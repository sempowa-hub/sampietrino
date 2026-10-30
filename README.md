# Sampietrino

Gioco quotidiano sui quartieri di Roma. Vale di più la risposta giusta che pochi darebbero.

Stato: **prototipo, non ancora giocabile**. Il motore delle regole c'è ed è testato. Mancano i confini delle zone e la mappa (vedi "Cosa manca").

## Regole

- Ogni giorno 5 domande, uguali per tutti. Esempio: "Una zona dove passa la Metro C".
- Per ogni domanda puoi mettere fino a 3 pin, uno alla volta, su zone diverse.
- Ogni pin giusto vale da 1 a 10 sampietrini. Più la zona è nota rispetto alle altre risposte giuste, meno vale: la più nota vale 1, la meno nota 10.
- Un pin sbagliato è una **buca**: perdi tutto quello che avevi messo da parte su quella domanda.
- Dopo ogni pin giusto scegli: ti fermi e metti in banca, oppure rischi un altro pin.
- Massimo 30 sampietrini a domanda, 150 al giorno.

Il cuore del gioco è la scelta dopo ogni pin: fermarsi o rischiare. Tre zone note e sicure valgono poco; una zona di cui non sei sicuro può valere 10, o farti perdere tutto.

## Scelte di progetto

- **Punti relativi alla domanda, non assoluti.** Il Quadraro vale tanto su "Metro A" perché lì concorre con Cinecittà, ma su un'altra domanda può valere poco. Così non esiste una zona che vince sempre.
- **Mappa senza nomi.** Niente mappa di sfondo con le etichette: suggerirebbe le risposte. Si disegnano solo le zone, il Tevere, le Mura e le linee della metro.
- **Domande calcolate dalla geometria, non scritte a memoria.** "Dentro le Mura", "fuori dal GRA", "ci passa il Tevere", "c'è una fermata della Metro B" si calcolano dai dati OpenStreetMap. Una domanda con risposte sbagliate uccide il gioco.
- **Una domanda è giocabile solo con 4-25 risposte giuste.** Meno è indovinello, più è lotteria.

## Cosa manca

1. **Confini delle zone.** Le zone sono quelle che dice la gente (Pigneto, Garbatella), non solo quelle ufficiali. Si costruiscono dai dati OpenStreetMap: vanno scaricati da `overpass-api.de`.
2. **Notorietà.** In `dati/zone.json` è una stima a occhio. Va tarata con un sondaggio tra amici ("nomina 10 quartieri di Roma") e poi coi pin veri dei giocatori.
3. **Generatore delle domande** dalla geometria.
4. **Interfaccia**: la mappa da toccare col telefono.

## Comandi

```
npm test            # regole del motore
npm run controlla   # stato di dati/zone.json: quante zone, quante giocabili
```

`npm run controlla` oggi esce con errore apposta: nessuna zona ha ancora i confini. Un controllo che passa senza aver guardato niente è peggio di nessun controllo.

## Struttura

```
src/motore.js              regole pure: punti, pin, buca, banca, domande del giorno
test/motore.test.js        test delle regole (dati finti, solo per le regole)
dati/zone.json             elenco zone: nome, notorietà stimata, confini
strumenti/controlla_zone.js  controllo dei dati
```
