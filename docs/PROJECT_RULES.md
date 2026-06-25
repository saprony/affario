# AFFARIO - PROJECT RULES

Versione: 1.0

Queste regole definiscono COME viene sviluppato Affario.
Non descrivono il prodotto (Product Bible), ma gli standard tecnici del progetto.

---

# 1. Filosofia

Affario è un progetto pensato per durare negli anni.

Ogni scelta tecnica deve privilegiare:

- semplicità
- chiarezza
- manutenzione
- scalabilità

Mai scegliere una soluzione solo perché è la più veloce.

---

# 2. Architettura

Il progetto è suddiviso in livelli indipendenti.

Frontend

↓

Motore Affario

↓

Servizi

↓

Database / API esterne

Ogni livello deve poter evolvere senza modificare gli altri.

---

# 3. Componenti

Ogni componente deve avere una sola responsabilità.

Esempi:

Hero

SearchBox

ProductList

AnalysisCard

AmazonButton

Mai creare componenti che svolgono più funzioni contemporaneamente.

---

# 4. Dimensione dei file

Obiettivo:

- massimo 250-300 righe per file.

Quando un file cresce troppo, deve essere suddiviso.

---

# 5. Grafica

Il progetto utilizza Tailwind CSS.

Non utilizzare nuovi style inline salvo casi eccezionali.

---

# 6. Logica

La logica di business NON deve stare nel frontend.

Il frontend mostra informazioni.

Il Motore Affario prende decisioni.

---

# 7. Nomi

Usare nomi semplici e descrittivi.

Esempio:

AnalysisCard

e non

Card2

oppure

ResultNew

---

# 8. Mobile First

Ogni nuova schermata deve essere progettata prima per smartphone.

Solo successivamente verrà adattata al desktop.

---

# 9. Decisioni Definitive

Le Decisioni Definitive della Product Bible hanno priorità sul codice.

Il codice deve adattarsi alla Product Bible, mai il contrario.

---

# 10. Regola Fondamentale

Ogni nuova funzione deve rispondere a queste domande:

- Aiuta l'utente?
- Rafforza la fiducia?
- È coerente con la missione di Affario?
- È tecnicamente scalabile?

Se anche una risposta è NO, la funzione deve essere rivalutata.