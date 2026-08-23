# AFFARIO — Stato canonico del progetto

Ultimo aggiornamento: 23 agosto 2026.

## 1. Scopo e autorità

Questo documento è il punto di ingresso sintetico per ricostruire lo stato reale di AFFARIO: prodotto, architettura, decisioni, funzioni completate, vincoli, lavoro residuo e decisioni superate.

Ordine di precedenza:

1. repository e stato Git reali;
2. `AGENTS.md`;
3. `docs/PRODUCT_BIBLE.md` e `docs/PROJECT_RULES.md`;
4. questo riepilogo;
5. vecchie roadmap e note storiche.

Prima di iniziare qualsiasi nuova funzione:

- leggere questo documento;
- verificare branch, HEAD, working tree e divergenza da `origin/master`;
- lavorare su una sola funzione delimitata;
- non reinterpretare come mancanti funzioni già implementate.

## 2. Snapshot Git verificato

- Branch: `master`.
- Commit applicativo di partenza della Funzione 038: `4116061f8b357a5905f3c9a30dc0766b931777c2` — `feat: connect product search fallback API`.
- Ultima funzione completata: **FUNZIONE 038**, validata tecnicamente e funzionalmente in locale.
- La funzione successiva alla 038 non è ancora avviata.

Questo snapshot è storico: prima di agire verificare sempre Git, che ha precedenza.

## 3. Missione e confini della V1

AFFARIO risponde principalmente:

> È il momento giusto per comprare oppure conviene aspettare?

Principio operativo:

> DATI → ANALISI AFFARIO → COMPRA / ASPETTA

AFFARIO è una V1 consumer semplice e mobile-first. Non deve diventare un comparatore generico, un sito coupon o un portale di recensioni. Il valore principale è l'interpretazione: il **Consiglio AFFARIO** deve prevalere sulla mera esposizione di statistiche.

Obiettivo operativo: pubblicare una V1 funzionante il prima possibile e migliorarla progressivamente dopo il lancio. Evitare feature creep e implementazioni premature.

Per la V1:

- interfaccia comprensibile e mobile-first;
- priorità a verdetto e consiglio;
- niente grafici tecnici in stile Keepa;
- CTA Amazon solo dopo un'azione volontaria dell'utente;
- nessun dato inventato quando prezzo, offerta o attributo non sono disponibili.

## 4. Metodo di lavoro vincolante

Flusso ordinario di ogni funzione:

1. prompt delimitato;
2. lettura dei file interessati e comprensione del comportamento esistente;
3. implementazione di una sola funzione;
4. test proporzionati al rischio;
5. validazione dell'utente;
6. commit locale autorizzato;
7. push/checkpoint quando opportuno e autorizzato;
8. deploy solo quando opportuno e autorizzato.

Non modificare la progettazione di una funzione mentre è in corso, salvo bug bloccante, sicurezza, compliance o dipendenza indispensabile. Prima funziona, poi si ottimizza.

## 5. Stack e architettura

Stack attuale:

- Next.js, React, TypeScript e App Router;
- Tailwind CSS;
- Supabase;
- Brevo;
- Keepa;
- Git/GitHub;
- Vercel;
- futura Amazon Creators API.

Principio provider-agnostic:

> provider → adapter AFFARIO → modello/core AFFARIO → UI

Direzione futura dei ruoli:

- Amazon API: ricerca, catalogo e offerta corrente ufficiale;
- Keepa: soprattutto storico e intelligence di prezzo;
- AFFARIO: Score, consiglio, prezzo obiettivo e alert.

Il frontend e il core non devono dipendere da Product Object, array, token o parametri Keepa. Il cambio futuro del provider dei candidati non deve richiedere la riscrittura della parte superiore dell'app.

## 6. Stato reale dell'applicazione

### 6.1 Frontend

- In produzione `app/page.tsx` mostra `PublicHome`.
- In sviluppo `app/page.tsx` carica `DemoHome`.
- Dalla Funzione 038, `DemoHome` è collegata alla ricerca reale e segue il flusso approvato **query → famiglie consumer → variante → ASIN**.
- La UI presenta un titolo prodotto semplificato, ordina semanticamente le capacità e mostra gli attributi variante con etichette coerenti: `Color` come **Colore**, `Size` o capacità storage come **Capacità**, `Style` come **Configurazione**.
- La variante selezionata conserva internamente l'ASIN, ma non avvia ancora Buy Box, lookup prodotto o analisi.
- `PublicHome` resta invariata e le funzionalità reali non sono ancora collegate al flusso UI pubblico completo.
- L'Affario Score nei dati demo è provvisorio: non sostituire o inventare l'algoritmo definitivo.

