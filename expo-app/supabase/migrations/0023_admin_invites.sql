-- Go4Pro 0023: Admin-Rollen nur noch per Einladung mit Bestätigung (Double-Opt-In).
--   1. Berechtigte Person lädt per Name + E-Mail ein → Mail mit persönlichem Link (Edge Function send-invite)
--   2. Eingeladene Person meldet sich mit GENAU dieser E-Mail an (Code per Mail = zweite Bestätigung)
--   3. und nimmt die Einladung ausdrücklich an → erst dann wird die Rolle vergeben.
-- Arten: club_admin (Vereins-Admin), org_admin (Bundesland/Verband/Kreis), super_admin.

create table if not exists admin_invites (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('club_admin', 'org_admin', 'super_admin')),
  target_id uuid,                                        -- Verein bzw. Gebiet; null bei super_admin
  email text not null check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  name text not null check (length(name) between 2 and 100),
  token_hash text not null unique,
  invited_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  sent_at timestamptz,
  send_count int not null default 0,
  accepted_at timestamptz,
  accepted_by uuid references profiles (id),
  revoked_at timestamptz,
  check ((kind = 'super_admin') = (target_id is null))
);
create index if not exists admin_invites_target on admin_invites (kind, target_id);
alter table admin_invites enable row level security;   -- Zugriff nur über Funktionen
drop trigger if exists admin_invites_audit on admin_invites;
create trigger admin_invites_audit after insert or update on admin_invites for each row execute function audit_trigger();
drop trigger if exists admin_invites_no_delete on admin_invites;
create trigger admin_invites_no_delete before delete on admin_invites for each row execute function forbid_delete();

