# AFFARIO — Stato canonico del progetto

Ultimo aggiornamento: 10 settembre 2026.

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
- Commit di partenza della Funzione 047A.1:
  `a871d4cccb85a2e8e94f2a4f33d16e5065ca0ab5`.
- Commit di implementazione della Funzione 047A.2:
  `57bc4d3f721aaa8e77048ea14428882a1431b8ef`.
- Commit Production verificato della Funzione 047A.2:
  `2b5783640bb2107e876065119b36db6a1126ed2f`.
- Commit di implementazione della Funzione 047A.3:
  `f7f786ce3af7e1dd82f48c5619f03866e2150d59`.
- Commit tecnico della Funzione 047B.2C1:
  `f867c7a62eb9a15c00cc5c2500f035bf60dc18c7`
  (`feat: add hybrid product search relevance`).
- Commit tecnico della Funzione 047B.2C2:
  `71b6deecd35366a82f4900a5b738dd45b8975d90`
  (`feat: add persistent product search cache`).
- Le Funzioni 047B.2C1 e 047B.2C2 sono validate localmente, nel runtime reale,
  sul database remoto e in Production. Il deployment automatico Vercel del
  commit `6e81680ae35a1aae1e76379ad1a59ee0c20d4f2a` è `SUCCESS / READY` e lo
  smoke Production del blocco è PASS.
- Ultima funzione completata prima della remediation: **FUNZIONE 046B2**,
  validata localmente e con migration remota applicata. Il job Cron resta
  inattivo e l'attivazione reale è rinviata al go-live.

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

- `app/page.tsx` rende `DemoHome` sia in produzione sia in sviluppo;
  `PublicHome` resta nel repository ma non è più la homepage pubblica.
- La produzione senza override usa **REVIEW** di default; lo sviluppo senza
  override usa **FULL**. `NEXT_PUBLIC_AFFARIO_PUBLIC_MODE=review|full` consente
  l'override esplicito.
- Dalla Funzione 038, `DemoHome` è collegata alla ricerca reale e segue il flusso approvato **query → famiglie consumer → variante → ASIN**.
- La UI presenta un titolo prodotto semplificato, ordina semanticamente le capacità e mostra gli attributi variante con etichette coerenti: `Color` come **Colore**, `Size` come **Capacità** soltanto per valori storage e altrimenti come **Taglia**, `Style` come **Configurazione**.
- La **FUNZIONE 047B.2A è CLOSED — IMPLEMENTED + AUTOMATED QA PASS + MANUAL QA PASS**: il selector mostra soltanto dimensioni con almeno due valori distinti nei candidati correnti, filtra esclusivamente sulle scelte espresse dall'utente e dichiara individuata una variante soltanto quando rimane un exact ASIN. Il conteggio consumer usa **varianti rilevate**, senza implicare completezza Amazon o disponibilità commerciale.
- La **FUNZIONE 047B.2B è CLOSED — IMPLEMENTED + AUTOMATED QA PASS + MANUAL QA PASS**: i titoli delle search card sono abbreviati esclusivamente a livello presentazionale e non incorporano suffissi che coincidono con valori variante variabili; gli attributi tecnici osservati `MemoryStorageCapacity` e `RamMemoryInstalledSize` usano le label consumer **Memoria** e **RAM**, con deduplicazione conservativa del riepilogo.
- La **FUNZIONE 047B.2C1 è CLOSED / PRODUCTION PASS**: 047B-009 e 047B-011 sono
  risolti; le query testuali generiche combinano catalogo locale e discovery
  provider, mentre exact ASIN locale e strong local identity possono evitare
  la Search esterna. Merge, deduplicazione e ranking restano deterministici e
  il risultato pubblico contiene al massimo 10 famiglie.
- La **FUNZIONE 047B.2C2 è CLOSED / PRODUCTION PASS**: le Search Keepa ripetute per la
  stessa query normalizzata sono protette da una cache distribuita persistente
  con TTL di 24 ore e stampede protection tramite le lease Postgres esistenti.
  Il contratto pubblico non espone HIT/MISS e resta invariato.
- Il finding **047B-003 è CLOSED / PASS**: il placeholder Search consumer usa
  la copy breve **“Cerca un prodotto”**, validata manualmente a 320 px e 390 px.
- Il finding **047B-008 è CLOSED / PASS**: le opzioni variante selezionate
  espongono un focus da tastiera chiaramente visibile, senza modificare il
  design normale o il comportamento del selector.
- La **FUNZIONE 039 è completata e validata** con il flusso **ricerca → famiglia consumer → variante esatta → Analizza il prezzo → `/api/products/[asin]` → Buy Box + storico 90 giorni**.
- La chiamata prodotto parte esclusivamente dall'azione esplicita **Analizza il prezzo**; una protezione single-flight impedisce doppie richieste concorrenti.
- La UI presenta la Buy Box / Featured Offer con l'etichetta consumer definitiva **Prezzo attuale su Amazon**, senza fallback `AMAZON` o `NEW`, e mantiene visibili minimo Buy Box 90 giorni, media Buy Box 90 giorni e `lastBuyBoxUpdate` formattato in `Europe/Rome`.
- Se la Buy Box è assente, la UI non mostra `0 €`; gli errori terminano il loading e consentono esclusivamente un retry volontario, senza retry automatici nascosti.
- La lookup esegue al massimo una seconda lettura iniziale DB read-only prima di Keepa; non esiste alcun retry automatico Keepa.
- La **FUNZIONE 040 è completata e validata**: il primo Consiglio AFFARIO reale è incluso nella stessa risposta prodotto e nella UI di analisi.
- La formula V1 usa la posizione della Buy Box attuale tra minimo e media Buy Box degli ultimi 90 giorni e produce un Affario Score deterministico da 0 a 100 con le fasce canoniche **Ottimo momento**, **Buon prezzo**, **Prezzo nella media** e **Conviene aspettare**.
- Con meno di 4 osservazioni valide o meno di 7 giorni di copertura, il consiglio espone **Storico ancora insufficiente** senza Score numerico né verdetto Compra/Aspetta.
- Le raccomandazioni operative tipizzate sono `BUY_NOW`, `BUY`, `NEUTRAL`, `WAIT` e `NONE`; la CTA Amazon resta indipendente dalla raccomandazione e usa il link affiliato dell'ASIN esatto analizzato.
- Il Consiglio AFFARIO entra con una micro-animazione discreta e finita, disabilitata quando il sistema richiede `prefers-reduced-motion`.
- La **FUNZIONE 041 è completata** con la gerarchia `LOWEST_12_MONTHS` → `LOWEST_SINCE_AVAILABLE` → `null`.
- `LOWEST_SINCE_AVAILABLE` è assegnato solo quando l'inizio dello storico utile è certificabile conservativamente tramite `trackingSince`, `listedSince`, coerenza raw/snapshot della stessa acquisizione, completezza della serie Buy Box normalizzata, assenza di troncamento e soglie minime di copertura e osservazioni.
- La prima riga AFFARIO e la data del primo lookup non costituiscono prova sufficiente dell'inizio dello storico.
- Le etichette consumer definitive sono **🏆 PREZZO PIÙ BASSO DEGLI ULTIMI 12 MESI** per `LOWEST_12_MONTHS` e **🏆 PREZZO PIÙ BASSO DI SEMPRE** per `LOWEST_SINCE_AVAILABLE`; la UI non usa la dicitura impropria **Minimo storico**.
- Gli highlight restano fatti sul prezzo e non modificano Affario Score, fascia, raccomandazione o CTA Amazon.
- Verifica reale: iPhone con circa 346,42 giorni, inizio certificabile e `LOWEST_SINCE_AVAILABLE`; Dreame con circa 166,52 giorni, inizio non certificabile e highlight `null`; zero chiamate Keepa aggiuntive.
- La **FUNZIONE 042 è completata**: la vecchia euristica `min90 + 10/5/3%` è definitivamente rimossa e l'unica formula canonica è **Prezzo Obiettivo AFFARIO = 25° percentile Buy Box degli ultimi 90 giorni ponderato per durata**.
- Il calcolo usa la durata temporale dei prezzi, non il numero di record, e ricostruisce lo stato Buy Box al cutoff dei 90 giorni; i periodi `UNAVAILABLE` restano nella timeline ma sono esclusi dalla distribuzione dei prezzi.
- La qualità minima richiede stato al cutoff disponibile, serie non troncata, almeno 4 osservazioni valide, almeno 7 giorni di copertura e almeno 7 giorni complessivi con Buy Box valida.
- Il target è arrotondato ai 5 € soltanto dopo il calcolo statistico; il Risparmio Potenziale è `current − target` solo se positivo, mentre `current <= target` produce `NOT_APPLICABLE` senza mostrare `0 €` o un target consumer.
- Prezzo Obiettivo e Risparmio Potenziale non sono previsioni temporali né promesse di raggiungimento e restano indipendenti da Affario Score, recommendation, price highlight e CTA Amazon.
- Verifica reale: iPhone `B0FQGPJCJK` con current 1.159 €, weighted Q25 1.245 €, `NOT_APPLICABLE` e `BUY_NOW`; Dreame Matrix10 Ultra `B0GKP9H2W1` con current 799 €, weighted Q25 799 €, target 800 €, `NOT_APPLICABLE` e `BUY_NOW`.
- Il catalogo reale verificato contiene 2 prodotti e nessun caso `AVAILABLE`; il comportamento positivo è validato con test sintetici senza creare dati artificiali né effettuare chiamate Keepa aggiuntive.
- Backtesting storico, confronto Q20/Q25/Q30, varianti per categoria, probabilità o tempi di raggiungimento e ponderazione per recenza restano evoluzioni future esplicitamente fuori scope dalla Funzione 042.
- La validazione manuale finale della UI è completata.
- La **FUNZIONE 043 è COMPLETATA**: l'alert reale è collegato all'exact ASIN e
  usa come target il Prezzo Obiettivo AFFARIO calcolato dalla pipeline
  server-side; il client invia soltanto ASIN ed email.
- Il flusso alert resta email-only: lo stato iniziale è
  `pending_confirmation`, Brevo invia l'email con il link personale, il GET
  `/alert/[token]` è read-only e soltanto il POST esplicito di conferma porta
  l'alert ad `active`.
- La **FUNZIONE 044 è COMPLETATA**: il monitoraggio ordinario considera
  esclusivamente alert `active`, aggregati obbligatoriamente per exact ASIN;
  una verifica prodotto serve tutti gli alert dello stesso ASIN.