### 6.2 Ricerca e ingresso prodotto reali

- Dalla Funzione 037, `GET /api/search/products?q=...` è collegato all'orchestratore local-first e restituisce soltanto il DTO pubblico AFFARIO.
- Il servizio locale è `searchAffarioProducts(query)`.
- L'orchestratore server-side `searchAffarioProductsWithFallback(query)` applica il flusso local-first: catalogo AFFARIO e, soltanto senza risultati locali, fallback al provider esterno.
- La ricerca normalizza e tokenizza, applica ranking leggibile e privilegia i risultati che soddisfano tutti i token significativi della query, senza riempire i risultati principali con match parziali quando esistono match completi.
- Il raggruppamento provider-agnostic produce famiglie consumer coerenti e ricompone una variante per ASIN con il proprio insieme di attributi.
- `parentAsin` resta un'informazione tecnica e non definisce necessariamente una singola famiglia consumer; `Style` può discriminare sotto-famiglie quando il parent Amazon comprende modelli commercialmente distinti.
- Validazione locale `dreame matrix`: Matrix10 Ultra e Matrix10 Pro restano nella stessa famiglia; L40s e L50s sono separati; X60 ed ECOVACS sono esclusi dai match completi.
- Validazione locale `iphone`: una sola famiglia con 9 varianti.
- Il flusso approvato è: **query → famiglie consumer → variante → ASIN**.
- L'utente non deve conoscere l'ASIN o il titolo Amazon completo.
- Una ricerca locale senza risultati restituisce `NO_LOCAL_MATCHES`; nell'orchestratore questo esito attiva il fallback provider esterno.
- Esiste un provider server-only per la ricerca keyword Keepa e la trasformazione dei Product Object in candidati AFFARIO provider-agnostic.
- Il provider Keepa serve esclusivamente alla scoperta di prodotti non presenti nel catalogo locale: è raggiungibile soltanto tramite l'orchestratore server-side e non dispone di un endpoint pubblico proprio.
- Il ranking esterno assegna forte priorità al match reale del brand, senza blacklist o brand hardcodati.
- `GET /api/products/[asin]` è il primo ingresso applicativo reale per un ASIN valido.
- La lookup pubblica restituisce un DTO AFFARIO sicuro, non raw Keepa.

### 6.3 Keepa e storage

- Client Keepa server-only operativo.
- Adapter Keepa → AFFARIO operativo.
- Metadata, varianti, statistiche 90 giorni, Buy Box e storico completo sono gestiti.
- Persistenza Supabase reale operativa.
- Cache Keepa server-side operativa con TTL di 60 minuti.
- Tabelle storage: `products`, `product_variants`, `buybox_price_history`, `keepa_snapshots`, `keepa_history_points`, `keepa_raw_latest`.
- RLS dello storage Keepa attiva; accesso applicativo tramite credenziali server-side.

### 6.4 Alert

Esistono già:

- creazione alert in Supabase;
- prevenzione degli alert duplicati esatti;
- email di conferma Brevo;
- token personale di gestione;
- pagina/route di gestione ed eliminazione sicura;
- archivio e analisi dello storico prezzi;
- modello `ProductFamily` / `ProductVariant` / `ProductOffer`;
- salvataggio della migliore offerta idonea per variante;
- motore decisionale alert;
- stato notifica intermedia;
- stato target;
- orchestratore delle azioni alert.

Non esistono ancora come flusso operativo completo:

- monitoraggio automatico reale;
- invio reale delle notifiche intermedie e target;
- scheduler.

## 7. Decisioni definitive da preservare

### 7.1 Prezzo e Buy Box

- Il prezzo corrente principale AFFARIO è la **Buy Box / Featured Offer dell'ASIN**.
- `NEW` e `AMAZON` non sono fallback automatici del prezzo principale.
- Se la Buy Box è assente, il prezzo/offerta è esplicitamente non disponibile; non mostrare `0 €` inventato.
- Un valore reale pari a zero, per esempio spedizione gratuita, resta distinto da dato assente.
- `lastBuyBoxUpdate` indica quando Keepa ha rilevato/aggiornato la Buy Box e alimenterà la UI “Prezzo rilevato alle HH:MM”.
- `lastKeepaCheckAt` è distinto da `lastBuyBoxUpdate`.

### 7.2 Cache Keepa

