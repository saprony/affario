begin;

alter table public.price_alerts
  add column confirmation_requested_at timestamptz;

commit;
