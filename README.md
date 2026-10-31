# Sampietrino

Gioco quotidiano sui quartieri di Roma. Vale di più la risposta giusta che pochi darebbero.

Stato: **prototipo giocabile, versione provvisoria**. Il gioco è la Roma **dentro il Grande Raccordo Anulare**, con domande di categoria (metro, Trapizzino...). Ma GRA e luoghi vanno scaricati da OpenStreetMap (vedi "Cosa manca"): finché mancano, `dati/gioco.json` è costruito con `--provvisorio`, cioè tutta Roma e solo domande di riserva. Il file lo dichiara nel campo `avvisi`.

## Giocare

```
npm run gioca      # poi apri http://localhost:8080
```

Nessuna dipendenza da installare per giocare: HTML, CSS e JavaScript puri.

## Regole

- Ogni giorno 5 tappe, uguali per tutti. Esempi: "Una zona con una fermata della Metro C", "Una zona con un Trapizzino".
- Un biglietto a tappa: tocchi una zona e la timbri.
- Ogni risposta giusta sta in una fascia della scala. Zona sbagliata: buca, 0 punti.

| Fascia | Punti |
|---|---|
| Da sampietrino | 8 |
| Da tassinaro | 5 |
| Da romano | 3 |
| Nota | 2 |
| Scontata | 1 |

Massimo 40 al giorno. A fine tappa il gioco mostra tutte le risposte giuste, fascia per fascia.

## Il catalogo delle risposte

Ogni risposta possibile di ogni domanda è catalogata in una fascia: la zona più nota tra le risposte va in Scontata, la meno nota in Da sampietrino, le altre distribuite in mezzo (dalla notorietà in `dati/notorieta.json`).

- Tutto il catalogo, leggibile: `dati/catalogo.csv` (domanda, zona, fascia, punti).
- Per spostare a mano una zona di fascia: `dati/correzioni-fasce.json`, per esempio `{"metro-a": {"prati": 0}}`. La costruzione si ferma se la domanda o la zona non esistono.

## Le domande

Le domande vere sono **di categoria**: "una zona con...". Stanno in `dati/categorie.json`, una riga ciascuna; aggiungerne una costa una riga. Oggi: Metro A, Metro B (B1 compresa), Metro C, Trapizzino, Tevere, stazioni dei treni, mercati rionali, ospedali, università, cinema, teatri, biblioteche. Le zone giuste sono quelle che contengono almeno un luogo della categoria, preso da OpenStreetMap (`strumenti/scarica_luoghi.py`).

Le domande geometriche (confinanti, municipi, Raccordo, Vaticano) sono **di riserva**: escono solo se mancano domande di categoria. Al massimo 2 domande dello stesso tipo al giorno.

## Scelte di progetto

- **Un biglietto, una scelta.** La zona sicura vale 1, quella che conosce solo chi vive per strada vale 8, una zona sbagliata vale 0.
- **La mappa non suggerisce niente mentre giochi.** Niente sfondo con le etichette, niente zona evidenziata, niente inquadratura sul bersaglio, nessun nome finché non metti il pin. Se la mappa mostrasse dove sta Castro Pretorio, i suoi confinanti si vedrebbero a occhio e il rischio sparirebbe: la strategia diventerebbe "tocca sempre la zona col nome più strano". A domanda chiusa invece la mappa mostra tutto: è il momento in cui si impara.
- **Punti relativi alla domanda.** Una zona vale tanto o poco a seconda delle altre risposte giuste: non esiste una zona che vince sempre.
- **Domande calcolate dalla geometria, mai scritte a mano.** Una domanda con una risposta sbagliata uccide il gioco.
- **Varietà**: al massimo 3 domande dello stesso tipo al giorno.
- **Grafica**: pixel art a 16 bit. La mappa è disegnata su un canvas a pixel (`src/mappa-pixel.js`), una cella ogni 80 metri: ogni zona è un prato, i confini tra zone stradine color sabbia, i confini dei municipi strade grandi, fuori dal Comune il mare con spiaggia e acqua bassa. Alberi e casette coi tetti arancioni sono decisi da un hash della cella, quindi la mappa è identica per tutti. Cartelli neri con testo bianco, bottoni arancio come i tetti, bordi squadrati. Caratteri Silkscreen (titoli, numeri, bottoni: il 5 non si confonde con la S) e Jersey 10 (testo). Font nel repo (licenza OFL, `font/`), nessuna richiesta esterna.
- **Giocabile solo con 4-25 risposte giuste.** Meno è indovinello, più è lotteria.

