# Sampietrino · istruzioni per Claude

Gioco quotidiano sui quartieri di Roma dentro il Raccordo, col marchio di Themino (Matteo Ceccarini, "Mino").
Ci lavorano due persone, ognuna col suo Claude: **Simone** (Beehind Studio) e **Mino**. Queste regole valgono per tutti e due.

- Online: https://themino.it (anche https://www.themino.it e https://sampietrino-roma.web.app)
- Firebase: progetto `sampietrino-roma` (Hosting, Firestore, Auth anonima + Google)
- Repo: https://github.com/sempowa-hub/sampietrino · **PUBBLICO**: mai email, password, token o chiavi nel codice o nelle regole
- Codice: HTML, CSS e JavaScript puri (moduli ES), niente build. Dati costruiti in Python da `strumenti/`.

## Lavorare in due senza pestarsi i piedi

Si lavora tutti su `main`. Il sito pubblicato e quello che c'e sul computer di chi fa il deploy: se deployi una copia vecchia, cancelli dal sito il lavoro dell'altro.

1. **Prima di iniziare**: `git pull`. Se ci sono modifiche non tue, leggile (`git log -5`).
2. **Ogni deploy**:
   - `git pull` (di nuovo: l'altro puo aver pubblicato nel frattempo);
   - bump di `version` in `package.json`;
   - `npm test`;
   - `firebase deploy --only hosting --project sampietrino-roma`;
   - **subito dopo** commit e `git push` su `main`.
   Mai lasciare un deploy senza push.
3. **Versione**: patch bump a OGNI deploy (0.2.22 -> 0.2.23), anche per un fix minimo, sennò i giocatori restano sulla cache vecchia. Minor bump (0.2.x -> 0.3.0) solo per un fix che tutti devono avere subito: mostra un avviso bloccante.
4. Commit con messaggio descrittivo in italiano. Niente force push, niente riscritture della storia.
5. Se `git pull` da conflitto su `dati/gioco.json`, `dati/calendario.json` o `dati/catalogo.csv`: non risolverlo a mano. Prendi il codice giusto e rigenera con `npm run costruisci`.

## Preparare il computer (una volta)

```
git clone https://github.com/sempowa-hub/sampietrino.git && cd sampietrino
npm install -g firebase-tools && firebase login        # con l'account Google che ha accesso al progetto
python3 -m venv .venv && .venv/bin/pip install numpy shapely pyproj
npm run gioca                                          # http://localhost:8080
```

Per ricostruire i dati usa il python della venv: `.venv/bin/python strumenti/costruisci.py && .venv/bin/python strumenti/calendario.py`.

In locale l'account e spento: le prove non creano utenti e non toccano contatori e classifica veri. Per provare login e classifica apri `http://localhost:8080/?conto` (attenzione: da li si scrive sui dati veri).

## Dati e domande: le regole che non si rompono

- **Le 9 domande di categoria originali non si toccano.**
- **Domande nuove**: entrano nel gioco solo se approvate da Simone **e** da Mino.
  - Le generate stanno in `dati/domande-generate.json`.
  - Le approvate in `dati/domande-approvate.json`.
  - Non rigenerare `domande-generate.json` in blocco senza far rivedere le nuove: `genera_domande.py` oggi ne tira fuori 74 non ancora viste.
- **Id delle zone mai cambiati**: le partite salvate li usano. Per mostrare un nome diverso usa `NOMI_DI_GIOCO` in `strumenti/costruisci.py` (per esempio Ripa si vede come Aventino).
- **Domande gia uscite**: i punti delle risposte non devono cambiare.
  - Se correggi una domanda gia giocata, blocca le fasce con `dati/correzioni-fasce.json`.
  - Fasce: 0 Da cartolina 1 pt, 1 Ce sta 2, 2 Da romano de Roma 3, 3 Chicca 5, 4 Da Mino 8.
- **Calendario** (`strumenti/calendario.py`): i giorni fino a domani restano fermi, si ripianificano solo quelli dopo. Dopo ogni modifica alle domande: `costruisci.py` e poi `calendario.py`.
- **Dopo una ricostruzione**: confronta il `gioco.json` vecchio col nuovo e controlla che sia cambiato solo quello che volevi.
- **Luoghi che non esistono** (progetti mai costruiti): `MAI_COSTRUITI` in `genera_domande.py`. Luoghi da contare in piu per un tipo: `IN_PIU`.

## Firestore

- `partite/{data}/punteggi/{uid}`: classifica del giorno.
- `settimane/{lunedi}/punteggi/{uid}`: classifica della settimana.
- `giocatori/{uid}`: storico sincronizzato (si fonde col telefono: il telefono puo rimandare su i dati cancellati).
- `proposte`: chicche proposte dai giocatori.
- `admin/{uid}`: chi modera. Gli admin sono documenti per uid, mai email nelle regole.
- `bloccati/{uid}`: giocatori che non pubblicano piu in classifica. Li crea e li toglie un admin dal gioco (Taccuino, Moderazione, scheda Classifica).
- Riga nascosta dalla moderazione: `nascosto: true` e `pubblico: false` sul punteggio del giorno e della settimana. Resta salvata, esce dalla classifica e dai conteggi, chi l'ha scritta non la puo piu toccare.
- Le risposte stanno in `dati/gioco.json`, quindi un punteggio perfetto si puo copiare: non si impedisce, si modera.
- Dopo ogni modifica a `firestore.rules`: `npm test` (le prova con l'API di test, serve gcloud) e poi `firebase deploy --only firestore:rules --project sampietrino-roma`.
- In classifica la foto e solo quella di Google (`lh3.googleusercontent.com`), lo controllano le regole e `fotoSicura` in `src/conto.js`.
- **Cancellazioni definitive**: le fa una persona dalla console Firebase, non Claude.

## Debug

1. Leggi prima i dati veri: Firestore via REST con `gcloud auth print-access-token`, il `gioco.json` online, i log.
2. Poi formula l'ipotesi e verificala sui dati.
3. Solo dopo scrivi il fix.

Se sei al secondo tentativo sullo stesso bug, fermati e rileggi i dati invece di aggiungere codice. Dopo ogni modifica visibile provala nel browser in locale (anche a 360 px di larghezza) prima del deploy.

## Stile

- Si scrive in italiano, tono romano e informale nei testi del gioco.
- **Mai trattini lunghi** (em dash o en dash) in testi, codice, commenti: usa punto, virgola, due punti o "·".
- **Mai dialog nativi** (`alert`, `confirm`, `prompt`) e mai date picker del browser: si usano i `<dialog>` e i componenti del gioco.
- Grafica: pixel art fine su carta d'epoca, icone 16x16 in `src/pixel.js`, animazioni sempre con `prefers-reduced-motion`.
- I commenti nel codice seguono quelli che ci sono: brevi, in italiano, spiegano il perche.

## Dove guardare

| Cosa | File |
|---|---|
| Logica di gioco, fine partita, condivisione | `src/app.js` |
| Taccuino, classifica, passaporto, souvenir | `src/taccuino.js` |
| Firebase (account, classifica, proposte) | `src/conto.js` |
| Mappa | `src/mappa.js`, `src/minimappa.js` |
| Zone e domande | `strumenti/costruisci.py`, `strumenti/genera_domande.py`, `strumenti/calendario.py` |
| Anteprima dei link e icona Home (`img/og.png`, `img/icona-180.png`) | `strumenti/anteprima.html`, `sh strumenti/anteprima.sh` |
| Decisioni di Mino e cose da fare | `docs/decisioni-themino.md`, `docs/roadmap.md` |
