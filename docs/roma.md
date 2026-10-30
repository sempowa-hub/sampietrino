# Roma: cosa sappiamo e da dove viene

Note di ricerca per costruire le zone e le domande. Ogni dato ha la sua fonte. Quello che non è verificato è scritto.

## La mappa ufficiale dei quartieri (2026): è la base delle zone

- Il 1° ottobre 2026 l'Assemblea Capitolina ha approvato la nuova mappa dei quartieri (deliberazione n. 150): **334 quartieri urbani, 22 rioni, 101 zone funzionali**. Sostituisce una suddivisione vecchia di circa 50 anni.
- I nomi sono quelli che usa la gente: nell'elenco ci sono Pigneto, Garbatella, Centocelle, Testaccio. Nuovi nomi aggiunti nella versione finale: Nuova Talenti, Casale Rosso.
- Le bozze (327/22/104, poi 332/22/100) sono superate. Possibile accorpamento Statuario-Capannelle (333): da verificare.
- Garbatella: il Municipio VIII ha chiesto di allargarla lungo la Circonvallazione Ostiense. Esito non noto.

**Perché conta per il gioco:** era il problema più grosso. "Zone come le chiama la gente" adesso ha confini ufficiali, quindi niente confini disegnati a mano e niente discussioni su dove finisce il Pigneto: decide la delibera.

**Formato dei confini:** il Comune pubblica le mappe approvate in PDF; le versioni interattive (portale GeoRoma) sono in aggiornamento. Shapefile o GeoJSON: non trovati. Da cercare su GeoRoma e sugli open data di Roma Capitale, o da chiedere all'Ufficio Partecipazione e Quartieri.

**Scelta di gioco da fare:** 334 + 22 zone sono tante su un telefono. Opzioni: tutte con zoom; oppure le domande restano sui quartieri ma la mappa si apre per municipio.

Fonti:
- Roma Capitale, approvazione: https://www.comune.roma.it/web/it/notizia/assemblea-capitolina-approva-nuova-mappa-dei-quartieri.page
- Roma Capitale, i quartieri: https://www.comune.roma.it/web/it/i-quartieri-di-roma.page
- Comunicato sulla mappa: https://www.comune.roma.it/web-resources/cms/documents/mappa_dei_quartieri.pdf
- RomaToday, versione definitiva: https://www.romatoday.it/politica/mappa-quartieri-roma-2026-versione-definitiva.html
- RomaToday, municipio per municipio: https://www.romatoday.it/politica/nuovi-quartieri-confini-spostati-e-nomi-modificati-come-cambia-la-mappa-di-roma-municipio-per-municipio.html
- RomaToday, Garbatella: https://www.romatoday.it/politica/nuova-mappa-quartieri-roma-garbatella-protesta-perche.html
- Abitare a Roma: https://abitarearoma.it/nuova-mappa-di-roma-la-rivoluzione-dei-quartieri-arriva-in-aula-giulio-cesare/
- Dentro Magazine: https://dentromagazine.com/dopo-50-anni-roma-ridisegna-se-stessa-approvata-la-nuova-mappa-dei-quartieri-334-nomi-per-raccontare-la-citta-reale/
- Carteinregola (consultazione): https://www.carteinregola.it/la-nuova-mappa-dei-quartieri-di-roma-si-possono-mandare-osservazioni/

## Metropolitana (per le domande "ci passa la Metro...")

- **A**: Battistini - Anagnina, 27 stazioni. Scambio con B a Termini, con C a San Giovanni.
- **B**: Laurentina - Rebibbia; **B1**: Bologna - Jonio (fino a Conca d'Oro dal 2012, Jonio dal 2015). 25 o 26 stazioni a seconda della fonte.
- **C**: Monte Compatri-Pantano - Colosseo/Fori Imperiali. Colosseo in servizio dal 16 dicembre 2025, scambio con B. Le stazioni oltre (Venezia, Chiesa Nuova, San Pietro...) non sono aperte.
- Da verificare sull'elenco ATAC prima di generare domande. Meglio ancora: posizione delle stazioni da OpenStreetMap, così l'appartenenza al quartiere si calcola e non si scrive a mano.

Fonti:
- https://www.romatoday.it/guida/trasporti/metropolitana-roma-linee-fermate.html
- https://www.mappametroroma.it/en-metro-linia-c-roma.php
- https://www.mappametroroma.it/en-metro-linia-b-roma.php
- https://en.wikipedia.org/wiki/Line_A_(Rome_Metro)
- https://en.wikipedia.org/wiki/Line_B_(Rome_Metro)

## Municipi

15 municipi. Il passaggio della zona 8A Torrespaccata dal VI al VII (2021) e gli aggiustamenti del V (2023) dicono che i confini cambiano: si prendono dalla stessa fonte dei quartieri, non da elenchi vecchi.

Fonte: https://it.wikipedia.org/wiki/Zone_urbanistiche_di_Roma

## Cosa serve per andare avanti

Accesso di rete dalla sessione a:
- `comune.roma.it` e il portale GeoRoma: confini ufficiali dei quartieri;
- `overpass-api.de`: Tevere, Mura Aureliane, GRA, stazioni della metro, parchi, monumenti.