- Le frequenze originarie della Funzione 044 sono superate dalla calibrazione
  conservativa V1 della Funzione 045: oltre il 15% → 24h, oltre l'8% e fino al
  15% → 12h, oltre il 3% e fino all'8% → 6h, fino al 3% incluso → 2h. I boundary
  canonici sono 15% → 12h, 8% → 6h e 3% → 2h. L'intervallo del gruppo è la
  frequenza più breve richiesta da uno degli alert e l'ultimo controllo deriva
  da `keepa_snapshots.requested_at`.
- Il target scatta con `currentPrice <= targetPrice`; il lifecycle è
  `pending_confirmation` → `active` → `notifying_target` → `target_notified`.
  `target_notified` è lo stato finale operativo ed è escluso dai run
  successivi, senza cancellazione automatica del record storico.
- L'email target è one-shot. La claim è atomica con lease di 60 minuti; una
  claim stale viene recuperata tramite verifica provider, senza reinvio cieco
  quando lo stato provider è incerto. La chiave di idempotenza Brevo è stabile
  per alert ed evento target.
- `target_reached_at` conserva write-once la prima rilevazione economica del
  raggiungimento target e `target_reached_price` la Buy Box rilevata in quel
  momento; `notified_at` resta separato dall'evento economico. Questi outcome
  sono dati proprietari AFFARIO destinati al futuro backtesting.
- La **FUNZIONE 045 è COMPLETATA**: lo scheduler scelto è un unico Supabase Cron
  orario (`pg_cron` → `pg_net`) che richiama il `POST` interno protetto
  `/api/internal/price-alert-monitoring`; le frequenze dinamiche 2h/6h/12h/24h
  restano responsabilità del motore e non vengono replicate in più cron.
- L'endpoint usa il secret server-only dedicato
  `ALERT_MONITORING_CRON_SECRET`; `ALERT_MONITORING_ENABLED` abilita il motore
  soltanto con il valore esatto `true` ed è locale su `false`. La migration
  applicata ha creato il job `affario-price-alert-monitoring-hourly` inattivo,
  senza URL o credenziali incorporati. I secret Vault di produzione non sono
  configurati; configurazione Vercel e attivazione restano attività esplicite
  del go-live.
- Il batch iniziale resta configurabile con default massimo 5 exact ASIN per
  run. Le richieste Keepa `interactive` hanno priorità sul contesto interno
  `background_alert`: solo il background è soggetto alla riserva configurabile
  `KEEPA_BACKGROUND_TOKEN_RESERVE`, con default V1 di 120 token. Sul piano
  corrente da 20 token/minuto equivale a circa 6 minuti di refill e al 10% del
  bucket teorico massimo di 1.200 token, proteggendo il traffico utente.
- La **FUNZIONE 047A.2 è completata e verificata in Production**: il finding
  047A-003 è corretto e la selezione degli snapshot per lo scheduling usa una
  sola RPC batch, invece di una query sequenziale per ogni ASIN. Il deploy
  Production è `Ready` e lo smoke test è 5/5 PASS. Monitoring e Cron restano
  inattivi.
- La **FUNZIONE 047A.3 è implementata e validata localmente**: il finding
  047A-006 è risolto a livello repository mediante una baseline separata per
  database Supabase nuovi e vuoti, eseguita prima della migration chain. Il
  recovery rehearsal integrale su database disposable resta **OPEN
  PRE-GO-LIVE**.
- La telemetria del bucket è acquisita passivamente da ogni risposta Keepa,
  incluse le risposte non-200/429, e predisposta in uno stato persistente
  aggregato server-only. Richieste interattive e background hanno contatori 429
  separati; nessuna query, email, ASIN, chiave o payload raw viene conservato.
- In assenza di telemetria è consentita atomicamente una sola richiesta
  background di bootstrap alla volta. Un tentativo concluso senza osservazione
  resta fail-closed, mentre un lease rimasto stale dopo un crash può essere
  recuperato soltanto dopo la scadenza. In presenza di telemetria, la stima
  conservativa parte dall'ultima osservazione, aggiunge il primo refill solo
  allo scadere di `refillIn` e poi uno ogni 60 secondi; la riduzione di flusso
  viene arrotondata e sottratta a `refillRate` secondo la semantica Keepa. La
  stima non supera il bucket teorico e consente il vero HTTP background solo se
  il saldo stimato dopo il costo specifico della richiesta resta almeno pari
  alla riserva. Sotto
  riserva o con stato non verificabile il refresh viene saltato senza impedire
  letture DB, cache hit o valutazioni locali; un 429 background interrompe i
  refresh successivi del run. Una failure nella persistenza della telemetria non
  rompe la risposta `interactive`, mentre il background resta fail-closed. Il
  report distingue ASIN non dovuti, rinviati per limite del run, fermati dalla
  riserva e run interrotti da rate limit tramite
  `backgroundDeferredForRunLimit` e le metriche dedicate. La migration runtime
  è applicata; una migration correttiva limita `service_role` ai soli permessi
  `SELECT`, `INSERT` e `UPDATE` previsti.
- L'invio reale della notifica intermedia resta fuori scope.
- `PublicHome` resta invariata nel repository. Il flusso UI reale è pubblico in
  modalità prudenziale **REVIEW**; AFFARIO non è ancora **FULL LIVE**.
- L'Affario Score nei dati demo è provvisorio: non sostituire o inventare l'algoritmo definitivo.

### 6.2 Ricerca e ingresso prodotto reali

- Dalla Funzione 037, `GET /api/search/products?q=...` è collegato all'orchestratore local-first e restituisce soltanto il DTO pubblico AFFARIO.
- Il servizio locale è `searchAffarioProducts(query)`.
- L'orchestratore server-side `searchAffarioProductsWithFallback(query)`
  applica il flusso local-first con espansione provider selettiva: exact ASIN
  locale e strong local identity possono restare local-only; una query
  testuale generica combina invece catalogo AFFARIO e discovery provider.
- La ricerca normalizza e tokenizza, applica ranking leggibile e privilegia i risultati che soddisfano tutti i token significativi della query, senza riempire i risultati principali con match parziali quando esistono match completi.
- Il catalogo locale e `EXTERNAL_PROVIDER` condividono la stessa regola provider-agnostic di costruzione delle famiglie consumer e ricompongono ogni variante con il proprio ASIN e insieme di attributi.
- `parentAsin` resta un'informazione tecnica e non definisce necessariamente una singola famiglia consumer; `Style` può discriminare sotto-famiglie quando il parent Amazon comprende modelli commercialmente distinti.
- Validazione reale del catalogo persistito: `dreame matrix` → `AFFARIO_CATALOG` → una famiglia consumer con Matrix10 Pro e Matrix10 Ultra.
- Validazione locale `iphone`: una sola famiglia con 9 varianti.
- Il flusso approvato è: **query → famiglie consumer → variante → ASIN**.
- L'utente non deve conoscere l'ASIN o il titolo Amazon completo.
- La selezione di un prodotto esterno non ancora persistito passa attraverso la pipeline esistente di lookup e persistenza.
- Una ricerca locale senza risultati restituisce `NO_LOCAL_MATCHES`; questo
  esito attiva il provider esterno, che può essere usato anche per completare
  query generiche con risultati locali.
- Esiste un provider server-only per la ricerca keyword Keepa e la trasformazione dei Product Object in candidati AFFARIO provider-agnostic.
- Il provider Keepa serve alla scoperta e al completamento dei candidati non
  presenti nel catalogo locale: è raggiungibile soltanto tramite
  l'orchestratore server-side e non dispone di un endpoint pubblico proprio.
- Una singola Search provider può fornire fino a 20 Product Object da valutare
  prima di grouping e ranking. Il merge elimina duplicati per `familyId` e
  overlap ASIN, con precedenza ai risultati locali, e restituisce al massimo
  10 famiglie. Il source pubblico resta `AFFARIO_CATALOG`, `KEEPA` o `HYBRID`.
- La query cache persistente salva soltanto l'hash SHA-256 della query
  normalizzata e i candidati provider normalizzati. Non salva la query raw né
  il risultato finale local+provider; un cache hit non chiama Keepa e non
  introduce Product lookup.
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

Sono implementati ma intenzionalmente inattivi fino al go-live autorizzato:

- motore di monitoraggio automatico e relativo endpoint interno;
- scheduler Supabase Cron, installato con `active=false`;
- invio one-shot dell'email target con idempotenza e recovery provider.

Non è ancora implementato l'invio reale delle notifiche intermedie.

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
- Il monitoring e il refresh Keepa per exact ASIN usano lease Postgres
  distribuite e recuperabili dopo scadenza; una cache hit fresca non consuma
  RPC di lock.

### 7.3 Storico e normalizzazione

- La richiesta prodotto Keepa include lo storico.
- Il Product Object completo più recente, incluso lo storico ricevuto, è conservato in `keepa_raw_latest` e non è esposto al browser.
- La Buy Box history è normalizzata e deduplicata in `buybox_price_history`.
- `keepa_history_points` non viene popolata automaticamente.
- Normalizzare soltanto dati utili a query e logica AFFARIO; evitare copie indiscriminate del modello provider.

### 7.4 Alert e Amazon

- L'alert è legato alla variante/ASIN esatto, non al seller.
- Il seller può cambiare senza cambiare l'identità dell'alert.
- La deduplicazione V1 usa l'indice UNIQUE corrente
  `(product_id, email, target_price)`: se il Prezzo Obiettivo AFFARIO cambia, lo
  stesso utente può quindi avere un alert distinto sullo stesso ASIN con target
  differente. Questo comportamento resta intenzionale nella V1.
- Un duplicato `pending_confirmation` può richiedere nuovamente la conferma
  dopo un cooldown di 15 minuti: il record resta unico, il token viene ruotato,
  il vecchio link diventa invalido e `confirmation_requested_at` registra
  l'ultima richiesta/rotazione del link. `created_at` resta immutabile e indica
  esclusivamente la creazione originaria dell'alert. Gli alert `active` non
  vengono modificati dal resend.
- Il token raw non viene mai persistito: nel database resta soltanto il relativo
  hash SHA-256.
- Gli alert `pending_confirmation` sono esclusi dalle notifiche intermedie e
  target. La notifica target è one-shot; il raggiungimento del target chiude il
  ciclo operativo tramite lo stato di notifica, ma non cancella il record
  storico.
- La conferma riguarda esclusivamente l'alert richiesto: non costituisce double
  opt-in per marketing o newsletter.
