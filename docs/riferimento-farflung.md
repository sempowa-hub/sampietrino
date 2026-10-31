# Riferimento: Farflung (farflung.game)

Gioco quotidiano di geografia mondiale da cui viene l'idea di Sampietrino. Osservato giocando la Expedition #27 (31 ottobre 2026). Serve come riferimento di linguaggio, non come modello da copiare: Sampietrino resta Roma, quartieri, punti e fasce sue.

## Meccanica osservata

- 5 prompt al giorno, uguali per tutti. Esempi del giorno: "Pin a country where someone was executed for witchcraft", "...among the ten that grow the most pumpkins", "...that has had a Ripley's Believe It or Not! museum", "...where mummies over 500 years old have been found", "...with catacombs that still hold thousands of human skeletons". Tema del giorno (Halloween) che lega le 5 domande.
- Timer a tappa (anello col numero, parte da 60).
- Tocchi un paese, il nome compare nel pannello, poi "DROP PIN" (o spazio/invio).
- Esito subito: fascia + km guadagnati + una curiosità di una riga sul perché è giusto ("A trial in Paris in 1390...").
- Fasce: Farflung +100 km, Elusive +85, Rare +70, Uncommon +55, Common +40, Miss 0.
- Il totale è una distanza percorsa (150 km) e una tappa del viaggio ("The Woods", "The Plains"): una mini mappa illustrata del percorso a lato.
- Riepilogo finale: la mappa colora tutte le risposte giuste per fascia; nel pannello per ogni prompt la tua risposta e l'elenco completo per fascia, "tap a country for a fun fact", la regola di cosa conta, "Should something else count?".
- Streak, archivio, conto alla rovescia per la prossima spedizione.

## Linguaggio visivo

- **Carta nautica d'epoca**, non pixel art: mare azzurro polvere con onde a tratteggio, terra color pergamena, coste a doppio tratto scuro, reticolo di meridiani e paralleli con le coordinate sui bordi, grana della carta sopra tutto.
- **Font**: VT323 (monospazio da terminale) per tutto, Bungee per il logo, Yellowtail (corsivo) per piccoli tocchi a mano.
- **Palette** (dalle variabili CSS):
  - inchiostro `#2b2118`, inchiostro 2 `#6a583f`, matita `#b9a67e`
  - foglio `#f4e9cd`, foglio 2 `#eadcb7`, card `#f8f0dc`
  - mare `#9ab8c2`, terra `#e3d2a8`, terra accesa `#f7e7bd`, costa `#4a3a26`, reticolo `#7f9ea8`
  - accento rosso `#b8322b`, pin e rotta `#d6453d`
  - fasce: oro `#ffd166`, viola `#9d7bff`, rosso `#ff5252`, verde `#2c9d6c`, sabbia `#c9b48c`
- **Bordi e ombre**: nessun raggio, cornici a filo d'inchiostro, ombra piena spostata in basso (`0 0 0 2px ink, 0 3px 0 2px ink`) che a pressione sparisce (`steps(2)`): bottoni come timbri.
- **Cartellini** dei nomi sulla mappa: rettangolo carta con bordo inchiostro, maiuscolo spaziato.
- **Movimento**: curve con rimbalzo per l'atterraggio del pin (`cubic-bezier(.2, 1.5, .4, 1)`), scatti a due passi per i bottoni.

## Cosa prendere per Sampietrino (da decidere)

- La carta d'epoca è coerente con la prima idea del progetto (Pianta del Nolli, 1748): Roma incisa, rioni a inchiostro, Tevere a tratteggio.
- La curiosità di una riga dopo ogni risposta ("perché è giusta"): il catalogo ha già il campo `perche` per le domande a elenco.
- Il tema del giorno che lega le 5 tappe.
- Il riepilogo con tutte le risposte per fascia sulla mappa (Sampietrino lo fa già, va reso così leggibile).

## Cosa NON prendere

- Nomi delle fasce, km come punteggio, il viaggio a tappe illustrato, logo e impaginazione: sono l'identità di Farflung. Sampietrino ha le sue fasce (Scontata ... Da sampietrino) e i suoi punti.
- Palette identica: la carta di Roma va sui toni suoi (travertino, cocciopesto, ocra, rosso pompeiano, verde dei pini).
