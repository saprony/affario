# Bootstrap database V1

Questa directory contiene i prerequisiti storici che precedono la migration
chain versionata di AFFARIO. Non fa parte di `supabase/migrations/` e non deve
essere registrata come una migration Supabase.

## Quando usarlo

Usare `00000000000000_create_price_alert_prerequisites.sql` esclusivamente per
inizializzare un database Supabase nuovo e vuoto. Il bootstrap deve essere
eseguito come ruolo `postgres`, lo stesso owner certificato degli oggetti, e
rifiuta l'esecuzione con un ruolo diverso o se `public.price_alerts` esiste gia.

NON eseguire contro Production esistente o contro un database gia
inizializzato. Non avviare l'applicazione e non esporre il nuovo ambiente prima
che l'intera chain sia stata applicata.

## Ordine di recovery per un nuovo ambiente V1

1. Creare un database Supabase vuoto e dedicato.
2. Eseguire una sola volta
   `supabase/bootstrap/00000000000000_create_price_alert_prerequisites.sql`.
3. Applicare, in ordine crescente e senza modificarle, tutte le migration da
   `20260820000000_create_keepa_storage.sql` fino a
   `20260906010000_create_price_alert_latest_checks_rpc.sql`.
4. Verificare lo schema e completare i normali test del nuovo ambiente prima di
   renderlo accessibile.

La baseline crea soltanto `price_alerts` nello stato certificato precedente a
`20260827000000`. Le colonne aggiunte dalle migration successive non sono
pre-create. Le revoche iniziali impediscono accesso a `PUBLIC`, `anon` e
`authenticated`; RLS, privilegi `service_role` e default privileges restano di
competenza delle migration di hardening esistenti.

## Bootstrap V1 e disaster recovery Production

Il bootstrap ricostruisce i prerequisiti necessari al runtime e alla migration
chain V1, ma non sostituisce un backup e restore completo di Production. Un
disaster recovery completo deve preservare schema, dati e oggetti legacy non
inclusi nella V1.

`public.price_history` esiste in Production, ma i moduli che la referenziano non
sono raggiunti dal runtime V1. La V1 usa `buybox_price_history` e
`keepa_snapshots`; per questo `price_history` e intenzionalmente esclusa dal
bootstrap. I suoi dati e il suo DDL devono essere conservati tramite backup e
restore Production, non ricostruiti per supposizione in questa baseline.