- La CTA Amazon compare solo dopo una scelta volontaria dell'utente.
- Per i link futuri preferire URL Amazon diretti e ufficiali.
- Non fare scraping Amazon e non inventare disponibilità o link ufficiali non ancora integrati.

### 7.5 Decisioni prodotto numerate

- **Decisione/DD-001 — Risparmio Potenziale:** nella pipeline reale V1 il Prezzo Obiettivo AFFARIO è il 25° percentile Buy Box degli ultimi 90 giorni ponderato per durata; la precedente euristica minimo + margine 10/5/3% è superata. Il Risparmio Potenziale è `current − target` solo se positivo e gli importi consumer sono arrotondati ai 5 €.
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
| 039 | Completata e validata — variante esatta collegata su azione esplicita a Buy Box e storico 90 giorni reali |
| 040 | Completata e validata — primo Consiglio AFFARIO reale, raccomandazione operativa e CTA Amazon per la variante esatta |
| 041 | Completata — highlight coverage-aware per minimo 12 mesi e minimo certificabile da quando disponibile |
| 042 | Completata — Prezzo Obiettivo AFFARIO come Q25 Buy Box 90 giorni ponderato per durata e Risparmio Potenziale positivo |
| 043 | **COMPLETATA** — alert reale email-only sull'exact ASIN con target server-side, stato iniziale `pending_confirmation` e conferma POST esplicita prima dello stato `active`; scheduler/motore automatico fuori scope |
| 044 | **COMPLETATA** — motore target provider-agnostic aggregato per exact ASIN, ciclo `active` → `notifying_target` → `target_notified`, claim atomica recuperabile, idempotenza provider e outcome write-once `target_reached_at`/`target_reached_price`; record storico conservato, scheduler/cron concreto e intermediate reale fuori scope |
| 045 | **COMPLETATA** — endpoint POST interno protetto e kill switch fail-closed; Supabase Cron orario applicato ma inattivo; frequenze effettive 24h/12h/6h/2h, massimo 5 ASIN/run configurabile, fairness, priorità Keepa interactive, riserva background configurabile con default 120, telemetria bucket passiva, 429 distinti, background fail-closed, bootstrap/lease recuperabili e `backgroundDeferredForRunLimit` |
| 046B1 | **COMPLETATA** — rate limit distribuito HMAC multi-quota e hardening RLS/ACL di `price_alerts` |
| 046B2 | **COMPLETATA** — lease distribuite per monitoring e refresh exact ASIN, timeout Keepa e hard cap batch |
| 047A.1 | **IMPLEMENTAZIONE TECNICA COMPLETATA / GATE ESTERNO APERTO** — remediation mirata dei finding security, compliance, timeout, script npm e documentazione; migration dei default ACL di `postgres` applicata e verificata, gate `supabase_admin` aperto pre-go-live |
| 047A.2 | **COMPLETATA E VERIFICATA IN PRODUCTION** — finding 047A-003 corretto con scheduling snapshot batch tramite RPC POST server-only; migration e RPC applicate e allineate, deploy `Ready`, smoke Production 5/5 PASS; monitoring e Cron restano inattivi |
| 047A.4 / 047A.4B | **DECISIONE QA REGISTRATA** — 047A-010 chiuso/non applicabile; 047A-013 confermato e rinviato post-go-live/V1.1 con design indicizzato definito ma non implementato |
| 047A.5 | **COMPLETATA E VALIDATA LOCALMENTE + MANUAL QA PASS** — 047A-014/015/016 chiusi; titoli alert user-facing abbreviati, copy 429/503 uniformate, affiliate footer rifinito e preview protette in Production |
| 047B.2A | **CLOSED — IMPLEMENTED + AUTOMATED QA PASS + MANUAL QA PASS** — integrità del variant selector ripristinata; dimensioni singleton non obbligatorie, selezione solo esplicita, exact ASIN preservato e copy “varianti rilevate” |
| 047B.2B | **CLOSED — IMPLEMENTED + AUTOMATED QA PASS + MANUAL QA PASS** — 047B-005/006 chiusi; titoli famiglia compatti nelle search card, mapping consumer Memoria/RAM e deduplicazione conservativa degli attributi |
| 047B.2C1 | **CLOSED / PRODUCTION PASS** — 047B-009/011 chiusi; ricerca ibrida local+provider, strong identity relevance, merge/dedup deterministici e massimo 10 famiglie |
| 047B.2C2 | **CLOSED / PRODUCTION PASS** — cache persistente distribuita delle query Search, TTL 24 ore, SHA-256 della query normalizzata, lease anti-stampede e runtime MISS→HIT verificato in Production |

Totale associazioni registrate: **47**.

Le Funzioni 001–007 e 013 non sono associate qui a capability specifiche perché manca una mappatura canonica esplicita. La storia Git resta disponibile, ma non sostituisce una decisione di numerazione.

## 9. Dati operativi verificati

### 9.1 Keepa

- API Keepa attiva.
- Capacità: 20 token/minuto, bucket circa 1200 token.
- Richiesta prodotto corrente: `domain=8`, `stats=90`, `buybox=1`, storico incluso, nessun `offers`.
- Costo tipico di un refresh prodotto: 3 token.
- Cache reale verificata: primo refresh 3 token; richieste successive entro TTL 0 token.
- La Funzione 045 acquisisce passivamente da ogni risposta i campi aggregati
  `tokensLeft`, `tokensConsumed`, `refillRate`, `refillIn` e
  `tokenFlowReduction`; `tokensLeft` può essere negativo. Non viene eseguita
  alcuna richiesta dedicata alla telemetria.
- È applicato uno stato runtime server-only che conserva
  l'ultima osservazione valida per `observed_at` e incrementa atomicamente i
  contatori 429 `interactive` e `background_alert`. Una risposta più vecchia
  non può sovrascrivere un bucket osservato più recentemente. Lo stato iniziale
  è vuoto e verrà popolato soltanto passivamente da future richieste reali.
- Provider ricerca keyword server-only operativo: `domain=8`, una singola
  richiesta Keepa, fino a 20 Product Object provider valutati prima di
  grouping/ranking, massimo 10 famiglie finali e nessun endpoint pubblico.
- Test reale `dreame matrix`: 1 chiamata Keepa, costo reale 10 token, 20 risultati Keepa ricevuti e 10 candidati AFFARIO conservati.
- Nei risultati del test è stato rilevato rumore: un accessorio e un prodotto concorrente. Il ranking AFFARIO esterno corregge questo rumore con forte priorità al match reale del brand e mantiene la famiglia Matrix10 Ultra/Pro come più rilevante.
- La ricerca keyword non persiste in Supabase prodotti, varianti o snapshot.
  La cache `public.product_search_query_cache` conserva per 24 ore soltanto
  l'hash SHA-256 della query normalizzata e i candidati provider normalizzati:
  non conserva la query raw, Product Object Keepa raw, prezzi, storico, token,
  header, `serverReport` o il risultato finale local+provider. Quando la Search
  raggiunge Keepa, aggiorna inoltre la sola telemetria runtime aggregata
  server-side, priva di PII, condivisa con le altre chiamate al provider.
- Runtime QA reale della query `friggitrice ad aria doppio cestello 9 litri per
  famiglia grande`: prima richiesta MISS, una Keepa Search da 10 token, cache
  write PASS e 10 famiglie finali; seconda richiesta identica HIT, zero nuove
  Search, telemetria invariata e payload pubblico identico.

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

### 10.1 Motore alert aggregato e scheduler preparato

La Funzione 044 ha completato la parte provider-agnostic del motore:

- monitorare ordinariamente soltanto gli alert `active`;
- aggregare obbligatoriamente il lavoro per exact ASIN: un controllo prodotto
  serve tutti gli alert dello stesso ASIN;
- cache valida significa zero token;
- usare le frequenze dinamiche V1 calibrate nella Funzione 045: oltre 15% →
  24h, oltre 8% e fino a 15% → 12h, oltre 3% e fino a 8% → 6h, fino a 3%
  incluso → 2h, applicando al gruppo
  l'intervallo più breve richiesto e basando l'ultimo controllo su
  `keepa_snapshots.requested_at`;
- considerare raggiunto il target quando `currentPrice <= targetPrice`;
- conservare write-once `target_reached_at` e `target_reached_price` come
  prima rilevazione economica e Buy Box di quel momento, distinte da
  `notified_at`, come dati proprietari AFFARIO per il futuro backtesting;
- usare il lifecycle `pending_confirmation` → `active` → `notifying_target` →
  `target_notified`, con claim atomica, lease di 60 minuti e recupero stale
  tramite verifica provider;
- usare una chiave di idempotenza Brevo stabile per alert ed evento target e
  non reinviare alla cieca quando lo stato provider è incerto;
- inviare l'email target una sola volta senza cancellare il record storico,
  che nello stato `target_notified` non viene più monitorato;
- evitare polling per singolo utente;
- mantenere provider-agnostic la logica richiamabile.

La Funzione 045 ha completato il collegamento operativo mediante un solo
Supabase Cron orario. Il cron è predisposto per richiamare via `pg_net`
l'endpoint POST interno
protetto, mentre il motore conserva le frequenze dinamiche 2h/6h/12h/24h e un
limite prudente di 5 exact ASIN per run. Le frequenze originarie 044 sono
superate: l'unica configurazione operativa è 24h/12h/6h/2h. La migration Cron è
applicata e il job `affario-price-alert-monitoring-hourly` resta `active=false`;
URL e secret verranno letti da Vault soltanto dopo la configurazione di
produzione. `ALERT_MONITORING_ENABLED=false`, il kill switch resta fail-closed e
l'attivazione è rinviata al go-live esplicitamente autorizzato. L'invio reale
degli alert intermedi non è implementato. Le migration runtime applicate
preparano lo stato Keepa aggregato: priorità `interactive` sul background,
riserva V1 configurabile con default 120 token,
lease atomico cross-instance, bootstrap singolo recuperabile dopo lease stale,
telemetria passiva e contatori 429 separati. L'ordinamento dei gruppi usa prima
gli ASIN mai controllati, poi il `dueAt` più vecchio e infine l'exact ASIN come
tie-break; `backgroundDeferredForRunLimit` resta distinto da riserva, rate limit
e gruppi non ancora dovuti.

