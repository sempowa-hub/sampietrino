# Decisioni con Themino (31 ottobre 2026)

Prese da Simone e Themino insieme, sulle domande di `docs/domande-themino.md`.

| Tema | Decisione |
|---|---|
| Nome del gioco | Ci stanno pensando. Per ora resta "Sampietrino". |
| Voce | Un po' di romanesco va bene, ma senza caricatura esagerata del romano. |
| Diciture delle fasce | Da cartolina (1) · Ce sta (2) · Da romano de Roma (3) · Chicca (5) · Da Mino (8). Zero punti: Buca, e Capolinea se scade il tempo. Themino le registra a voce, 3-4 varianti ciascuna. |
| Dominio | Più avanti. Per ora resta sampietrino-roma.web.app. |
| Fasce belvederi e Bernini | Giuste così. Giardino degli Aranci passa a Da romano. |
| La chicca Da sampietrino | Gli effetti ottici e prospettici: via Piccolomini, la galleria di Borromini a Palazzo Spada. |
| Nomi delle zone | Meglio i nomi che usa la gente (mappa ufficiale 2026 dei quartieri) che i rioni storici. |
| Area | Si resta dentro il Raccordo. |
| Chicche | Sono 75 (il "95" in copertina è un refuso). |
| Altre chicche dai social | Ci sono, per ora no. |
| Domande scartate (Risorgimento, film, animali) | Lasciar perdere. |
| Nuovi temi | Non ora. |
| Domande di prima (metro, Trapizzino, Tevere, fontane, ville, movida, stazioni) | Restano tutte, accanto a quelle della guida. |
| Chi approva le domande nuove | Simone e Themino insieme. |
| Righe di contesto | Themino ne rivede 4-5, le altre si allineano a quelle. |
| Condivisione e classifica | Sì alla card del risultato e alla classifica tra follower, con login. |
| Faccia | La faccia di Themino a pixel, con espressioni, dentro il gioco. |

## Ville e parchi (31 ottobre 2026)
- **Villa** (domanda "Una zona con una villa storica (il parco)"): residenza nobiliare col suo parco, con "Villa" nel nome. Le 14 di sempre, da Borghese a Paganini. Vale la zona dove sta il cuore della villa, cioè quella con la parte più grande del parco; una seconda zona solo se ne ha almeno il 40%. Villa Ada vale solo per Villa Ada, non per Parioli o Trieste che il recinto sfiora.
- **Grande parco** (domanda "Una zona con un grande parco", ex "una villa o un parco"): parco pubblico, riserva naturale o villa con un nome, sopra i 15 ettari dentro il Raccordo, da OpenStreetMap. Vale la zona con la parte più grande del parco, più ogni zona che ne contiene almeno 50 ettari. I giardinetti di quartiere non contano. Fuori: Parco archeologico del Colosseo, Riserva del Litorale.
- Fasce dei parchi in `dati/categorie.json` (ville-themino, aree.fasce); quelli non elencati sono Chicca. Da rivedere con Themino nel catalogo.
- Aree vere da `strumenti/scarica_parchi.py` (dati/fonti/parchi-osm.geojson), regola "cuore" in `strumenti/costruisci.py`.
