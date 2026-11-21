-- Bezahlung per Überweisung
-- Verwendungszweck: KT-<Spieler-Code>-<MMJJJJ>, einmalig pro Spieler und Monat.

-- ───────────── Eindeutiges Spieler-Kürzel ─────────────

create or replace function new_player_code() returns text
language plpgsql set search_path = public, extensions as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- ohne 0/O, 1/I
  c text;
begin
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + (get_byte(gen_random_bytes(1), 0) % length(alphabet)), 1);
    end loop;
    exit when not exists (select 1 from players where code = c);
  end loop;
  return c;
end $$;

alter table players add column code text;
update players set code = new_player_code() where code is null;
alter table players alter column code set default new_player_code();
alter table players alter column code set not null;
alter table players add constraint players_code_unique unique (code);

-- ───────────── Einstellungen (vom Admin pflegbar) ─────────────

create table app_settings (
  key text primary key,
  value text not null default '',
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into app_settings (key, value, is_public) values
  ('premium_price_cents', '2000', true),
  ('bank_holder', '', true),
  ('bank_iban', '', true),
  ('bank_bic', '', true),
  ('bank_name', '', true),
  ('support_email', '', true);

alter table app_settings enable row level security;
create policy "Öffentliche Einstellungen lesen" on app_settings for select using (is_public or is_platform_admin());
create policy "Einstellungen pflegen" on app_settings for update using (is_platform_admin());
create trigger app_settings_audit after insert or update on app_settings for each row execute function audit_trigger();
create trigger app_settings_no_delete before delete on app_settings for each row execute function forbid_delete();

-- ───────────── Zahlungsaufträge ─────────────

create type order_status as enum ('offen', 'bezahlt', 'storniert');

create table payment_orders (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id),
  payer_user_id uuid not null references profiles (id),
  reference text not null unique,
  amount_cents int not null,
  status order_status not null default 'offen',
  email_sent_at timestamptz,
  paid_at timestamptz,
  confirmed_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

alter table payment_orders enable row level security;
create policy "Zahlungen lesen" on payment_orders for select
  using (payer_user_id = auth.uid() or can_manage_player(player_id) or is_platform_admin());
create trigger payment_orders_audit after insert or update on payment_orders for each row execute function audit_trigger();
create trigger payment_orders_no_delete before delete on payment_orders for each row execute function forbid_delete();

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

  ref := 'KT-' || pl.code || '-' || to_char(now() at time zone 'Europe/Berlin', 'MMYYYY');
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

-- Admin: Zahlungseingang bestätigen → Premium für 1 Jahr (verlängert ein laufendes Abo)
create or replace function confirm_payment(p_reference text) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  o payment_orders;
  base timestamptz;
  until_ts timestamptz;
begin
  if not is_platform_admin() then raise exception 'Nur für Admins.'; end if;
  select * into o from payment_orders where reference = upper(trim(p_reference));
  if not found then raise exception 'Verwendungszweck nicht gefunden.'; end if;
  if o.status = 'bezahlt' then raise exception 'Diese Zahlung ist bereits bestätigt.'; end if;

  select greatest(now(), coalesce(max(valid_until), now())) into base
    from subscriptions where player_id = o.player_id and status in ('active', 'canceled');
  until_ts := base + interval '1 year';

  insert into subscriptions (player_id, payer_user_id, valid_from, valid_until, provider, provider_ref, amount_cents)
  values (o.player_id, o.payer_user_id, now(), until_ts, 'manual', o.reference, o.amount_cents);

  update payment_orders set status = 'bezahlt', paid_at = now(), confirmed_by = auth.uid() where id = o.id;
  return until_ts;
end $$;
revoke execute on function confirm_payment(text) from public, anon;

-- Admin: offene Zahlungen ansehen
create or replace function admin_open_payments()
returns table (reference text, nickname text, amount_cents int, payer_email text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select o.reference, p.nickname, o.amount_cents, pr.email, o.created_at
    from payment_orders o join players p on p.id = o.player_id join profiles pr on pr.id = o.payer_user_id
   where o.status = 'offen' and is_platform_admin()
   order by o.created_at;
$$;
revoke execute on function admin_open_payments() from public, anon;