La Funzione 047A.2 ha sostituito le `N` letture sequenziali degli snapshot
necessarie allo scheduling con una singola chiamata batch alla RPC
`public.affario_price_alert_latest_product_checks(text[])`: Supabase usa un
`POST` con l'array degli ASIN nel body, senza lista `.in(...)` serializzata
nell'URL. La RPC sceglie indipendentemente l'ultimo snapshot di ogni ASIN con
`DISTINCT ON (asin)` e `ORDER BY asin, requested_at DESC`; il numero di richieste
snapshot della fase di selezione è quindi O(1). Default 5, hard cap 10,
frequenze, ordinamento, lease, idempotenza e priorità interactive restano
invariati.

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
- Il contatto mostrato nella pagina Privacy è configurato server-side tramite
  `PRIVACY_CONTACT_EMAIL`; non deve essere hardcoded nei file tracciati.
- `service_role` non deve mai raggiungere il browser.
- Non creare screenshot contenenti credenziali.
- RLS dello storage Keepa è attiva.
- Eseguire controllo segreti prima di ogni push.
- Non esporre raw Keepa, query SQL/PostgREST, stack trace o dettagli infrastrutturali nelle API pubbliche.
- Sicurezza e hardening sono obbligatori prima del go-live reale.

### 12.1 Production environment checklist

| Variabile | Ruolo |
|---|---|
| `NODE_ENV` | Selezione della modalità runtime e dell'esperienza pubblica Production. |
| `PRIVACY_CONTACT_EMAIL` | Contatto mostrato nell'informativa Privacy, validato server-side. |
| `SUPABASE_URL` | Endpoint server-side del progetto Supabase. |
| `SUPABASE_SECRET_KEY` | Credenziale server-only per storage, catalogo e alert. |
| `ABUSE_RATE_LIMIT_HMAC_SECRET` | Secret server-only dedicato alla pseudonimizzazione HMAC degli identificatori anti-abuso. |
| `BREVO_API_KEY` | Credenziale server-only per le email transazionali degli alert. |
| `KEEPA_API_KEY` | Credenziale server-only per ricerca, lookup e storico Keepa. |
| `ALERT_MONITORING_CRON_SECRET` | Bearer secret dedicato all'endpoint interno di monitoraggio. |
| `ALERT_MONITORING_ENABLED` | Kill switch fail-closed del monitoraggio automatico. |
| `ALERT_MONITORING_MAX_ASINS_PER_RUN` | Limite prudente degli exact ASIN elaborati in un run. |
| `KEEPA_BACKGROUND_TOKEN_RESERVE` | Riserva Keepa conservata per il traffico interattivo. |

`PRIVACY_CONTACT_EMAIL` è configurata in Production e il deployment Vercel
dell'ultimo `master` è tornato verde (`Ready`). Nessun indirizzo personale è registrato
nel repository.

### 12.2 FUNZIONE 046B1 COMPLETATA

- Le API pubbliche usano un rate limiting fixed-window condiviso tramite
  Postgres, con una sola riga aggregata per `scope + subject_hash` e consumo
  multi-quota atomico tramite una sola RPC `SECURITY INVOKER` per richiesta
  HTTP; tutte le quote del batch vengono consumate, `allowed` richiede che
  siano tutte entro soglia e un diniego usa il massimo `Retry-After` necessario.
- IP client, email normalizzata e token management vengono trasformati
  immediatamente con HMAC-SHA256 e domini distinti; la tabella anti-abuso non
  conserva IP, email, token o altri payload raw.
- Le policy V1 sono: ricerca 20/5 minuti per client, prodotto 30/10 minuti per
  client, creazione alert 10/60 minuti per client e 5/60 minuti per email,
  conferma/gestione 20/5 minuti per client e 10/5 minuti per token.
- Un rate limit superato restituisce `429` con `Retry-After`; secret HMAC,
  identità client o store non disponibili producono `503` fail-closed prima di
  lookup, Keepa, scritture alert o Brevo.
- L'audit SQL remoto read-only di `public.price_alerts` è completato: owner
  `postgres`, RLS attiva senza FORCE RLS, zero policy, zero trigger, zero view
  dipendenti e zero funzioni rilevanti. `PUBLIC` non ha privilegi, mentre
  le ACL inizialmente ampie di `anon`, `authenticated` e `service_role` sono
  state ristrette dalla migration B1 senza modificare dati, colonne o indici:
  accesso diretto rimosso a `anon`/`authenticated` e soli privilegi
  `SELECT`, `INSERT`, `UPDATE`, `DELETE` a `service_role`.
- L'audit aveva rilevato default privileges permissivi nello schema `public`
  per oggetti futuri creati da `postgres` e `supabase_admin`. La sessione usata
  dal normale workflow migration remoto opera con `current_user = postgres` e
  `session_user = postgres`: il ruolo non è superuser, ha `CREATEROLE`, ma non è
  membro di `supabase_admin`, non ha `USAGE` sul ruolo e non può eseguire
  `SET ROLE supabase_admin`. Di conseguenza la migration
  `20260906000000_harden_public_default_privileges.sql` gestisce soltanto i
  default ACL del creator role `postgres`: revoca ad `anon`/`authenticated` i
  privilegi sulle future tables, sequences e functions e revoca a `PUBLIC`
  quelli sulle future functions. La migration è stata applicata manualmente
  con successo nel Supabase SQL Editor e non modifica ACL di oggetti esistenti.
  L'audit remoto successivo ha verificato l'assenza dei default ACL da
  `postgres` verso `anon` e `authenticated` per tutti e tre i tipi di oggetto e
  l'assenza di `EXECUTE` a `PUBLIC` sulle future functions; i privilegi di
  `service_role` e del creator `postgres` sono rimasti invariati. La history è
  stata riallineata con Supabase CLI tramite
  `npx supabase@latest migration repair 20260906000000 --status applied`; la
  verifica finale `npx supabase@latest migration list` mostra Local = Remote
  per tutte le migration fino a `20260906000000`. La componente `postgres` del
  finding 047A-004 è quindi **IMPLEMENTATA / APPLICATA REMOTAMENTE /
  VERIFICATA**. I default ACL del creator role `supabase_admin` sono rimasti
  invariati e permissivi: non sono modificabili dal normale ruolo migration e
  restano un gate pre-go-live separato, da chiudere tramite un percorso
  Supabase autorizzato. Il finding complessivo resta **PARTIAL / OPEN GATE** per
  questa sola componente residua.
- Le due migration B1 sono applicate e allineate nella history remota: stato/RPC
  del rate limiter e hardening RLS/privilegi di `price_alerts`. Il dry-run
  successivo è pulito, le 6 righe alert sono invariate e la tabella anti-abuso
  parte vuota.
- Mutex del monitoring e lock refresh exact ASIN/cache stampede restano fuori
  scope e sono rinviati alla FUNZIONE 046B2.

### 12.3 FUNZIONE 046B2 COMPLETATA

- La concorrenza distribuita usa lease Postgres in
  `public.distributed_leases`; le lease scadute sono recuperabili atomicamente
  dopo un crash e non viene introdotto Redis.
- Il monitoring globale usa una lease di 360 secondi; il refresh Keepa per exact
  ASIN usa una lease di 60 secondi.
- Ogni chiamata HTTP Keepa ha un timeout bounded di 30 secondi. Una cache hit
  fresca usa zero RPC di lock e nessun lock o transazione database resta aperto
  durante la chiamata al provider.
- In caso di contesa il background esegue uno skip; il flusso interactive attende
  al massimo 250 ms e svolge una sola rilettura della cache.
- Il batch conserva il default di 5 exact ASIN e applica un hard cap assoluto di
  10 exact ASIN per run.
- La migration `20260904000000_create_distributed_leases.sql` è applicata e
  allineata nella history remota; tabella e RPC restano accessibili soltanto al
  ruolo server `service_role` con i privilegi minimi previsti.

### 12.4 FUNZIONE 047A.1 — IMPLEMENTAZIONE TECNICA COMPLETATA / GATE ESTERNO APERTO

- Il GET della pagina personale di gestione riusa le policy distribuite B1:
  20 richieste ogni 5 minuti per client e 10 ogni 5 minuti per token, consumate
  insieme con una sola RPC. Token e IP restano pseudonimizzati con HMAC e domini
  distinti; in Production l'assenza di identità o store produce un esito
  consumer-safe fail-closed prima della lettura alert.
- Le chiamate Brevo di invio e recovery usano un timeout nativo bounded di 10
  secondi. I timeout restano esiti ambigui recuperabili e sono distinti dalle
  risposte HTTP del provider, senza cambiare idempotenza o lifecycle.
- L'email target include disclosure Amazon e link Privacy in HTML e plain
  text. La Privacy descrive conferma, target, lifecycle e conservazione reali.
- Sono disponibili gli script ufficiali `npm test` e `npm run typecheck` senza
  nuove dipendenze; il runner richiede Node.js 22.18.0 o successivo, seleziona
  soltanto test AFFARIO tracciati da Git e ignora ogni segmento `node_modules`.
- La migration dei default ACL di `postgres` è applicata, verificata sul remoto
  e allineata nella migration history. Il gate esterno relativo al creator role
  `supabase_admin` resta aperto pre-go-live e non è dichiarato risolto.

### 12.5 FUNZIONE 047A.2 — COMPLETATA E VERIFICATA IN PRODUCTION

- Il finding 047A-003 è corretto: la fase di scheduling snapshot è passata da
  `N` query sequenziali a una RPC batch O(1) nel numero di richieste. La RPC è
  `public.affario_price_alert_latest_product_checks(text[])`.
- Il client Supabase invia un `POST` con l'array ASIN nel body; non usa più
  `.in(...)` e non serializza la lista nell'URL. La funzione server-side legge
  soltanto `public.keepa_snapshots` e seleziona un solo latest snapshot per
  ASIN mediante `DISTINCT ON (asin)` e
  `ORDER BY asin, requested_at DESC`.
- La nuova RPC batch è deployata. La migration
  `20260906010000_create_price_alert_latest_checks_rpc.sql` è applicata sul
  Supabase remoto. I permessi effettivi verificati concedono `EXECUTE` a
  `postgres` e `service_role`, senza accesso per `PUBLIC`, `anon` o
  `authenticated`.
- Il test PostgreSQL reale con due ASIN distinti e più snapshot per ciascuno ha
  restituito indipendentemente lo snapshot più recente corretto per entrambi:
  `match = true` in entrambi i casi.
- La migration history è stata riallineata tramite
  `npx supabase@latest migration repair 20260906010000 --status applied`; la
  successiva `migration list` mostra Local = Remote fino a `20260906010000`.
- La validazione locale finale conta 227 test su 227 superati, con zero
  fallimenti; lint, typecheck e build sono verdi e `npm audit` riporta zero
  vulnerabilità.
