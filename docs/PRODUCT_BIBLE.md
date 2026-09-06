# AFFARIO - PRODUCT BIBLE

Versione: V1

---

# Mission

AFFARIO aiuta le persone a scegliere il momento giusto per acquistare.

Non confronta semplicemente i prezzi.
Analizza l'andamento storico e fornisce un consiglio oggettivo.

L'obiettivo è far risparmiare denaro agli utenti.

---

# Filosofia

Gli affari non si trovano...
si aspettano!

---

# Slogan

Scegli il momento giusto per comprare.

---

# Obiettivo della V1

Realizzare una piattaforma funzionante che:

- permette la ricerca di un prodotto;
- mostra le varianti disponibili;
- analizza il prezzo;
- suggerisce il momento migliore per acquistare;
- consente l'acquisto tramite Amazon;
- permette di attivare un alert.

Le ottimizzazioni UX saranno implementate dopo la V1.

---

# Decisioni Definitive

## DD-001 - Risparmio Potenziale

Il Prezzo Obiettivo AFFARIO è il 25° percentile della Buy Box degli ultimi 90
giorni, ponderato per la durata dei prezzi osservati.

Il calcolo ricostruisce lo stato Buy Box al cutoff dei 90 giorni. I periodi in
cui la Buy Box non è disponibile non entrano nella distribuzione dei prezzi.

La qualità minima richiede:

- stato Buy Box disponibile al cutoff;
- serie non troncata;
- almeno 4 osservazioni valide;
- almeno 7 giorni di copertura temporale;
- almeno 7 giorni complessivi con Buy Box valida.

Il Prezzo Obiettivo viene arrotondato ai 5 € soltanto dopo il calcolo
statistico.

Il Risparmio Potenziale è:

prezzo attuale - Prezzo Obiettivo AFFARIO.

Viene mostrato soltanto se positivo ed è arrotondato ai 5 €. Se il prezzo
attuale è minore o uguale al target, lo stato è `NOT_APPLICABLE` e non vengono
mostrati né "0 €" né un Prezzo Obiettivo consumer.

Prezzo Obiettivo e Risparmio Potenziale descrivono lo storico osservato: non
sono previsioni temporali né promesse di raggiungimento.

---

## DD-002 - Fasce Affario Score

80 - 100

🟢 Ottimo momento per acquistare

65 - 79

🟢 Buon prezzo

50 - 64

🟡 Prezzo nella media

0 - 49

🔴 Conviene aspettare

---

## DD-003 - Verdetto

Il Verdetto NON viene mai scritto manualmente.

È sempre generato automaticamente
dall'Affario Score.

---

## DD-004 - Evidenza del Risparmio Potenziale

Score >= 80

Il Risparmio Potenziale è poco evidente.

Colore giallo.

Perché il messaggio principale è:

Compra.

---

Score 65-79

Risparmio Potenziale normale.

Colore verde.

---

Score <65

Il Risparmio Potenziale diventa il messaggio principale.

Colore verde intenso.

---

# Regole di sviluppo

Prima funziona.

Poi si ottimizza.

Le modifiche grafiche vengono rinviate dopo il completamento della V1.

Ogni nuova funzionalità deve aumentare il valore del prodotto.

---

# Architettura

Hero

↓

ProductList

↓

AnalysisCard

↓

Motore Affario

---

# Roadmap

V1

- Ricerca
- Varianti prodotto
- Analysis Card
- Motore Affario
- Alert
- Amazon

V2

- Recensioni verificate
- Esperienze di acquisto
- Analytics
- Ottimizzazioni UX
