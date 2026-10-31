# Sampietrino

Gioco quotidiano sui quartieri di Roma. Vale di più la risposta giusta che pochi darebbero.

Stato: **prototipo giocabile coi dati veri** (31 ottobre 2026). Il gioco è la Roma **dentro il Grande Raccordo Anulare**: 73 zone, GRA e luoghi scaricati da OpenStreetMap, 9 domande di categoria giocabili (metro A/B/C, Trapizzino, Tevere, fontane, ville, movida, stazioni) più quelle di riserva. Le categorie con più di 25 zone giuste (mercati, ospedali, università, cinema, teatri, biblioteche) per ora restano fuori.

## Giocare

```
npm run gioca      # poi apri http://localhost:8080
```

Nessuna dipendenza da installare per giocare: HTML, CSS e JavaScript puri.

## Regole

- Ogni giorno 5 tappe, uguali per tutti. Esempi: "Una zona con una fermata della Metro C", "Una zona con una fontana famosa".
- 60 secondi a tappa. Tocchi una zona, sotto la mappa compare il suo nome, e la timbri per confermare. Allo scadere del tempo la tappa vale 0. Il tempo sopravvive a una ricarica della pagina.
- Ogni risposta giusta sta in una fascia della scala. Zona sbagliata: buca, 0 punti.
- Dopo il timbro la mappa zooma sulla tua zona e la accende del colore della sua fascia; tutte le altre risposte giuste si accendono coi loro colori.

| Fascia | Punti |
|---|---|
| Da sampietrino | 8 |
| Da tassinaro | 5 |
| Da romano | 3 |
| Nota | 2 |
| Scontata | 1 |

Massimo 40 al giorno. A fine tappa il gioco mostra tutte le risposte giuste, fascia per fascia, coi luoghi che le rendono giuste. A fine giro, per ogni tappa, tutte le risposte che si potevano dare.

## Il catalogo delle risposte

Ogni risposta possibile di ogni domanda è catalogata in una fascia: la zona più nota tra le risposte va in Scontata, la meno nota in Da sampietrino, le altre distribuite in mezzo (dalla notorietà in `dati/notorieta.json`).

- Tutto il catalogo, leggibile: `dati/catalogo.csv` (domanda, zona, fascia, punti).
- Per spostare a mano una zona di fascia: `dati/correzioni-fasce.json`, per esempio `{"metro-a": {"prati": 0}}`. La costruzione si ferma se la domanda o la zona non esistono.

## Le domande

Le domande vere sono **di categoria**: "una zona con...". Stanno in `dati/categorie.json`, una riga ciascuna; aggiungerne una costa una riga. Tre modi:

- **metro**: le fermate delle linee (Metro A, Metro B con la B1, Metro C).
- **osm**: un filtro OpenStreetMap (Trapizzino, Tevere, stazioni, mercati, ospedali, università, cinema, teatri, biblioteche). La fascia viene dalla notorietà della zona.
- **elenco**: luoghi per nome, ciascuno con la sua fascia decisa a mano (fontane famose, ville, movida). La zona prende la fascia del suo luogo più scontato: Trevi è Scontata per la Fontana di Trevi, Trastevere è Da tassinaro per il Fontanone. È il modo giusto quando conta quanto è famoso il luogo, non la zona.
  In OpenStreetMap un nome ha spesso omonimi: la fermata "Villa Fiorelli", il bike sharing "Fontana di Trevi", un'altra Fontana delle Anfore a Monti. Lo script scarta fermate, locali e negozi, scarta ciò che sta fuori dal GRA, preferisce i tag della categoria (`preferisci`, per esempio `{"amenity": "fountain"}`). Se restano luoghi distinti non sceglie a caso: stampa AMBIGUO con le coordinate, e alla voce si aggiunge `vicino: [lat, lon]` oppure `osm` col filtro esatto (il Mosè in OSM si chiama Fontana dell'Acqua Felice).

Le posizioni vengono sempre da OpenStreetMap (`strumenti/scarica_luoghi.py`): le zone giuste si calcolano, non si scrivono. I nomi non trovati vengono elencati.

Le domande geometriche (confinanti, municipi, Raccordo, Vaticano) sono **di riserva**: escono solo se mancano domande di categoria. Al massimo 2 domande dello stesso tipo al giorno.

## Scelte di progetto

- **Un biglietto, una scelta.** La zona sicura vale 1, quella che conosce solo chi vive per strada vale 8, una zona sbagliata vale 0.
- **Il tempo tiene onesto il gioco.** Il nome della zona si vede mentre scegli; senza timer basterebbe girare la mappa con calma per trovare le risposte. Il bersaglio della domanda (la zona di "confina con X") si mostra solo a tappa chiusa.
- **Punti relativi alla domanda.** Una zona vale tanto o poco a seconda delle altre risposte giuste: non esiste una zona che vince sempre.
- **Domande calcolate dalla geometria, mai scritte a mano.** Una domanda con una risposta sbagliata uccide il gioco.
- **Varietà**: al massimo 3 domande dello stesso tipo al giorno.
- **Grafica**: pixel art a 16 bit. La mappa è disegnata su un canvas a pixel (`src/mappa-pixel.js`), una cella ogni 80 metri: ogni zona è un prato, i confini tra zone stradine color sabbia, i confini dei municipi strade grandi, il Tevere un fiume con gli argini (quando ci sono i dati), fuori dal Comune il mare con spiaggia e acqua bassa. Niente case o monumenti disegnati. Colori delle fasce: grigio, verde, azzurro, arancio, oro. Cartelli neri con testo bianco, bottoni arancio come i tetti, bordi squadrati. Caratteri Silkscreen (titoli, numeri, bottoni: il 5 non si confonde con la S) e Jersey 10 (testo). Font nel repo (licenza OFL, `font/`), nessuna richiesta esterna.
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

0. **Verificare le categorie**: GRA (341 km²) e luoghi sono scaricati, fontane, ville e movida controllate a mano sul catalogo. Le altre hanno ancora `verificata: false` (per esempio: i Trapizzino trovati sono tutte le sedi? Ne risultano 6). Per riscaricare: `python3 strumenti/scarica_gra.py`, `python3 strumenti/scarica_luoghi.py`, poi `npm run costruisci`; Overpass risponde spesso 502, lo script riprova da solo.
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
docs/riferimento-farflung.md  meccanica e linguaggio visivo di Farflung, il gioco da cui viene l'idea
```
