-- Umbenennung in Go4Pro: Verwendungszweck G4P-<Spieler-Code>-<MMJJJJ>

-- Legt den Zahlungsauftrag an (oder gibt den bestehenden des laufenden Monats zurück)
create or replace function create_payment_order(p_player uuid)
returns table (reference text, amount_cents int, status order_status, created_at timestamptz,
               bank_holder text, bank_iban text, bank_bic text, bank_name text, player_code text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  pl players;
  ref text;
  price int;
begin
  select * into pl from players where id = p_player
     and (guardian_user_id = auth.uid() or own_user_id = auth.uid());
  if not found then raise exception 'Nur für eigene Spieler.'; end if;

  ref := 'G4P-' || pl.code || '-' || to_char(now() at time zone 'Europe/Berlin', 'MMYYYY');
  select coalesce(nullif(value, '')::int, 2000) into price from app_settings where key = 'premium_price_cents';

  insert into payment_orders (player_id, payer_user_id, reference, amount_cents)
  values (pl.id, auth.uid(), ref, price)
  on conflict on constraint payment_orders_reference_key do nothing;

  return query
    select o.reference, o.amount_cents, o.status, o.created_at,
           (select value from app_settings where key = 'bank_holder'),
           (select value from app_settings where key = 'bank_iban'),
           (select value from app_settings where key = 'bank_bic'),
           (select value from app_settings where key = 'bank_name'),
           pl.code
      from payment_orders o where o.reference = ref;
end $$;
revoke execute on function create_payment_order(uuid) from public, anon;