- Il commit Production è
  `2b5783640bb2107e876065119b36db6a1126ed2f` e Vercel Production è `Ready`.
  Lo smoke test Production è 5/5 PASS: Home PASS; Privacy PASS; Search API PASS
  con `source = AFFARIO_CATALOG` e `status = MATCHES_FOUND`; Product API realme
  `B0FVXS42GF` PASS con `currentPrice = 859.99`, `score = 48`,
  `recommendation = WAIT`, `targetPrice = 830` e `savingsPotential = 30`;
  gestione alert reale PASS.
- Monitoring e Cron restano OFF.
- Rischio residuo separato: `loadActivePriceAlerts()` non pagina e il limite
  massimo righe PostgREST/Supabase può troncare il dataset quando gli alert
  attivi diventano numerosi. L'impatto è basso per la V1 e il volume attuale;
  il rischio futuro dovrà essere risolto con paginazione deterministica oppure
  scheduling server-side.
- Il gate dei default privileges del creator role `supabase_admin` resta
  **OPEN PRE-GO-LIVE** e non è modificato dalla Funzione 047A.2.

### 12.6 FUNZIONE 047A.3 — DATABASE BOOTSTRAP & RECOVERY

- Il finding originale **047A-006 HIGH** rilevava che la migration chain non
  conteneva il `CREATE TABLE` storico di `public.price_alerts`; un ambiente
  nuovo non era quindi ricostruibile dalla sola history versionata.
- L'introspezione read-only eseguita manualmente su Production ha certificato
  per `public.price_alerts`: owner `postgres`, RLS attiva, FORCE RLS `false`,
  zero policy RLS e zero trigger applicativi.
- Lo schema storico certificato antecedente a `20260827000000` è:
  `id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY`;
  `created_at timestamptz NOT NULL DEFAULT now()`; `product_id text` nullable;
  `product_title text` nullable; `email text` nullable; `target_price numeric`
  nullable; `current_price numeric` nullable; `status text` nullable con
  `DEFAULT 'active'`; `notified_at timestamptz` nullable;
  `manage_token_hash text` nullable; `intermediate_notified_at timestamptz`
  nullable.
- L'indice unique certificato è
  `price_alerts_unique_exact_alert_idx USING btree (product_id, email, target_price)`.
- La identity sequence certificata è `public.price_alerts_id_seq`, tipo
  `bigint`, owner `postgres`, start 1, increment 1, min 1, max
  9223372036854775807, cache 1 e cycle `false`.
- `confirmation_requested_at`, `target_notification_claimed_at`,
  `target_reached_at` e `target_reached_price` non fanno parte della baseline:
  vengono aggiunte dalle migration versionate successive.
- La baseline separata è
  `supabase/bootstrap/00000000000000_create_price_alert_prerequisites.sql`,
  documentata in `supabase/bootstrap/README.md` e coperta dai test dedicati
  `services/priceAlertBootstrap.test.ts`. Non entra nella normale migration
  history.
- La baseline è esclusivamente per un database Supabase nuovo e vuoto, deve
  essere eseguita come `postgres`, fallisce se `public.price_alerts` esiste già
  e non deve essere eseguita contro Production esistente. Crea soltanto i
  prerequisiti storici, revoca immediatamente gli accessi a `PUBLIC`, `anon` e
  `authenticated` e lascia RLS, grant `service_role` e default privileges alle
  migration di hardening successive.
- L'introspezione Production ha confermato che `public.price_history` esiste,
  ma il repository dimostra che non è raggiunta dal runtime V1 attuale ed è
  usata soltanto da moduli legacy/non importati. Il runtime V1 usa
  `buybox_price_history` e `keepa_snapshots`; `price_history` è quindi esclusa
  dal bootstrap V1.
- **BOOTSTRAP V1 != DISASTER RECOVERY COMPLETO PRODUCTION**: un backup/restore
  completo deve preservare anche `price_history`, i relativi dati e gli altri
  eventuali oggetti legacy.
- Il commit di implementazione è
  `f7f786ce3af7e1dd82f48c5619f03866e2150d59`
  (`chore: add price alert database bootstrap`). La validazione finale è
  `git diff --check` PASS, lint PASS, typecheck PASS, 234/234 test PASS, build
  PASS e `npm audit` con zero vulnerabilità.
- Durante l'implementazione non sono state applicate migration Production né
  eseguite query remote. Monitoring e Cron restano OFF.
- Il finding 047A-006 è **RISOLTO A LIVELLO REPOSITORY / BOOTSTRAP**: la
  sequenza bootstrap → migration dispone dei prerequisiti versionati necessari
  per ricostruire lo schema V1 su un database nuovo.
- Resta **OPEN PRE-GO-LIVE** il gate operativo **RECOVERY REHEARSAL SU DATABASE
  DISPOSABLE**: bootstrap e migration chain sono stati verificati staticamente,
  ma non ancora eseguiti integralmente su un PostgreSQL/Supabase usa-e-getta.
  Il rehearsal non blocca il commit della Funzione 047A.3.
- Stato finale: **IMPLEMENTATA / VALIDATA LOCALMENTE / 047A-006 RISOLTO A
  LIVELLO REPOSITORY / RECOVERY REHEARSAL OPEN PRE-GO-LIVE**.

### 12.7 FUNZIONE 047A.4 / 047A.4B — DECISIONE FINALE SEARCH PERFORMANCE

#### 047A-010 — VARIANT N+1

- Verdetto: **CLOSED / NOT APPLICABLE**.
- La ricerca locale esegue due query catalogo complessive in parallelo e il
  numero di query non cresce con il numero di famiglie.
- Non esistono query delle varianti dentro cicli. DTO e componenti ricevono
  già tutte le varianti.
- `/api/products/[asin]` viene chiamato soltanto dopo una CTA esplicita
  dell'utente e per un singolo ASIN.
- Il finding originale 047A-010 non è quindi riproducibile nel codice
  corrente.

#### 047A-013 — LOCAL SEARCH 500 / 5000

- Verdetto: **CONFIRMED — DEFER TO POST-GO-LIVE**.
- La ricerca locale esegue due query catalogo con limite di 500 righe
  `products` e 5.000 righe `product_variants`: fino a 5.500 righe vengono
  caricate prima del matching/ranking in memoria. L'output è limitato a 10
  famiglie.
- Una semplice soluzione `ILIKE`/`LIMIT` non è equivalente. La semantica
  corrente dipende da NFKD, rimozione dei diacritici, tokenizzazione Unicode,
  ASIN, attributi variante, Size/Color, exact matching, prefix matching,
  multi-token, Style split, ranking e tie-break TypeScript.

#### Design futuro raccomandato

L'architettura preferita post-go-live è:

> TypeScript canonical normalization/tokens → `text[]` source tokens →
> generated `tsvector` via `array_to_tsvector()` → GIN indexes → server-only
> RPC candidate generation → hydration completa delle famiglie candidate →
> Style split TypeScript invariato → `rankAffarioProductFamilies()` invariato
> → top 10.

La candidate generation SQL deve essere un **SUPERSET sicuro**: sono ammessi
falsi positivi, ma non falsi negativi rispetto alla ricerca corrente. Non deve
essere applicato alcun `LIMIT` prima del ranking finale TypeScript.

Il rollout futuro previsto è:

1. schema additivo nullable;
2. dual-write;
3. backfill;
4. verifica `NULL = 0`;
5. shadow comparison old/new;
6. `EXPLAIN ANALYZE`;
7. feature flag;
8. canary;
9. eventuale vincolo `NOT NULL` finale.

#### Semantica prefix da decidere separatamente

- Nel motore locale, `iph` da solo **non** trova `iphone`.
- Nel motore locale, `iph 17` può trovare iPhone 17 perché esiste anche un
  token exact che ammette la famiglia al ranking.
- Il motore esterno supporta il prefix già nella fase di admission e può
  trovare `iph`.
- Questa differenza non viene modificata dalla Funzione 047A.4 e resta una
  decisione separata per una futura revisione della semantica search.

#### Decisione V1 e validazione

- La nuova ricerca indicizzata non viene implementata prima del go-live:
  il traffico iniziale è controllato, il rate limiting è già attivo e la
  qualità dei risultati ha priorità. La soluzione richiede migration,
  backfill, RPC e un nuovo percorso di ricerca; catalogo reale e piani SQL non
  sono ancora verificati e superare i limiti 500/5.000 potrebbe modificare il
  top 10 osservabile.
- Stato finale: **047A-010 CLOSED**; **047A-013 OPEN — POST-GO-LIVE / V1.1**.
  047A-013 non è un blocker V1.
- La Funzione 047A.4B non ha modificato file permanenti. Il gate iniziale era
  pulito con `HEAD = origin/master =
  849e7f9a8c8c041faed06f389a9dc29b94b57967`.
- Monitoring e Cron restano OFF. Non sono state create migration, eseguite
  query remote o apportate modifiche al database.

### 12.8 FUNZIONE 047A.5 — ALERT UX E QA

#### 047A-014 / 047A-015 — TITOLI AMAZON TROPPO LUNGHI

- Stato: **CLOSED**.
- Il titolo Amazon raw veniva salvato integralmente e mostrato direttamente
  nelle email e nelle pagine alert.
- La soluzione usa l'utility condivisa `lib/userFacingProductTitle.ts`.
- La regola user-facing normalizza il whitespace, limita il titolo a 56
  caratteri inclusa l'ellissi, tronca su parola intera, aggiunge l'ellissi
  soltanto quando il titolo viene troncato e usa il fallback
  `Prodotto selezionato`.
- Database, ranking e monitoring restano invariati.
- Sono state aggiornate l'email di conferma alert, l'email di target raggiunto,
  la pagina di conferma/gestione alert e gli stati alert user-facing. I subject
  email sono stati verificati entro limiti ragionevoli.
- QA visuale: desktop PASS, 320 px PASS e 390 px PASS; nessun overflow
  orizzontale, titolo riconoscibile, prezzi e CTA leggibili.

#### 047A-016 — 429 / 503 GENERICI

- Stato: **CLOSED**.
- Copy 429: “Hai effettuato troppe richieste in poco tempo. Riprova tra qualche
  minuto.”
- Copy 503: “Il servizio è temporaneamente non disponibile. Riprova tra poco.”
- Gli status HTTP restano invariati: 429 = Too Many Requests; 503 = Service
  Unavailable.
- Nessun dettaglio tecnico, provider o ambiente viene esposto.
- Le superfici aggiornate sono ricerca, analisi prodotto, creazione alert,
  conferma/gestione alert e client di conferma/eliminazione.

#### Affiliate footer