- TTL: **60 minuti**.
- Il TTL è governato da `keepa_snapshots.requested_at`, cioè dall'ultimo controllo reale eseguito da AFFARIO.
- `lastBuyBoxUpdate` non governa il TTL.
- Cache hit: zero chiamate Keepa e zero token.
- Se Keepa restituisce una Buy Box più vecchia del TTL, il nuovo `requested_at` rende comunque valida la cache; nessun secondo refresh immediato.
- Non esiste ancora un lock distribuito cross-instance.

### 7.3 Storico e normalizzazione

- La richiesta prodotto Keepa include lo storico.
- Il Product Object completo più recente, incluso lo storico ricevuto, è conservato in `keepa_raw_latest` e non è esposto al browser.
- La Buy Box history è normalizzata e deduplicata in `buybox_price_history`.
- `keepa_history_points` non viene popolata automaticamente.
- Normalizzare soltanto dati utili a query e logica AFFARIO; evitare copie indiscriminate del modello provider.

### 7.4 Alert e Amazon

- L'alert è legato alla variante/ASIN esatto, non al seller.
- Il seller può cambiare senza cambiare l'identità dell'alert.
- La CTA Amazon compare solo dopo una scelta volontaria dell'utente.
- Per i link futuri preferire URL Amazon diretti e ufficiali.
- Non fare scraping Amazon e non inventare disponibilità o link ufficiali non ancora integrati.

### 7.5 Decisioni prodotto numerate

- **Decisione/DD-001 — Risparmio Potenziale:** parte dal minimo degli ultimi 90 giorni con margine prudenziale già definito nella Product Bible; arrotondamento ai 5 €; se il risparmio è minore o uguale a zero mostrare il messaggio previsto, non `0 €`. Il margine non è mostrato all'utente.
- **Product Bible DD-002 — fasce Affario Score:** 80–100 ottimo momento; 65–79 buon prezzo; 50–64 prezzo nella media; 0–49 conviene aspettare.
- Il verdetto deriva dallo Score e non viene scritto manualmente.

#### Decisione operativa legacy 002 — Esperienza post-alert

Questa denominazione legacy **non coincide con `DD-002` della Product Bible** e non modifica né rinumera la Product Bible.

Alla conclusione o rimozione di un alert, AFFARIO deve poter chiedere:

> HAI ACQUISTATO?

Esiti concettuali:

- sì, su Amazon;
- sì, presso altro negozio;
- no, non mi interessa più;
- no, sto ancora aspettando.

Se l'utente dichiara di avere acquistato, AFFARIO potrà raccogliere:

- soddisfazione;
- intenzione di riacquisto;
- esperienza di consegna;
- utilità percepita di AFFARIO;
- commento libero.

Obiettivo: costruire nel tempo esperienze di acquisto verificate.

Distinzione di scope:

- esperienza verificata post-alert: prevista;
- recensioni pubbliche verificate: **post-V1**.

## 8. Registro delle funzioni documentate

Le associazioni seguenti derivano dalle specifiche approvate e dalla cronologia reale del repository. Non assegnare retroattivamente numeri alle funzioni non mappate.

| Funzione | Stato/capacità registrata |
|---|---|
| 008 | Conferma email alert tramite Brevo |
| 009 | Gestione ed eliminazione sicura dell'alert |
| 010 | Concetto di notifica intermedia |
| 011 | Storico prezzi |
| 012 | Analisi dello storico prezzi |
| 014 | Modello `ProductFamily` / `ProductVariant` / `ProductOffer` |
| 015 | Migliore offerta e storico per variante |
| 016 | Selezione guidata della variante nella demo |
| 017 | Motore decisionale alert |
| 018 | Stato della notifica intermedia |
| 019 | Stato della notifica target |
| 020 | Orchestratore alert |
| 021 | Sito pubblico per il percorso Amazon |
| 022 | Miglioramento homepage pubblica |
| 023 | Client prodotto Keepa server-only |
| 024 | Adapter Keepa → modello AFFARIO |
| 025 | Metadata e varianti reali |
| 026 | Statistiche di prezzo a 90 giorni |
| 027 | Buy Box / Featured Offer come prezzo corrente |
| 028 | Storico Keepa completo incluso |
| 029 | Schema di storage Keepa |
| 030 | Hardening e applicazione della migration storage |
| 031 | Persistenza reale del prodotto Keepa |
| 032 | Cache Keepa a 60 minuti — commit `1b8300e93796ca0657642f22b8bfa0b3693bfbd3` |
| 033 | API prodotto per ASIN — commit `1ade21f045b3c2ab7c92a600c1cecb436a46ee19` |
| 034 | Ricerca locale AFFARIO — commit `8e25dc28cb86009ccea4715e7b3dd19f5bb1cfe7` |
| 035 | Provider server-side per ricerca keyword Keepa — commit `1acda79b9aa7e95614cb7be316a43f55909c3d5b` |
| 036 | Ricerca local-first con fallback provider esterno — commit `b6778d87bc9de08958802cb7ed1256032d188df8` |
| 037 | API ricerca collegata all'orchestratore local-first, validata manualmente in locale |
| 038 | DemoHome collegata alla ricerca reale con selezione per famiglia consumer, variante e ASIN |

