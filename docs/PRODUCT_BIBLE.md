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

Il Risparmio Potenziale viene calcolato confrontando:

- prezzo attuale
- prezzo minimo degli ultimi 90 giorni

Margine di prudenza:

- fino a 100 € → 10%
- da 101 € a 500 € → 5%
- oltre 500 € → 3%

Il margine NON viene mostrato all'utente.

Il Risparmio Potenziale viene arrotondato ai 5 €.

Se il Risparmio Potenziale è minore o uguale a zero:

NON mostrare:

0 €

Mostrare invece:

"AFFARIO non prevede ribassi di prezzo nei prossimi 30 giorni."

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
