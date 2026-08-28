begin;

alter table public.price_alerts
  add column target_notification_claimed_at timestamptz,
  add column target_reached_at timestamptz,
  add column target_reached_price numeric;

commit;