Totale associazioni registrate: **30**.

Le Funzioni 001–007 e 013 non sono associate qui a capability specifiche perché manca una mappatura canonica esplicita. La storia Git resta disponibile, ma non sostituisce una decisione di numerazione.

## 9. Dati operativi verificati

### 9.1 Keepa

- API Keepa attiva.
- Capacità: 20 token/minuto, bucket circa 1200 token.
- Richiesta prodotto corrente: `domain=8`, `stats=90`, `buybox=1`, storico incluso, nessun `offers`.
- Costo tipico di un refresh prodotto: 3 token.
- Cache reale verificata: primo refresh 3 token; richieste successive entro TTL 0 token.
- Provider ricerca keyword server-only operativo: `domain=8`, una singola richiesta Keepa, massimo 10 candidati AFFARIO conservati e nessun endpoint pubblico.
- Test reale `dreame matrix`: 1 chiamata Keepa, costo reale 10 token, 20 risultati Keepa ricevuti e 10 candidati AFFARIO conservati.
- Nei risultati del test è stato rilevato rumore: un accessorio e un prodotto concorrente. Il ranking AFFARIO esterno corregge questo rumore con forte priorità al match reale del brand e mantiene la famiglia Matrix10 Ultra/Pro come più rilevante.
- La ricerca keyword non accede a Supabase e non persiste prodotti, varianti, snapshot o risultati.

### 9.2 Catalogo e primo prodotto reale

- Supabase storage Keepa operativo.
- Primo ASIN reale: `B0FQGPJCJK`.
- Catalogo locale AFFARIO operativo.
- Ricerche verificate: `iphone`, `iphone 17`, `apple iphone 256`, ASIN esatto.
- La famiglia iPhone è raggruppata per parent ASIN e le righe attributo sono deduplicate in varianti complete.
- Nel test local-first, `iphone` è risolto dal catalogo AFFARIO con zero chiamate e zero token Keepa.
- Nel test di fallback, `dreame matrix` ha eseguito una ricerca Keepa per 10 token; la famiglia Matrix10 Ultra/Pro è risultata la più rilevante.
- Validazione manuale della Funzione 037:
  - `GET /api/search/products?q=iphone`: `AFFARIO_CATALOG`, `MATCHES_FOUND`, una famiglia e 9 varianti;
  - `GET /api/search/products?q=a`: `QUERY_TOO_SHORT`;
  - `GET /api/search/products?q=dreame%20matrix`: `EXTERNAL_PROVIDER`, `MATCHES_FOUND`, famiglia Matrix10 Ultra/Pro al primo posto, altri prodotti Dreame successivi, accessorio Homruich in fondo ed ECOVACS escluso; nessun `serverReport`, token o diagnostica interna esposti.

## 10. Uso futuro della capacità Keepa

### 10.1 Scheduler alert futuro

Direzione già stabilita, non ancora implementata:

- aggregare il lavoro per ASIN;
- un controllo deve servire tutti gli alert dello stesso ASIN;
- cache valida significa zero token;
- usare frequenza dinamica;
- distribuire nelle 24 ore la capacità Keepa, compresa la notte;
- controllare più frequentemente i prodotti vicini al target;
- evitare polling per singolo utente;
- progettare una protezione cross-instance prima di traffico elevato.

La deduplicazione definitiva distribuita non è implementata.

### 10.2 Decisione roadmap — prefetch/catalogo caldo futuro

Questa è una direzione futura e **non una funzione già implementata**.

Usare la capacità Keepa inutilizzata nelle ore di basso traffico per pre-popolare in modo selettivo il catalogo AFFARIO, partendo dalle cinque categorie V1:

- Smartphone;
- Gaming & Informatica;
- Audio & Wearable;
- Beauty & Cura persona;
- Pet & Cura animale.

