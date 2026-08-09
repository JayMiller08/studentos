-- ============================================================================
-- StudentOS — Paystack as a subscription provider
--
-- `subscriptions.provider` was constrained to ('stripe', 'manual') from the
-- original schema. Paystack is now the live processor (Stripe does not support
-- South African businesses), so the webhook needs to be able to write it.
--
-- Existing Stripe and manual rows are untouched — the constraint only widens.
-- Idempotent.
-- ============================================================================

-- Drop whatever the original inline CHECK ended up being called rather than
-- assuming Postgres' default name: guessing wrong would leave the old
-- constraint in place next to the new one, and 'paystack' would still be
-- rejected — at webhook time, in production, with money already taken.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
     where nsp.nspname = 'public'
       and rel.relname = 'subscriptions'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%provider%'
       and pg_get_constraintdef(con.oid) ilike '%stripe%'
  loop
    execute format('alter table public.subscriptions drop constraint %I', constraint_name);
  end loop;
end;
$$;

alter table public.subscriptions
  add constraint subscriptions_provider_check
  check (provider in ('stripe', 'paystack', 'manual'));

-- The webhook looks a customer up by code when a subscription event arrives
-- without metadata; without this it is a sequential scan per event.
create index if not exists subscriptions_provider_customer_id_idx
  on public.subscriptions (provider_customer_id);
