begin;

revoke all on table public.keepa_runtime_state from service_role;
grant select, insert, update on table public.keepa_runtime_state
  to service_role;

commit;
