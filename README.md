# Sampietrino

Gioco quotidiano sui quartieri di Roma. Vale di più la risposta giusta che pochi darebbero.

Stato: **prototipo giocabile coi dati veri** (31 ottobre 2026). Il gioco è la Roma **dentro il Grande Raccordo Anulare**: 73 zone, GRA e luoghi scaricati da OpenStreetMap, 9 domande di categoria giocabili (metro A/B/C, Trapizzino, Tevere, fontane, ville, movida, stazioni) più quelle di riserva. Le categorie con più di 25 zone giuste (mercati, ospedali, università, cinema, teatri, biblioteche) per ora restano fuori.

## Giocare

Online: **https://sampietrino-roma.web.app** (Firebase Hosting, progetto `sampietrino-roma`). Per pubblicare: `npm run pubblica`.

In locale:

```
npm run gioca      # poi apri http://localhost:8080
```

Nessuna dipendenza da installare per giocare: HTML, CSS e JavaScript puri.

## Regole

- Ogni giorno 5 tappe, uguali per tutti. Esempi: "Una zona con una fermata della Metro C", "Una zona con una fontana famosa".
- 60 secondi a tappa. Tocchi una zona, sotto la mappa compare il suo nome, e la timbri per confermare. Allo scadere del tempo la tappa vale 0. Il tempo sopravvive a una ricarica della pagina.
- Ogni risposta giusta sta in una fascia della scala. Zona sbagliata: buca, 0 punti.
- Dopo il timbro la mappa zooma sulla tua zona e la accende del colore della sua fascia. Le altre risposte restano nascoste fino al diario di fine giro.

| Fascia | Punti |
|---|---|
| Da sampietrino | 8 |
| Da tassinaro | 5 |
| Da romano | 3 |
| Nota | 2 |
| Scontata | 1 |

Massimo 40 al giorno. A fine tappa il gioco mostra solo la tua risposta, con il perché è giusta. A fine giro il diario: per ogni tappa tutte le risposte che si potevano dare, fascia per fascia, coi luoghi che le rendono giuste.

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

Le domande geometriche (confinanti, municipi, Raccordo, Vaticano) sono **di riserva**: escono solo se mancano domande di categoria. Una domanda per tipo al giorno, finché bastano.

## Scelte di progetto

- **Un biglietto, una scelta.** La zona sicura vale 1, quella che conosce solo chi vive per strada vale 8, una zona sbagliata vale 0.
- **Il tempo tiene onesto il gioco.** Il nome della zona si vede mentre scegli; senza timer basterebbe girare la mappa con calma per trovare le risposte. Il bersaglio della domanda (la zona di "confina con X") si mostra solo a tappa chiusa.
- **Punti relativi alla domanda.** Una zona vale tanto o poco a seconda delle altre risposte giuste: non esiste una zona che vince sempre.
- **Domande calcolate dalla geometria, mai scritte a mano.** Una domanda con una risposta sbagliata uccide il gioco.
- **Varietà**: una domanda per tipo al giorno (niente due metro o due belvederi insieme), finché le domande di categoria bastano.
- **Grafica**: carta stampata a vettori (`src/mappa.js`), nitida a ogni zoom: tratti di spessore fisso a schermo, grana della carta a scala di schermo; dentro il Raccordo crema chiaro, fuori campagna grigio-verde spenta, confini d'inchiostro (filo sottile tra zone, piu marcato tra municipi), Tevere acquerello con gli argini. Contrasto da stampa: inchiostro `#2a1f16` su carta. Colori delle fasce: peperino, pino, fontanella, cocciopesto, oro. Caratteri Pixelify Sans (testo, pixel ma fatto per leggere) e Silkscreen regular (marchio, numeri grandi, bottoni, e tutte le cifre dentro il testo: nel Pixelify il 5 sembra una S), nel repo con licenza OFL (`font/`), nessuna richiesta esterna. Riferimento di linguaggio visivo: `docs/riferimento-farflung.md`.
- **Ogni esito si argomenta coi dati.** Giusta: cosa c'è nella zona ("a Ponte c'è Via del Governo Vecchio") e perché vale quei punti. Sbagliata: perché no, secondo la domanda: il luogo giusto più vicino e dove sta ("il più vicino è Piazza della Madonna dei Monti, a Monti"), la distanza dal Tevere o dal Raccordo, le zone che confinano davvero, il municipio vero. I luoghi con le coordinate e le confinanti di ogni zona sono in `dati/gioco.json`.
- **Suoni**: sintetizzati con Web Audio in `src/suoni.js`, nessun file. Passaggio sulle zone, scelta, timbro, tic della suspense, caduta e tonfo del sampietrino, fanfara più lunga per le fasce più rare, pernacchio a 8 bit per la buca, tic negli ultimi dieci secondi, una nota per ogni zona che si accende nel diario. Tasto in testata per zittirli, il browser se lo ricorda.
- **Movimento**: un solo ciclo di animazione sulla mappa. Passando col mouse la zona si schiarisce e mostra il nome; la zona scelta ha il contorno rosso che lampeggia. Al timbro c'è suspense: la zona resta a inchiostro col contorno che pulsa, la camera vola piano verso di lei, il cartellino mostra il nome e tre puntini, i tic si fanno fitti; poi cade il sampietrino, mezzo secondo di silenzio, e la zona si colora dal punto di caduta mentre il timbro della fascia sbatte sul cartellino e i punti contano. Solo la tua risposta: tutte le altre si vedono nel diario a fine giro, tappa per tappa, accese a cascata dalla Scontata alla Da sampietrino. Tutto rispetta `prefers-reduced-motion`.
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
src/app.js                 interfaccia: tappe, biglietto, esito argomentato, diario
src/mappa.js               mappa a vettori su canvas: zone, animazioni, zoom, tocchi
src/suoni.js               effetti sonori sintetizzati con Web Audio
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