-- Wer darf für dieses Ziel einladen?
create or replace function can_invite(p_kind text, p_target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_kind
    when 'super_admin' then is_platform_admin()
    when 'org_admin' then is_unit_admin(p_target)
    when 'club_admin' then is_platform_admin() or is_club_admin(p_target)
                           or exists (select 1 from clubs c where c.id = p_target and c.kreis_id is not null and is_unit_admin(c.kreis_id))
    else false end;
$$;

-- Einladung anlegen bzw. erneuern. Gibt den Link-Schlüssel nur einmal zurück (für den Mailversand).
create or replace function create_invite(p_kind text, p_target uuid, p_email text, p_name text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  tok text;
  iid uuid;
  tname text;
begin
  if not can_invite(p_kind, p_target) then raise exception 'Keine Berechtigung für diese Einladung.'; end if;
  if p_kind = 'club_admin' and not exists (select 1 from clubs where id = p_target) then raise exception 'Verein nicht gefunden.'; end if;
  if p_kind = 'org_admin' and not exists (select 1 from org_units where id = p_target) then raise exception 'Gebiet nicht gefunden.'; end if;
  if (select count(*) from admin_invites where invited_by = auth.uid() and created_at > now() - interval '1 day') >= 100 then
    raise exception 'Heute wurden schon sehr viele Einladungen verschickt. Bitte morgen weitermachen.';
  end if;
  tok := encode(gen_random_bytes(24), 'hex');
  -- offene Einladung derselben Person für dasselbe Ziel ersetzen
  update admin_invites set revoked_at = now()
   where kind = p_kind and target_id is not distinct from p_target and lower(email) = lower(trim(p_email))
     and accepted_at is null and revoked_at is null;
  insert into admin_invites (kind, target_id, email, name, token_hash, invited_by)
  values (p_kind, case when p_kind = 'super_admin' then null else p_target end, lower(trim(p_email)), trim(p_name),
          encode(digest(tok, 'sha256'), 'hex'), auth.uid())
  returning id into iid;
  tname := case p_kind
    when 'club_admin' then (select name from clubs where id = p_target)
    when 'org_admin' then (select coalesce(short_name || ' · ', '') || name from org_units where id = p_target)
    else 'Go4Pro' end;
  return jsonb_build_object('id', iid, 'token', tok, 'target_name', tname,
                            'inviter', (select display_name from profiles where id = auth.uid()));
end $$;

create or replace function mark_invite_sent(p_invite uuid) returns void
language sql security definer set search_path = public as $$
  update admin_invites set sent_at = now(), send_count = send_count + 1 where id = p_invite and invited_by = auth.uid();
$$;

-- Infos zur Einladung (für die Bestätigungsseite – auch ohne Anmeldung, ohne persönliche Daten Dritter)
create or replace function invite_info(p_token text) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select case when i.id is null then jsonb_build_object('found', false) else jsonb_build_object(
    'found', true, 'kind', i.kind, 'name', i.name,
    'email_hint', left(i.email, 2) || '…@' || split_part(i.email, '@', 2),
    'target_name', case i.kind
       when 'club_admin' then (select name from clubs where id = i.target_id)
       when 'org_admin' then (select coalesce(short_name || ' · ', '') || name from org_units where id = i.target_id)
       else 'Go4Pro' end,
    'status', case when i.accepted_at is not null then 'angenommen' when i.revoked_at is not null then 'zurückgezogen'
                   when i.expires_at < now() then 'abgelaufen' else 'offen' end,
    'email_matches', auth.uid() is not null and lower(coalesce((select email from profiles where id = auth.uid()), '')) = i.email) end
  from (select 1) d left join admin_invites i on i.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

-- Einladung annehmen: nur angemeldet und nur mit der eingeladenen E-Mail-Adresse
create or replace function accept_invite(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  i admin_invites;
  em text := lower(coalesce((select email from profiles where id = auth.uid()), ''));
begin
  if auth.uid() is null then raise exception 'Bitte zuerst anmelden.'; end if;
  select * into i from admin_invites where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if not found then raise exception 'Diese Einladung gibt es nicht.'; end if;
  if i.accepted_at is not null then raise exception 'Diese Einladung wurde bereits angenommen.'; end if;
  if i.revoked_at is not null then raise exception 'Diese Einladung wurde zurückgezogen.'; end if;
  if i.expires_at < now() then raise exception 'Diese Einladung ist abgelaufen. Bitte neu einladen lassen.'; end if;
  if em <> i.email then
    raise exception 'Bitte mit der eingeladenen E-Mail-Adresse anmelden (%).', left(i.email, 2) || '…@' || split_part(i.email, '@', 2);
  end if;

  if i.kind = 'club_admin' then
    if not exists (select 1 from club_memberships where club_id = i.target_id and user_id = auth.uid() and role = 'club_admin'
                     and status = 'approved' and (valid_to is null or valid_to >= current_date)) then
      insert into club_memberships (club_id, user_id, role, status, approved_by)
      values (i.target_id, auth.uid(), 'club_admin', 'approved', i.invited_by);
    end if;
  elsif i.kind = 'org_admin' then
    if not exists (select 1 from org_admins where unit_id = i.target_id and user_id = auth.uid() and ended_at is null) then
      insert into org_admins (unit_id, user_id, appointed_by) values (i.target_id, auth.uid(), i.invited_by);
    end if;
  else
    update profiles set role = 'platform_admin' where id = auth.uid();
  end if;
  update profiles set display_name = i.name where id = auth.uid() and display_name = split_part(email, '@', 1);
  update admin_invites set accepted_at = now(), accepted_by = auth.uid() where id = i.id;
  return jsonb_build_object('kind', i.kind, 'target_id', i.target_id);
end $$;

create or replace function list_invites(p_kind text, p_target uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when can_invite(p_kind, p_target) then coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'email', email, 'name', name, 'created_at', created_at, 'sent_at', sent_at, 'send_count', send_count,
           'status', case when accepted_at is not null then 'angenommen' when revoked_at is not null then 'zurückgezogen'
                          when expires_at < now() then 'abgelaufen' else 'offen' end) order by created_at desc), '[]'::jsonb) end
    from admin_invites where kind = p_kind and target_id is not distinct from p_target and revoked_at is null;
$$;

create or replace function revoke_invite(p_invite uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  i admin_invites;
begin
  select * into i from admin_invites where id = p_invite;
  if not found or not can_invite(i.kind, i.target_id) then raise exception 'Keine Berechtigung.'; end if;
  update admin_invites set revoked_at = now() where id = p_invite and accepted_at is null;
end $$;

-- Direktes Ernennen ist abgeschaltet – nur noch per Einladung
create or replace function add_org_admin(p_unit uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Admins werden per Einladung mit Bestätigung ernannt.';
end $$;

create or replace function set_super_admin(p_email text, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
begin
  if not is_platform_admin() then raise exception 'Nur Super-Admins.'; end if;
  if p_on then raise exception 'Super-Admins werden per Einladung mit Bestätigung ernannt.'; end if;
  select id into uid from profiles where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'Nicht gefunden.'; end if;
  if uid = auth.uid() then raise exception 'Du kannst dich nicht selbst entfernen.'; end if;
  update profiles set role = 'user' where id = uid;
end $$;

-- Vereine des Kreises mit Admin-Status (für „Admin einladen“)
create or replace function kreis_clubs_admins(p_kreis uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when is_unit_admin(p_kreis) then coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'name', c.name, 'active', c.active,
           'admins', (select coalesce(jsonb_agg(jsonb_build_object('name', p.display_name, 'email', p.email)), '[]'::jsonb)
                        from club_memberships m join profiles p on p.id = m.user_id
                       where m.club_id = c.id and m.role = 'club_admin' and m.status = 'approved'
                         and (m.valid_to is null or m.valid_to >= current_date)),
           'invites', (select count(*) from admin_invites i where i.kind = 'club_admin' and i.target_id = c.id
                         and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()))
           order by c.name), '[]'::jsonb) end
    from clubs c where c.kreis_id = p_kreis and c.status = 'approved';
$$;

revoke execute on function can_invite(text, uuid) from public, anon;
revoke execute on function create_invite(text, uuid, text, text), mark_invite_sent(uuid), accept_invite(text),
  list_invites(text, uuid), revoke_invite(uuid), kreis_clubs_admins(uuid) from public, anon;
grant execute on function create_invite(text, uuid, text, text), mark_invite_sent(uuid), accept_invite(text),
  list_invites(text, uuid), revoke_invite(uuid), kreis_clubs_admins(uuid), can_invite(text, uuid) to authenticated;
revoke execute on function invite_info(text) from public;
grant execute on function invite_info(text) to anon, authenticated;

-- ───────────────────────── Vereinsimport: nur Namen, ohne Mannschaftszusätze, jeder Verein einmal ─────────────────────────

-- „TSV Heusenstamm II“, „SV Dreieich 2“, „FC Offenbach 3“ → Vereinsname ohne Zusatz
create or replace function strip_team_suffix(p_name text) returns text
language sql immutable as $$
  select trim(regexp_replace(trim(coalesce(p_name, '')), '\s+(I{1,3}|IV|V|VI{0,3}|[1-9]|[1-9]\.\s*Mannschaft)$', '', 'i'));
$$;

drop function if exists import_clubs(uuid, jsonb, uuid);
create function import_clubs(p_kreis uuid, p_clubs jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  kr org_units;
  vb org_units;
  nm text;
  cid uuid;
  is_new boolean;
  done text[] := '{}';
  res jsonb := '[]'::jsonb;
  n_new int := 0;
begin
  select * into kr from org_units where id = p_kreis and kind = 'kreis';
  if not found then raise exception 'Kreis nicht gefunden.'; end if;
  if not is_unit_admin(p_kreis) then raise exception 'Nur Admins des Kreises (oder darüber).'; end if;
  select * into vb from org_units where id = kr.parent_id;
  if jsonb_typeof(p_clubs) <> 'array' or jsonb_array_length(p_clubs) > 500 then
    raise exception 'Bitte höchstens 500 Vereine auf einmal übernehmen.';
  end if;

  for nm in select strip_team_suffix(coalesce(e ->> 'name', e #>> '{}')) from jsonb_array_elements(p_clubs) e loop
    continue when length(nm) < 3 or lower(nm) = any(done);
    done := done || lower(nm);
    select id into cid from clubs where kreis_id = p_kreis and lower(name) = lower(nm) limit 1;
    is_new := cid is null;
    if is_new then
      insert into clubs (name, association, district, kreis_id, status, approved_by, created_by)
      values (nm, coalesce(vb.short_name, vb.name), kr.name, p_kreis, 'approved', auth.uid(), auth.uid())
      returning id into cid;
      n_new := n_new + 1;
    end if;
    res := res || jsonb_build_object('id', cid, 'name', nm, 'new', is_new);
  end loop;
  return jsonb_build_object('clubs_new', n_new, 'clubs_total', jsonb_array_length(res), 'clubs', res);
end $$;
revoke execute on function import_clubs(uuid, jsonb) from public, anon;
grant execute on function import_clubs(uuid, jsonb) to authenticated;