Dare priorità a brand, modelli e prodotti ad alta probabilità di ricerca. Non effettuare crawling indiscriminato e mantenere sempre una riserva di token per richieste degli utenti e alert.

## 11. Compliance Keepa e Amazon

### 11.1 Keepa

Esiste conferma scritta del 18 agosto 2026: l'uso commerciale dei dati Keepa nell'app è consentito con il normale piano a pagamento; mostrare dati e insight nell'app non costituisce reselling. Il divieto principale riguarda rivendita o copia dell'API.

Questa nota non contiene email, indirizzi o dati personali.

### 11.2 Amazon

Esiste una richiesta scritta separata sull'uso di Keepa per storico, monitoraggio e alert nel sito affiliato. Amazon ha trasferito il caso al reparto tecnico; la risposta definitiva è ancora pendente.

Conseguenze:

- sviluppo locale delle integrazioni Keepa: consentito;
- pubblicazione su `affario.it` delle funzionalità reali Keepa/alert: gate da chiudere con risposta Amazon;
- l'autorizzazione Keepa non equivale all'autorizzazione Amazon.

## 12. Sicurezza e dati sensibili

- `.env.local` non deve mai essere tracciato.
- Segreti e credenziali devono restare server-side.
- Non usare `NEXT_PUBLIC_*` per chiavi o service role.
- `service_role` non deve mai raggiungere il browser.
- Non creare screenshot contenenti credenziali.
- RLS dello storage Keepa è attiva.
- Eseguire controllo segreti prima di ogni push.
- Non esporre raw Keepa, query SQL/PostgREST, stack trace o dettagli infrastrutturali nelle API pubbliche.
- Sicurezza e hardening sono obbligatori prima del go-live reale.

## 13. Necessario prima del go-live

La V1 pre-lancio deve restare stretta. Sono necessari:

1. chiudere il gate Amazon prima di pubblicare le funzionalità reali Keepa/alert su `affario.it`;
2. collegare il flusso UI pubblico alle API reali di ricerca e lookup, preservando famiglia → variante → ASIN;
3. collegare il motore AFFARIO ai dati reali senza inventare l'algoritmo definitivo dello Score;
4. rendere operativo il ciclo alert reale: monitoraggio, scheduler e invio intermedio/target;
5. garantire che ogni controllo sia aggregato per ASIN e rispetti cache/capacità Keepa;
6. completare hardening, verifica segreti, gestione errori e test mobile/desktop;
7. verificare CTA e URL Amazon ufficiali nel perimetro autorizzato;
8. eseguire deploy e smoke test soltanto con autorizzazione esplicita.

## 14. Backlog post-lancio

Questi elementi restano nel backlog e non diventano automaticamente requisiti pre-lancio:

- “Oggi AFFARIO consiglia”;
- elemento di fiducia;
- storico semplificato/trend, senza grafici tecnici Keepa;
- pagina risultati più ricca;
- area “I miei alert”;
- analytics personali;
- SEO;
- recensioni verificate post-V1;
- B2B e predittivo soltanto in futuro.

## 15. Superseded decisions

Le decisioni seguenti restano nella storia ma sono superate:

- **“Migliore offerta idonea generica” come prezzo corrente principale** → sostituita da Buy Box / Featured Offer dell'ASIN.
- **`history=0`** → rimosso nella Funzione 028; lo storico è incluso.
- **“Keepa non collegato”** → superato: client, adapter, persistenza, cache e API prodotto sono operativi.
- **Vecchia roadmap 023–028** → superata dallo sviluppo reale completato fino alla Funzione 038.

## 16. Questioni aperte e ambiguità

- Le Funzioni 001–007 non hanno una mappatura canonica certa: non inventarla.
- La Funzione 013 non ha una mappatura canonica certa: non inventarla.
- La formula definitiva dell'Affario Score deve ancora essere validata e definita sui dati reali; i valori demo restano provvisori.
- La risposta tecnica definitiva Amazon è pendente e blocca la pubblicazione delle funzionalità reali Keepa/alert.
- Lo scheduler alert reale è futuro e non implementato.
- Il lock distribuito della cache è futuro e va risolto prima di traffico elevato.

## 17. Prossimo passo

- Ultima funzione completata: **038**, validata tecnicamente e funzionalmente in locale.
- La funzione successiva alla 038 non è ancora avviata.

La Funzione 038 collega `DemoHome` alla ricerca reale fino alla selezione interna dell'ASIN; Buy Box, analisi, `PublicHome`, database, provider e deploy restano invariati.