- La disclosure Amazon nel `RootLayout` usa 12 px, line-height 1.5, peso
  normale e `break-words`, con contrasto invariato e link Privacy coerente.
- Il test visuale desktop/mobile è PASS e il testo della disclosure non è
  stato modificato.

#### Preview development

Le fixture:

- `/alert/preview-alert`;
- `/alert/preview-rate-limited`;
- `/alert/preview-unavailable`.

sono disponibili esclusivamente in development.

Il safety check certifica:

- gate server-only `NODE_ENV === "development"`;
- uso obbligatorio del percorso reale in Production;
- nessun bypass di database, validazione token o rate limiting in Production;
- nessun flag client-side o query parameter pubblico;
- nessuna variabile d'ambiente aggiuntiva;
- un token reale omonimo non viene trattato come preview in Production.

È stato aggiunto un test esplicito per questa garanzia.

#### Validazione

- Commit di implementazione:
  `604cefbd6c3a005bec72442cf0008ae221ed5603`
  (`fix: improve alert ux and consumer errors`).
- `git diff --check` PASS; lint PASS; typecheck PASS; 243/243 test PASS; build
  PASS; `npm audit` PASS con zero vulnerabilità.
- Monitoring e Cron restano OFF. Durante la funzione non sono state eseguite
  chiamate remote.
- Stato finale: **047A-014 CLOSED**; **047A-015 CLOSED**; **047A-016 CLOSED**;
  **047A.5 COMPLETATA E VALIDATA LOCALMENTE + MANUAL QA PASS**.

### 12.9 FUNZIONE 047B.2A — VARIANT SELECTOR INTEGRITY

- Stato: **CLOSED — IMPLEMENTED + AUTOMATED QA PASS + MANUAL QA PASS**.
- Commit di implementazione:
  `f9fe86c6022766e298abea421864187b2f923289`
  (`fix: preserve variant selector integrity`).

#### 047B-010 — PROBLEMA E DIAGNOSI

- Stato: **CLOSED**. Classificazione precedente: **HIGH**.
- Il caso reale Sony WH-1000XM5 conteneva cinque varianti rilevate e due
  configurazioni, Rigida e Morbida. `Size=Unica`, presente soltanto sull'ASIN
  nero con custodia rigida, veniva mostrato impropriamente come selector
  **Capacità** e reso obbligatorio; il filtro eliminava così Argento, BLU NOTTE
  e Rosa fumè, lasciando raggiungibile soltanto Nero.
- Diagnosi: **MIXED — DATA INCOMPLETE + UI FILTERING BUG + ATTRIBUTE MAPPING
  BUG**. Non è stato certificato alcun **GROUPING BUG**.

#### Comportamento canonico

- La selezione filtra esclusivamente sulle scelte espressamente effettuate
  dall'utente.
- Una dimensione diventa selector soltanto se, nei candidati correnti, ha
  almeno due valori distinti. Dimensioni con zero o un valore non diventano
  selector obbligatori; i valori singoli restano dettagli descrittivi.
- Una variante è individuata soltanto quando rimane esattamente un ASIN
  candidato. In caso di ambiguità non viene mai selezionato implicitamente
  `candidates[0]`.
- La copy **“X varianti disponibili”** è sostituita da **“X varianti
  rilevate”**, per non dichiarare completezza rispetto ad Amazon né
  disponibilità commerciale certificata.
- Una variante presente in `family.variants` / `product_variants` resta
  selezionabile anche senza un record `products` completo, `keepa_snapshots` o
  `keepa_raw_latest`. Il selector non esegue lookup Keepa preventivi e non
  materializza automaticamente gli ASIN mancanti.
- Soltanto l'azione esplicita **Analizza il prezzo** può attivare la Product API
  esistente, che usa la cache oppure il normale refresh Keepa interattivo.
- L'exact ASIN individuato resta quello usato da Product API, analisi AFFARIO e
  CTA Amazon.

#### Manual QA

- **Sony — Custodia Rigida: PASS.** La UI mostra **5 varianti rilevate**,
  Configurazione Rigida/Morbida e, dopo la scelta Rigida, i colori Argento, BLU
  NOTTE, Nero e Rosa fumè. Non compare **Capacità → Unica** e tutti gli ASIN
  rilevati restano raggiungibili.
- **Sony — Custodia Morbida: PASS.** L'unico ASIN residuo viene risolto
  automaticamente senza selector Colore inutile; il riepilogo è **Con Custodia
  Morbida · Nero** e la CTA **Analizza il prezzo** è disponibile.
- **Apple iPhone 17 Pro — regression QA: PASS.** La UI mostra **9 varianti
  rilevate**, capacità 256 GB / 512 GB / 1 TB e colori coerenti; la selezione
  **512 GB · Blu profondo** individua la variante corretta e la CTA resta
  invariata.

#### Validazione e finding residui

- `git diff --check` PASS; lint PASS; typecheck PASS; 251/251 test PASS; build
  PASS; `npm audit` PASS con zero vulnerabilità.
- Il test copre esplicitamente le varianti Sony rilevate ma non materializzate.
- Nessuna chiamata Keepa è stata effettuata durante implementazione e QA
  tecnica. Monitoring e Cron restano OFF.
- Stato successivo: **047B-005** e **047B-006** sono stati chiusi dalla
  Funzione 047B.2B. Al termine della 047B.2A restavano separati
  **047B-003 MEDIUM**, **047B-004 LOW**, **047B-007 LOW/NOTE**,
  **047B-008 MEDIUM**, **047B-009 MEDIUM/HIGH** e **047B-011 HIGH**; gli
  ultimi due sono stati successivamente chiusi dalla Funzione 047B.2C1.

### 12.10 FUNZIONE 047B.2B — PRODUCT TITLES + USER-FACING ATTRIBUTES

- Stato: **CLOSED — IMPLEMENTED + AUTOMATED QA PASS + MANUAL QA PASS**.
- Commit di implementazione:
  `5560afaeffbe72febf0443a94390f071fd2360e4`
  (`fix: improve product titles and variant labels`).

#### 047B-005 — PRODUCT TITLES

- Stato: **CLOSED**. Il problema era l'uso nelle search card di titoli Amazon
  raw troppo lunghi, con forte impatto sulla leggibilità mobile.
- La correzione è esclusivamente presentazionale. Titolo raw nel database,
  ranking, DTO API, persistenza e utility alert/email restano invariati.
- Il display title conserva un titolo breve su brand e modello e rimuove in
  modo conservativo un suffisso che coincide con un valore di una dimensione
  variante che cambia tra gli ASIN della famiglia. Il confronto può ignorare
  il prefisso descrittivo iniziale `Con ` soltanto quando la corrispondenza del
  suffisso resta sufficientemente certa.
- Non esistono hardcode per Sony, modelli o ASIN.
- Casi verificati: realme passa dal titolo Amazon esteso a **realme GT 8 Pro**;
  Sony passa da **Sony WH-1000XM5 Custodia Rigida ...** a **Sony
  WH-1000XM5**; **Apple iPhone 17 Pro** resta invariato.

#### 047B-006 — USER-FACING VARIANT ATTRIBUTES

- Stato: **CLOSED**. Gli attributi tecnici e ridondanti nella UI consumer sono
  presentati tramite il mapping V1: `Color` → **Colore**, `Style` →
  **Configurazione**, `MemoryStorageCapacity` → **Memoria** e
  `RamMemoryInstalledSize` → **RAM**.
- Un `Size` chiaramente storage-like, per esempio 256 GB, 512 GB o 1 TB, usa
  **Capacità**. Un valore ambiguo come `16+512 Go` non viene presentato
  falsamente come Capacità.
- La deduplicazione è conservativa: `Size=16+512 Go` viene omesso dal riepilogo
  consumer soltanto quando coincide esattamente con `RAM=16 GB` e
  `Memoria=512 GB`. Se la corrispondenza non è certa, il dato non viene
  eliminato arbitrariamente.
- Attributi e valori interni, exact ASIN e selector integrity della Funzione
  047B.2A restano invariati.

#### Manual QA e validazione

- Viewport manuale: 390 px.
- **Realme: PASS.** Titolo **realme GT 8 Pro**, selector **Colore**, riepilogo
  **Blu · Memoria: 512 GB · RAM: 16 GB**, nessuna label raw o duplicazione
  `16+512 Go`, CTA **Analizza il prezzo** presente.
- **Sony: PASS.** Titolo famiglia **Sony WH-1000XM5**, cinque varianti
  rilevate, Configurazione Morbida/Rigida invariata e nessuna regressione
  047B.2A.
- **iPhone: PASS.** Titolo **Apple iPhone 17 Pro**, Capacità/Colore, exact ASIN
  e selector integrity invariati.
- `git diff --check` PASS; lint PASS; typecheck PASS; 261/261 test PASS; build
  PASS; `npm audit` PASS con zero vulnerabilità.
- Monitoring e Cron restano OFF.

#### Finding residui e priorità

- **047B-003 MEDIUM** è stato successivamente chiuso con PASS dalla correzione
  del placeholder Search consumer.
- **047B-008 MEDIUM** è stato successivamente chiuso con PASS dal miglioramento
  mirato del focus da tastiera delle opzioni selezionate.
- Restano **OPEN — POST-LIVE**: **047B-004 LOW** preload warnings development
  e **047B-007 LOW/NOTE** exact ASIN search senza preselezione variante.
- **047B-009 MEDIUM/HIGH** e **047B-011 HIGH** sono stati successivamente
  chiusi dalla Funzione 047B.2C1.

### 12.11 FUNZIONE 047B.2C1 — HYBRID SEARCH + IDENTITY RELEVANCE

- Stato: **CLOSED / PRODUCTION PASS**.
- Commit tecnico:
  `f867c7a62eb9a15c00cc5c2500f035bf60dc18c7`
  (`feat: add hybrid product search relevance`).

#### Finding risolti

- **047B-011 HIGH — CLOSED**: la presenza di risultati locali non blocca più
  automaticamente la provider discovery per una ricerca testuale generica.
- **047B-009 MEDIUM/HIGH — CLOSED**: quando esiste un forte identity match, i
  risultati description-only non pertinenti vengono esclusi.

#### Comportamento canonico

- Exact ASIN locale: provider Search non necessaria.
- Strong local identity: provider Search può essere evitata.
- Generic text query: ricerca ibrida con catalogo locale e provider discovery.
- Fino a 20 Product Object provider vengono valutati prima di
  grouping/ranking.
- Il merge local/provider è deterministico, deduplica per `familyId` e overlap
  ASIN e assegna precedenza al risultato locale sui duplicati.
