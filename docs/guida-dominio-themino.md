# Sampietrino su themino.it

Il gioco resta dov'è (Firebase, progetto `sampietrino-roma`): themino.it ci punta sopra.
Il dominio è registrato su Aruba (31 ottobre 2026) e non ha ancora record DNS: è il momento giusto.

## 1. Simone, nella console Firebase (1 minuto)
1. Apri https://console.firebase.google.com/project/sampietrino-roma/hosting/sites
2. Sul sito `sampietrino-roma` clicca **Aggiungi dominio personalizzato**.
3. Scrivi `themino.it`, lascia spenta l'opzione di reindirizzamento, **Continua**.
4. Firebase mostra i record da mettere su Aruba: di solito un record **TXT** e un record **A**. Copiali e mandali a Themino (sono quelli che servono al punto 2).
5. Rifai la stessa cosa con `www.themino.it`, scegliendo **Reindirizza a themino.it**.

## 2. Themino, su Aruba (5 minuti)
1. Entra su https://admin.aruba.it con le credenziali del dominio.
2. **Gestione domini** → themino.it → **Gestione DNS e terzo livello** (o "Pannello DNS").
3. Se ci sono già record **A** su `@` (o vuoto) e su `www` che puntano ai server di Aruba, **modificali** o cancellali: devono restare solo quelli di Firebase.
4. Aggiungi i record che ti ha mandato Simone. Di solito sono:

| Tipo | Nome | Valore |
|---|---|---|
| A | @ (vuoto) | 199.36.158.100 |
| TXT | @ (vuoto) | hosting-site=sampietrino-roma |
| A | www | 199.36.158.100 |

   Se la console Firebase mostra valori diversi, valgono quelli della console.
5. Salva. Non toccare i record MX se un giorno ci metti la posta.

## 3. Attesa
- I DNS si propagano in qualche ora (a volte fino a 24).
- Poi Firebase crea da solo il certificato HTTPS: nella console il dominio passa a **Connesso**.
- Da quel momento https://themino.it apre il gioco, https://www.themino.it ci porta lì. sampietrino-roma.web.app continua a funzionare.

## 4. Login Google sul dominio nuovo (lo fa Claude)
Firebase Authentication → Impostazioni → **Domini autorizzati** → aggiungere `themino.it` e `www.themino.it`,
altrimenti "Entra con Google" su themino.it dà errore.