## Dati

| File | Cosa | Da dove |
|---|---|---|
| `dati/fonti/quartieri-osm.geojson` | 107 poligoni, vecchia suddivisione toponomastica (rioni, quartieri, suburbi, parte dell'Agro) | OpenStreetMap, via il gestionale Beehind |
| `dati/fonti/municipi-osm.geojson` | 15 municipi | OpenStreetMap, via il gestionale Beehind |
| `dati/fonti/gra-osm.geojson` | area dentro il GRA | OpenStreetMap (autostrada A90): `python3 strumenti/scarica_gra.py` |
| `dati/categorie.json` | le domande di categoria, una riga ciascuna | scritto a mano |
| `dati/fonti/luoghi-osm.geojson` | fermate, Trapizzino e gli altri luoghi | OpenStreetMap: `python3 strumenti/scarica_luoghi.py` |
| `dati/catalogo.csv` | ogni risposta di ogni domanda con la sua fascia | generato |
| `dati/notorieta.json` | quanto è nota ogni zona, 0-100 | stima a occhio, da tarare |
| `dati/gioco.json` | zone, percorsi SVG, domande | generato: `npm run costruisci` (serve `pip install shapely pyproj numpy`) |

Confini © OpenStreetMap contributors, licenza ODbL: l'attribuzione resta visibile sulla mappa.

Tipi di domanda: "confina con X" (almeno 100 m di confine in comune), "una zona del Municipio N" (più di metà della zona nel municipio), "arriva fino al Raccordo", "confina col Vaticano".

Zone a cavallo del GRA: decide la quota, almeno il 50% dell'area dentro. Lo script stampa ogni volta l'elenco delle zone a cavallo con la loro quota, così si controlla a occhio.

## Cosa manca, in ordine

0. **Raccordo e luoghi**: `python3 strumenti/scarica_gra.py`, `python3 strumenti/scarica_luoghi.py`, poi `npm run costruisci`. Serve accesso a `overpass-api.de`. Gli script si fermano se l'anello non si chiude, se l'area non è plausibile o se una categoria non trova niente. Le categorie hanno `verificata: false` finché non si controllano i risultati veri (per esempio: i Trapizzino trovati sono tutte le sedi?).
1. **La mappa ufficiale del 2026** (334 quartieri, 22 rioni, 101 zone funzionali, delibera del 1° ottobre 2026): ha i nomi che usa la gente (Pigneto, Garbatella, San Lorenzo), che oggi mancano. Vedi `docs/roma.md`.
2. **Buchi nella copertura**: le zone coprono l'87,4% del Comune; dentro il GRA circa il 93% (misura con un anello di prova, da rifare col GRA vero). Sulla mappa i buchi sono tratteggiati e non si giocano.
3. **Più categorie**: un gioco quotidiano con 5 tappe consuma il mazzo in fretta. Servono decine di categorie in `dati/categorie.json`.
4. **Notorietà vera**: sondaggio tra amici, poi i pin dei giocatori.

## Comandi

```
npm test            # regole del motore
npm run gioca       # server locale
npm run costruisci  # rigenera dati/gioco.json e dati/catalogo.csv dalle fonti
```

## Struttura

```
index.html                 la pagina
src/motore.js              regole pure: scala, fasce, un pin a tappa, domande del giorno
src/app.js                 interfaccia: tappe, biglietto, catalogo, riepilogo
src/mappa-pixel.js         mappa in pixel art su canvas: griglia, zoom, tocchi
src/stile.css              grafica
test/motore.test.js        test delle regole (dati finti, solo per le regole)
dati/                      fonti, notorietà, dati generati
strumenti/scarica_gra.py   scarica il GRA da OpenStreetMap
strumenti/scarica_luoghi.py scarica i luoghi delle categorie da OpenStreetMap
strumenti/costruisci.py    fonti geografiche → dati/gioco.json
strumenti/servi.js         server statico per giocare in locale
docs/roma.md               ricerca su Roma, con le fonti
```