- Il risultato pubblico contiene al massimo 10 famiglie.
- Il source pubblico resta `AFFARIO_CATALOG`, `KEEPA` o `HYBRID`.
- La Search non introduce Product lookup aggiuntivi.

#### Manual QA

- `iphone` → 10 famiglie.
- `realme` → 10 famiglie/prodotti pertinenti.
- `Sony WH-1000XM5` → risultati pertinenti; Sony ULT WEAR esclusa.

### 12.12 FUNZIONE 047B.2C2 — PERSISTENT SEARCH QUERY CACHE

- Stato: **CLOSED / PRODUCTION PASS**.
- Commit tecnico:
  `71b6deecd35366a82f4900a5b738dd45b8975d90`
  (`feat: add persistent product search cache`).
- Obiettivo raggiunto: evitare Keepa Search ripetute per la stessa query
  testuale entro il TTL.

#### Architettura canonica

- Cache distribuita persistente in
  `public.product_search_query_cache`, con TTL di 24 ore.
- La cache key è lo SHA-256 della query normalizzata con la sequenza
  `trim → NFKC → lowercase → whitespace singolo`; la query raw non viene
  persistita.
- `payload_version = 1`.
- Sono salvati i candidati provider normalizzati, non il risultato finale
  local+provider.
- Non vengono salvati Product Object Keepa raw, prezzi, storico, token, header
  o `serverReport`.
- Un risultato provider vuoto ma valido viene cacheato; gli errori provider non
  vengono cacheati.
- Viene riutilizzato il sistema di distributed lease esistente con chiave
  `search:<query_hash>`; non esiste un secondo sistema di locking.
- In caso di stampede il loser non chiama Keepa. Per la V1 è accettato un wait
  bounded di 250 ms seguito da una sola rilettura.
- Il source pubblico resta `AFFARIO_CATALOG`, `KEEPA` o `HYBRID`; HIT e MISS
  non vengono esposti pubblicamente.

#### Failure policy

- Cache/store unavailable con risultati locali → risposta local-only `200`.
- Cache/store unavailable senza risultati locali → `503` consumer-safe.
- Provider failure con risultati locali → risposta local-only.
- Provider failure senza risultati locali → `503`.
- Cache write failure → comportamento conservativo senza retry Keepa
  immediato.

#### Migration e audit remoto

- Migration:
  `20260908000000_create_product_search_query_cache.sql`.
- Stato: **APPLIED REMOTE / AUDITED / LEDGER ALIGNED**.
- Campi: `query_hash`, `payload_version`, `candidates`, `result_count`,
  `fetched_at`, `expires_at`.
- Owner `postgres`; RLS enabled; `force_rls = false`; zero policy.
- `anon` e `authenticated` non hanno privilegi. `service_role` ha soltanto
  `SELECT`, `INSERT` e `UPDATE`; non ha `DELETE`, `TRUNCATE`, `REFERENCES` o
  `TRIGGER`.
- Constraints verificate: query hash di 64 caratteri lowercase hex;
  `payload_version > 0`; `candidates` array JSON; `result_count >= 0` e uguale
  alla lunghezza dell'array; `expires_at > fetched_at`; primary key su
  `query_hash`.
- Indici verificati: `product_search_query_cache_pkey` e
  `product_search_query_cache_expires_at_idx`.
- Il ledger `20260908000000` è allineato local/remote. La migration è stata
  applicata manualmente tramite Supabase SQL Editor e la history è stata poi
  riallineata con `migration repair --status applied`; non è stato usato
  `supabase db push`.

#### Real runtime cache QA

- Query:
  `friggitrice ad aria doppio cestello 9 litri per famiglia grande`.
- Query hash:
  `067aa11aa44a29bab8716581c790f1725c031e49d6373ad677bbf22326bc65fa`.
- Stato iniziale: nessuna cache row.
- Prima request: **CACHE MISS**, HTTP `200`, source `KEEPA`,
  `MATCHES_FOUND`, 10 famiglie finali, una Keepa Search,
  `tokensConsumed = 10`, cache write PASS.
- Seconda request identica: **CACHE HIT**, HTTP `200`, source `KEEPA`,
  `MATCHES_FOUND`, 10 famiglie finali, zero nuove Keepa Search, telemetria
  Keepa invariata e payload pubblico identico.
- Cache row: `payload_version = 1`, `result_count = 20`,
  `fetched_at = 2026-09-08T20:17:15.472+00:00`,
  `expires_at = 2026-09-09T20:17:15.472+00:00`.
- I 20 candidati provider producono 10 famiglie finali dopo
  grouping/ranking.
- Nessun Product lookup aggiuntivo e nessuna chiamata Brevo.

#### Validazione automatizzata del blocco 047B.2C

- `npm test` PASS — 297/297.
- lint PASS.
- typecheck PASS.
- build PASS.
- `npm audit` PASS — zero vulnerabilità.
- `git diff --check` PASS.

### 12.13 Production smoke 047B.2C

- Stato complessivo: **047B.2C1 + 047B.2C2 PRODUCTION VERIFIED / PASS**.
- Commit deployato:
  `6e81680ae35a1aae1e76379ad1a59ee0c20d4f2a`.
- Vercel Production: **SUCCESS / READY**.

#### Home

- `GET /` → HTTP `200`.
- `PublicHome` editoriale resta attiva; `DemoHome` non è esposta in
  Production.
- Nessun errore server evidente.

#### Cached Search Production

- Query:
  `friggitrice ad aria doppio cestello 9 litri per famiglia grande`.
- HTTP `200`, source `KEEPA`, status `MATCHES_FOUND`, 10 famiglie finali.
- Cache Production **HIT** confermato: la riga era fresh e invariata, non è
  stata eseguita una nuova Keepa Search e il consumo Search è stato zero token.
- Il payload pubblico è coerente con il QA locale e conserva il contratto
  `query`, `source`, `status`, `families`.

#### Exact ASIN Search

- Query `B0FVXS42GF` → HTTP `200`, source `AFFARIO_CATALOG`, status
  `MATCHES_FOUND`.
- Il risultato è coerente con realme GT 8 Pro, modello `RMX5210`.
- Il bypass C1 è confermato: zero Keepa Search e zero token.

#### Product API

- `GET /api/products/B0FVXS42GF` → HTTP `200`.
- Buy Box `AVAILABLE`; prezzo `859,99 EUR`; media 90 giorni `852,32 EUR`;
  minimo 90 giorni `829 EUR`.
- Affario Score `48`, recommendation `WAIT`, target `830 EUR`, Risparmio
  Potenziale `30 EUR`.
- Lo snapshot Product aveva circa 274 minuti, oltre il TTL Product di 60
  minuti: l'unica Product lookup Keepa eseguita ha consumato 3 token. Il
  refresh è comportamento atteso.

#### Operations

- Consumo totale dello smoke: 3 token Keepa — Search cache 0, exact ASIN
  Search 0, Product lookup 3.
- Monitoring OFF; Cron OFF; cron secret non attivato.
- Nessuna chiamata Brevo, nessun `db push`, nessuna migration aggiuntiva e
  nessuna modifica RLS.
- Git al termine dello smoke: working tree clean, ahead 0, behind 0.
- Nessuna regressione o warning rilevante.

### 12.14 FUNZIONE 047B-003 — SEARCH PLACEHOLDER MOBILE

- Stato: **CLOSED / PASS**.
- Il placeholder Search consumer è stato modificato da **“Che prodotto stai
  pensando di comprare?”** a **“Cerca un prodotto”**, senza altre modifiche UI
  o funzionali.
- Manual QA: 320 px PASS e 390 px PASS; nessun taglio del testo, overlap,
  problema di layout o regressione visiva evidente.
- Commit tecnico:
  `468aff7db1af844734201d8f50fd9709dd3b43ef`
  (`fix: shorten product search placeholder`).
- Validazione: 297/297 test PASS; lint, typecheck e build PASS;
  `git diff --check` PASS.

### 12.15 FUNZIONE 047B-008 — VARIANT FOCUS VISIBILITY

- Stato: **CLOSED / PASS**.
- In `components/ProductVariantSelector.tsx` il focus da tastiera delle opzioni
  selezionate usa `focus-visible` con ring da 4 px verde scuro e offset da 2
  px; lo stato normale, hover e selected restano invariati.
- Manual QA PASS: focus chiaramente visibile, design normale invariato e
  nessuna regressione del variant selector.
- Validazione: 297/297 test PASS; lint, typecheck e build PASS;
  `git diff --check` PASS.

### 12.16 FUNZIONE 049A — PUBLIC REVIEW MODE

- Stato: **CLOSED / PASS**.
- AFFARIO è **PUBLIC REVIEW LIVE** e non è ancora **FULL LIVE**.
- In REVIEW restano attivi ricerca reale, selezione variante, analisi completa
  server-side, Affario Score, recommendation, Prezzo giusto AFFARIO/target
  derivato, Risparmio Potenziale derivato quando applicabile e CTA Amazon con
  exact ASIN e tracking ID `affario-21`.
- La risposta pubblica prodotto REVIEW viene redatta soltanto dopo il calcolo
  completo server-side. Non espone prezzo Amazon/Buy Box corrente numerico,
  availability/Buy Box raw, media o minimo 90 giorni numerici, storico raw o
  timestamp Buy Box.
- La UI REVIEW usa la copy **“Prezzo e disponibilità finali: Verificali
  direttamente su Amazon.”** e non mostra il form alert. La creazione pubblica
  di nuovi alert è fail-closed con `503 ALERT_NOT_AVAILABLE`, prima di lookup,
  persistenza o invio email; le funzioni alert esistenti non sono state
  eliminate.
- Branding ufficiale attivo: logo AFFARIO con slogan nel Hero, payoff **“Scegli
  il momento giusto per comprare”**, A con mirino accanto al Prezzo giusto
  AFFARIO e favicon App Router `/icon.png`. La favicon generica Next.js è stata
  rimossa.
- La formula ufficiale del footer Amazon resta: **“In qualità di Affiliato
  Amazon io ricevo un guadagno dagli acquisti idonei.”**

#### Follow-up CTA Amazon — CLOSED / PASS

- La CTA Amazon è indipendente da Score, recommendation e target: con exact
  ASIN valido resta disponibile anche quando lo storico è insufficiente;
  senza ASIN valido non viene mostrata.
- Il nuovo copy consumer è **“Storico ancora insufficiente”**, con il testo
  **“Questa variante non ha ancora abbastanza dati di prezzo per permettere
  ad AFFARIO di esprimere un consiglio affidabile.”**
