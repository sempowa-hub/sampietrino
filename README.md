# Sampietrino

Gioco quotidiano sui quartieri di Roma. Vale di più la risposta giusta che pochi darebbero.

Stato: **prototipo giocabile**. 101 zone, 102 domande calcolate dalla geometria. I confini sono quelli vecchi di OpenStreetMap, non ancora la mappa ufficiale del 2026 (vedi "Cosa manca").

## Giocare

```
npm run gioca      # poi apri http://localhost:8080
```

Nessuna dipendenza da installare per giocare: HTML, CSS e JavaScript puri.

## Regole

- Ogni giorno 5 domande, uguali per tutti. Esempio: "Una zona che confina con Castro Pretorio".
- Per ogni domanda puoi mettere fino a 3 pin, uno alla volta, su zone diverse.
- Ogni pin giusto vale da 1 a 10 sampietrini. Più la zona è nota rispetto alle altre risposte giuste, meno vale: la più nota vale 1, la meno nota 10.
- Un pin sbagliato è una **buca**: perdi tutto quello che avevi messo da parte su quella domanda.
- Dopo ogni pin giusto scegli: ti fermi e metti in banca, oppure rischi un altro pin.
- Massimo 30 sampietrini a domanda, 150 al giorno.

## Scelte di progetto

- **Il rischio è il gioco.** Tre zone note e sicure valgono poco; una zona di cui non sei sicuro può valere 10, o farti perdere tutto.
- **La mappa non suggerisce niente mentre giochi.** Niente sfondo con le etichette, niente zona evidenziata, niente inquadratura sul bersaglio, nessun nome finché non metti il pin. Se la mappa mostrasse dove sta Castro Pretorio, i suoi confinanti si vedrebbero a occhio e il rischio sparirebbe: la strategia diventerebbe "tocca sempre la zona col nome più strano". A domanda chiusa invece la mappa mostra tutto: è il momento in cui si impara.
- **Punti relativi alla domanda.** Una zona vale tanto o poco a seconda delle altre risposte giuste: non esiste una zona che vince sempre.
- **Domande calcolate dalla geometria, mai scritte a mano.** Una domanda con una risposta sbagliata uccide il gioco.
- **Varietà**: al massimo 3 domande dello stesso tipo al giorno.
- **Giocabile solo con 4-25 risposte giuste.** Meno è indovinello, più è lotteria.

## Dati

| File | Cosa | Da dove |
|---|---|---|
| `dati/fonti/quartieri-osm.geojson` | 107 poligoni, vecchia suddivisione toponomastica (rioni, quartieri, suburbi, parte dell'Agro) | OpenStreetMap, via il gestionale Beehind |
| `dati/fonti/municipi-osm.geojson` | 15 municipi | OpenStreetMap, via il gestionale Beehind |
| `dati/notorieta.json` | quanto è nota ogni zona, 0-100 | stima a occhio, da tarare |
| `dati/gioco.json` | zone, percorsi SVG, domande | generato: `npm run costruisci` (serve `pip install shapely pyproj numpy`) |

Confini © OpenStreetMap contributors, licenza ODbL: l'attribuzione resta visibile sulla mappa.

Tipi di domanda oggi: "confina con X" (almeno 100 m di confine in comune), "una zona del Municipio N" (più di metà della zona nel municipio), "confina con un altro Comune o col Vaticano".

## Cosa manca, in ordine

1. **La mappa ufficiale del 2026** (334 quartieri, 22 rioni, 101 zone funzionali, delibera del 1° ottobre 2026): ha i nomi che usa la gente (Pigneto, Garbatella, San Lorenzo), che oggi mancano. Vedi `docs/roma.md`.
2. **Buchi nella copertura**: le zone coprono l'87,4% del Comune. Mancano tra l'altro Ostia (i tre quartieri del lido) e una parte del Municipio IX. Sulla mappa sono tratteggiati e non si giocano.
3. **Domande più ricche**: Tevere, Mura Aureliane, GRA, metro. Servono i dati di OpenStreetMap (`overpass-api.de`).
4. **Notorietà vera**: sondaggio tra amici, poi i pin dei giocatori.

## Comandi

```
npm test            # regole del motore
npm run gioca       # server locale
npm run costruisci  # rigenera dati/gioco.json dalle fonti
```

## Struttura

```
index.html                 la pagina
src/motore.js              regole pure: punti, pin, buca, banca, domande del giorno
src/app.js                 mappa SVG, zoom, interfaccia
src/stile.css              grafica
test/motore.test.js        test delle regole (dati finti, solo per le regole)
dati/                      fonti, notorietà, dati generati
strumenti/costruisci.py    fonti geografiche → dati/gioco.json
strumenti/servi.js         server statico per giocare in locale
docs/roma.md               ricerca su Roma, con le fonti
```
