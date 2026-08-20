# AGENTS.md — AFFARIO

## 1. Obiettivo del progetto

AFFARIO è un'applicazione web che aiuta l'utente a decidere QUANDO acquistare un prodotto online.

La domanda principale a cui AFFARIO deve rispondere è:

"È un buon momento per comprare oppure conviene aspettare?"

AFFARIO non deve diventare un generico comparatore di prezzi, sito di coupon o portale di recensioni.

Principio di prodotto:

"Gli affari non si trovano... si aspettano!"

Sottotitolo:

"Scegli il momento giusto per comprare."


## 2. Priorità assoluta

La priorità attuale è completare una V1 funzionante.

Regola fondamentale:

PRIMA FUNZIONA. POI SI OTTIMIZZA.

Lavorare su UNA SOLA FUNZIONE ALLA VOLTA.

Non aggiungere autonomamente:
- nuove funzionalità;
- nuove pagine;
- nuove dipendenze;
- refactoring non richiesti;
- miglioramenti grafici non richiesti;
- funzionalità "utili in futuro".

Se durante un'attività emerge un'idea aggiuntiva, non implementarla.


## 3. Metodo di lavoro

Per ogni richiesta:

1. leggere prima i file interessati;
2. comprendere il funzionamento esistente;
3. modificare soltanto ciò che serve alla richiesta;
4. preservare tutto ciò che già funziona;
5. controllare eventuali errori TypeScript/build;
6. comunicare chiaramente quali file sono stati modificati.

Non modificare file estranei alla funzione richiesta.

Non cambiare decisioni di prodotto senza esplicita autorizzazione.

Se una richiesta è ambigua o può modificare una logica importante di AFFARIO, chiedere conferma prima di implementare.


## 4. Sicurezza del progetto

Non eseguire autonomamente:

- git commit
- git push
- deploy
- modifiche a Vercel
- modifiche DNS
- cancellazioni importanti
- installazione di nuovi pacchetti

a meno che siano stati esplicitamente richiesti.

Non modificare credenziali, token, file segreti o variabili d'ambiente senza autorizzazione.

Non esporre mai secret key nel codice client.


## 5. Stack attuale

AFFARIO utilizza:

- Next.js
- React
- TypeScript
- App Router
- Tailwind CSS
- Git / GitHub
- Vercel

Il progetto deve rimanere semplice e mantenibile.


## 6. Architettura attuale

Principali aree:

- app/ → pagine e coordinamento dell'applicazione
- components/ → componenti React
- data/ → dati locali provvisori
- lib/ → logica applicativa/calcoli
- types/ → tipi TypeScript
- services/ → servizi e future integrazioni
- public/ → asset statici
- docs/ → documentazione del progetto

Componenti principali attuali:

- components/Hero.tsx
- components/ProductList.tsx
- components/AnalysisCard.tsx

File dati:

- data/products.ts

Tipo prodotto:

- types/product.ts

Calcolo risparmio:

- lib/calculatePotentialSavings.ts


## 7. Regole di sviluppo

Preferire:

- codice semplice;
- funzioni piccole;
- nomi descrittivi;
- TypeScript tipizzato;
- componenti con una responsabilità chiara;
- Tailwind CSS;
- soluzioni facili da mantenere.

Evitare:

- file eccessivamente grandi;
- duplicazione di logica;
- business logic dispersa nei componenti;
- dipendenze inutili;
- over-engineering;
- implementazioni premature.


## 8. Mobile first

AFFARIO deve essere progettato mobile-first.

Ogni modifica dell'interfaccia deve funzionare correttamente almeno su:

- smartphone;
- desktop.

Non sacrificare l'usabilità mobile per miglioramenti desktop.


## 9. Ricerca prodotti — stato attuale

La demo frontend in components/DemoHome.tsx continua a utilizzare il catalogo demo:

data/products.ts

La ricerca della demo filtra per:

- titolo;
- marca;
- categoria.

Il catalogo demo è PROVVISORIO.

Non considerare data/products.ts un database di produzione.

Il backend reale dispone della ricerca locale AFFARIO sul catalogo Supabase:

GET /api/search/products?q=...

La lookup prodotto reale per ASIN è:

GET /api/products/[asin]

La futura sorgente dei prodotti potrà essere un database o un servizio/API esterno.

Non implementare integrazioni esterne se non richiesto.

Per lo stato architetturale corrente fare riferimento a:

docs/AFFARIO_PROJECT_STATE.md


## 10. Analisi prodotto

AnalysisCard mostra attualmente:

- prezzo attuale;
- minimo degli ultimi 90 giorni;
- Risparmio Potenziale;
- Affario Score;
- verdetto;
- Consiglio Affario;
- prezzo obiettivo Affario.

L'Affario Score presente nei dati attuali è ancora provvisorio.

Non inventare o sostituire autonomamente l'algoritmo definitivo dell'Affario Score.


## 11. Risparmio Potenziale

Regola attuale:

Il prezzo obiettivo parte dal prezzo minimo degli ultimi 90 giorni.

Margine prudenziale:

- minimo <= 100 € → +10%
- minimo da 101 € a 500 € → +5%
- minimo > 500 € → +3%

Il risultato viene arrotondato al multiplo di 5 € più vicino.

Risparmio Potenziale:

prezzo attuale - prezzo obiettivo Affario.

Se il risultato è minore o uguale a zero, non mostrare "0 €".

Mostrare:

"AFFARIO non prevede ribassi di prezzo nei prossimi 30 giorni."

Non mostrare all'utente il margine prudenziale.


## 12. Fasce Affario Score

Le fasce attuali sono:

- 80–100 → Ottimo momento per acquistare
- 65–79 → Buon prezzo
- 50–64 → Prezzo nella media
- 0–49 → Conviene aspettare

Non modificare queste fasce senza richiesta esplicita.


## 13. UX

AFFARIO deve interpretare i dati per l'utente.

Non costringere l'utente a interpretare statistiche complesse.

Per la V1:

- niente grafici dei prezzi;
- niente funzionalità decorative non necessarie;
- interfaccia semplice;
- messaggi comprensibili;
- priorità al verdetto e al consiglio.


## 14. Amazon

Il pulsante "Compra ora su Amazon" fa parte della V1.

Non implementare scraping di Amazon.

Non inventare prezzi o disponibilità reali.

Non implementare API Amazon o link di affiliazione reali finché non viene richiesto esplicitamente.


## 15. Documentazione

Prima di modificare decisioni importanti del prodotto, consultare quando necessario:

docs/PRODUCT_BIBLE.md
docs/PROJECT_RULES.md

Le decisioni documentate hanno precedenza sulle supposizioni.


## 16. Regola finale

Se una modifica non è necessaria per completare la funzione richiesta:

NON FARLA.

Se qualcosa funziona già:

NON RISCRIVERLO senza una ragione concreta.

Obiettivo: portare AFFARIO a una V1 realmente funzionante senza dispersione.