- La CTA REVIEW **“Vedi prezzo e disponibilità su Amazon”** usa lo stile verde
  primario. Il contratto affiliato resta
  `https://www.amazon.it/dp/<EXACT_ASIN>?tag=affario-21`.
- Manual QA **PASS** su POCO F9 Ultra con storico insufficiente e su un caso
  **ACQUISTA ORA** con Affario Score **92/100**.
- La redaction PUBLIC REVIEW resta invariata; alert, Monitoring e Cron restano
  OFF. I finding post-live già esistenti restano aperti senza variazioni.

#### Manual QA mobile

- **Homepage PASS**: logo ufficiale corretto, payoff presente, placeholder
  **“Cerca un prodotto”** e nessuna duplicazione dello slogan.
- **Sony WH-1000XM5 PASS**: variant selector corretto, analisi completa,
  **Prezzo nella media**, Affario Score **60/100**, nessun prezzo Amazon,
  media/minimo 90 giorni, availability/Buy Box o timestamp numerico esposto;
  copy REVIEW corretta, form alert assente e nota alert prossimamente presente.
- Il testo derivato AFFARIO **“Il prezzo attuale è in linea con la media
  recente.”** è accettato in REVIEW.
- **realme**: **Storico ancora insufficiente** osservato; non è un blocker 049A e il
  finding 047B-007 resta POST-LIVE.
- Validazione automatizzata: 305/305 test PASS; lint, typecheck, build e
  `git diff --check` PASS; `npm audit` PASS con zero vulnerabilità.
- Monitoring e Cron restano OFF. Nessuna modifica DB, migration o RLS e nessuna
  chiamata Brevo fanno parte della Funzione 049A.

#### Gate FULL LIVE e attività differite

- La risposta tecnica definitiva Amazon resta pendente. Il passaggio a **FULL
  LIVE** e l'esposizione delle funzioni sensibili restano subordinati alla
  valutazione Amazon.
- Restano POST-LIVE senza variazioni: 047B-004, 047B-007, 047A-013, cleanup
  cache, backup/recovery completo e refinement non bloccanti.

## 13. Necessario prima del FULL LIVE

AFFARIO è **PUBLIC REVIEW LIVE**. Prima del passaggio **FULL LIVE** sono
necessari:

1. chiudere il gate Amazon prima di esporre dati di price tracking raw o
   riattivare la creazione alert consumer su `affario.it`;
2. preservare il flusso pubblico REVIEW già collegato alle API reali di ricerca
   e lookup, mantenendo famiglia → variante → exact ASIN;
3. preservare il motore AFFARIO sui dati reali senza inventare l'algoritmo
   definitivo dello Score;
4. attivare alert consumer, monitoraggio e scheduler soltanto dopo
   autorizzazione e completare
   l'invio intermedio se confermato nel perimetro V1; l'invio target è già
   implementato;
5. garantire che ogni controllo sia aggregato per ASIN e rispetti cache/capacità Keepa;
6. completare hardening, verifica segreti, gestione errori e test
   mobile/desktop; chiudere il gate dei default ACL di `supabase_admin` tramite
   un percorso Supabase autorizzato prima del go-live;
7. verificare CTA e URL Amazon ufficiali nel perimetro autorizzato;
8. eseguire deploy e smoke test soltanto con autorizzazione esplicita.
9. definire e automatizzare una policy di scadenza/pulizia dei
   `pending_confirmation` mai confermati, senza assumere una durata non ancora
   approvata; il
   calcolo dovrà partire dalla creazione originaria registrata in `created_at`,
   non dai resend registrati in `confirmation_requested_at`; il
   raggiungimento del target non deve invece cancellare il record storico,
   necessario alla futura validazione dell'algoritmo AFFARIO.
10. sostituire `PRIVACY_CONTACT_EMAIL` con una casella AFFARIO reale e
    monitorata; la creazione e configurazione di `info@affario.it` e/o
    `admin@affario.it` resta un'attività pre-go-live e le caselle non vengono
    create in questa fase.
11. eseguire integralmente la sequenza bootstrap → migration chain su un
    PostgreSQL/Supabase disposable e verificare lo schema risultante prima del
    go-live operativo; il bootstrap V1 non sostituisce il backup/restore
    completo di Production.

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
- La risposta tecnica definitiva Amazon resta **OPEN** e blocca il passaggio
  **FULL LIVE**, l'esposizione dei dati di price tracking raw e la riattivazione
  degli alert consumer; non blocca la modalità prudenziale PUBLIC REVIEW.
- Lo scheduler alert è applicato dalla Funzione 045 ma non configurato né
  attivato; resta inattivo fino al go-live esplicitamente autorizzato.
- La FUNZIONE 046B2 di lock distribuito è completata e la migration è applicata
  al remoto.
- `loadActivePriceAlerts()` non pagina: il limite massimo righe
  PostgREST/Supabase ha basso impatto al volume V1 attuale, ma costituisce un
  rischio futuro da risolvere con paginazione deterministica oppure scheduling
  server-side.
- La Funzione 047A.3 ha risolto 047A-006 a livello repository introducendo la
  baseline V1 separata; il recovery rehearsal integrale su database disposable
  resta **OPEN PRE-GO-LIVE**.
- Il finding 047A-010 è chiuso/non applicabile. Il finding 047A-013 resta
  **OPEN — NEEDS DESIGN / POST-GO-LIVE / V1.1** e non blocca la V1; la
  differenza tra prefix matching locale ed esterno richiede una decisione
  separata prima della futura implementazione della ricerca indicizzata.
- **047B-004 LOW** resta **OPEN — POST-LIVE**: warning di preload/HMR in
  development.
- **047B-007 LOW/NOTE** resta **OPEN — POST-LIVE**: una exact ASIN search non
  preseleziona automaticamente la exact variant.
- La pulizia automatica delle righe scadute di
  `product_search_query_cache` resta **OPEN — POST-LIVE**; la validità runtime
  continua a dipendere da `expires_at`.
- I refinement non bloccanti restano **OPEN — POST-LIVE** e non devono
  espandere il perimetro della V1 pre-lancio.
- **047B-009 MEDIUM/HIGH** e **047B-011 HIGH** sono CLOSED dalla Funzione
  047B.2C1 e non devono essere riaperti senza una nuova evidenza.
- Il gate dei default privileges del creator role `supabase_admin` resta
  **OPEN PRE-GO-LIVE** e separato dalla componente `postgres` già verificata.

## 17. Prossimo passo

- La **FUNZIONE 049A è CLOSED / PASS**: AFFARIO è **PUBLIC REVIEW LIVE** con
  `DemoHome` pubblica, dati Amazon raw redatti, alert consumer disattivati e
  Monitoring/Cron OFF. Il prossimo gate di prodotto è la risposta tecnica
  definitiva Amazon prima del passaggio **FULL LIVE**.
- La **FUNZIONE 047B-008 è CLOSED / PASS**: il focus da tastiera delle opzioni
  variante selezionate è chiaramente visibile e la QA manuale non rileva
  regressioni del selector.
- La **FUNZIONE 047B-003 è CLOSED / PASS** nel commit
  `468aff7db1af844734201d8f50fd9709dd3b43ef`: il placeholder Search consumer
  usa **“Cerca un prodotto”** e la QA manuale a 320 px e 390 px è PASS.
- La **FUNZIONE 047B.2C1 è CLOSED / PRODUCTION PASS** nel commit
  `f867c7a62eb9a15c00cc5c2500f035bf60dc18c7`: 047B-009 e 047B-011 sono
  chiusi; hybrid discovery, identity relevance, merge/dedup e source contract
  sono validati.
- La **FUNZIONE 047B.2C2 è CLOSED / PRODUCTION PASS** nel commit
  `71b6deecd35366a82f4900a5b738dd45b8975d90`: cache query persistente,
  migration/audit/ledger, runtime MISS→HIT e smoke Production sono validati.
- Il blocco 047B.2C è presente in Production nel deployment Vercel
  `SUCCESS / READY` del commit
  `6e81680ae35a1aae1e76379ad1a59ee0c20d4f2a`; `PublicHome` resta editoriale.
- La **FUNZIONE 047B.2B è CLOSED — IMPLEMENTED + AUTOMATED QA PASS + MANUAL QA
  PASS** nel commit `5560afaeffbe72febf0443a94390f071fd2360e4`;
  047B-005 e 047B-006 sono chiusi senza modificare dati raw, ranking, API,
  persistenza o utility alert/email.
- La **FUNZIONE 047B.2A è CLOSED — IMPLEMENTED + AUTOMATED QA PASS + MANUAL QA
  PASS** nel commit `f9fe86c6022766e298abea421864187b2f923289`.
  Il finding 047B-010 è chiuso; selector dinamici, varianti rilevate non
  materializzate ed exact ASIN sono coperti da test e QA manuale.
- La **FUNZIONE 047A.5 è completata e validata localmente con manual QA PASS**
  nel commit `604cefbd6c3a005bec72442cf0008ae221ed5603`: 047A-014, 047A-015 e
  047A-016 sono chiusi. Le preview alert restano fixture esclusivamente
  development e in Production usano sempre il percorso reale.
- La **FUNZIONE 047A.4 / 047A.4B è chiusa come decisione QA**: 047A-010 è
  `CLOSED / NOT APPLICABLE`; 047A-013 è `CONFIRMED — DEFER TO POST-GO-LIVE`,
  resta `OPEN — POST-GO-LIVE / V1.1` e non costituisce un blocker V1. Il
  design indicizzato è documentato ma non implementato.
- La **FUNZIONE 047A.3 è implementata e validata localmente** nel commit
  `f7f786ce3af7e1dd82f48c5619f03866e2150d59`; 047A-006 è risolto a livello
  repository. Prima del go-live operativo resta da eseguire il recovery
  rehearsal bootstrap → migration chain su un database disposable.
- La **FUNZIONE 047A.2 è completata e verificata in Production**: commit
  Production `2b5783640bb2107e876065119b36db6a1126ed2f`, Vercel `Ready` e smoke
  test 5/5 PASS. La migration dei default ACL di `postgres` della Funzione
  047A.1 resta applicata, verificata e allineata nella history remota, mentre
  il gate esterno `supabase_admin` resta aperto pre-go-live e non è dichiarato
  risolto. Cron e monitoring restano inattivi.

`PublicHome` resta nel repository ma non è più la homepage pubblica. Le
attività POST-LIVE elencate nella Funzione 049A restano invariate.
