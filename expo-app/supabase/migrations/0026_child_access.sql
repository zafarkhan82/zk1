-- Go4Pro 0026: Eigenes Login auch für Spieler*innen unter 16 – mit Zustimmung der Eltern (DSGVO Art. 8).
--   Eltern legen das Kind an und laden es per E-Mail ein (Double-Opt-In). Das Kind trackt sich selbst und bewertet andere.
--   Veröffentlichung (Ranglisten, QR-Karte) bleibt bei unter 16-Jährigen Sache der Eltern.

-- Eigenes Konto: ab 16 allein, darunter nur zusätzlich zu einem Elternkonto
create or replace function check_player_age() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.own_user_id is not null and new.guardian_user_id is null
     and extract(year from (now() at time zone 'Europe/Berlin'))::int - new.birth_year < 17 then
    raise exception 'Unter 16 richten die Eltern den Zugang ein: Elternkonto anlegen, Kind anlegen, „Eigenen Zugang einrichten“.';
  end if;
  if age_group(new.birth_year) is null and tg_op = 'INSERT' then
    raise exception 'Go4Pro ist für die E- bis A-Jugend gedacht.';
  end if;
  return new;
end $$;

-- Zustimmungen: bei unter 16-Jährigen mit Elternkonto nur durch die Eltern
create or replace function protect_consent() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.usage_consent_at, new.public_consent_at) is distinct from (old.usage_consent_at, old.public_consent_at)
     and auth.uid() is not null
     and coalesce(current_setting('kick.anonymizing', true), '') <> 'on' then
    if old.guardian_user_id is not null and auth.uid() = old.own_user_id
       and extract(year from (now() at time zone 'Europe/Berlin'))::int - old.birth_year < 17 then
      raise exception 'Über die Veröffentlichung entscheiden deine Eltern.';
    end if;
    if auth.uid() is distinct from old.guardian_user_id and auth.uid() is distinct from old.own_user_id then
      raise exception 'Zustimmungen können nur Eltern bzw. der Spieler selbst ändern.';
    end if;
  end if;
  return new;
end $$;

-- Konto-Zuordnung bleibt geschützt – außer beim Annehmen eines Kinder-Zugangs
create or replace function protect_player_identity() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('kick.anonymizing', true), '') = 'on' then return new; end if;
  if coalesce(current_setting('kick.player_access', true), '') = 'on'
     and old.own_user_id is null and new.own_user_id is not null
     and (new.guardian_user_id, new.code, new.created_at) is not distinct from (old.guardian_user_id, old.code, old.created_at) then
    return new;
  end if;
  if (new.guardian_user_id, new.own_user_id, new.code, new.created_at)
     is distinct from (old.guardian_user_id, old.own_user_id, old.code, old.created_at)
     and not is_platform_admin() then
    raise exception 'Konto-Zuordnung und Spieler-Code können nicht geändert werden.';
  end if;
  return new;
end $$;

-- Einladungen: neue Art „player_access“ (Ziel = Spieler*in)
alter table admin_invites drop constraint if exists admin_invites_kind_check;
alter table admin_invites add constraint admin_invites_kind_check check (kind in ('club_admin', 'org_admin', 'super_admin', 'player_access'));

create or replace function can_invite(p_kind text, p_target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_kind
    when 'super_admin' then is_platform_admin()
    when 'org_admin' then is_unit_admin(p_target)
    when 'club_admin' then is_platform_admin() or is_club_admin(p_target)
                           or exists (select 1 from clubs c where c.id = p_target and c.kreis_id is not null and is_unit_admin(c.kreis_id))
    when 'player_access' then exists (select 1 from players p where p.id = p_target and p.guardian_user_id = auth.uid()
                                        and p.own_user_id is null and p.anonymized_at is null)
    else false end;
$$;

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
  if p_kind = 'player_access' and lower(trim(p_email)) = lower((select email from profiles where id = auth.uid())) then
    raise exception 'Bitte die eigene E-Mail-Adresse des Kindes angeben (nicht deine).';
  end if;
  if (select count(*) from admin_invites where invited_by = auth.uid() and created_at > now() - interval '1 day') >= 100 then
    raise exception 'Heute wurden schon sehr viele Einladungen verschickt. Bitte morgen weitermachen.';
  end if;
  tok := encode(gen_random_bytes(24), 'hex');
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
    when 'player_access' then (select nickname from players where id = p_target)
    else 'Go4Pro' end;
  return jsonb_build_object('id', iid, 'token', tok, 'target_name', tname,
                            'inviter', (select display_name from profiles where id = auth.uid()));
end $$;

create or replace function invite_info(p_token text) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select case when i.id is null then jsonb_build_object('found', false) else jsonb_build_object(
    'found', true, 'kind', i.kind, 'name', i.name,
    'email_hint', left(i.email, 2) || '…@' || split_part(i.email, '@', 2),
    'target_name', case i.kind
       when 'club_admin' then (select name from clubs where id = i.target_id)
       when 'org_admin' then (select coalesce(short_name || ' · ', '') || name from org_units where id = i.target_id)
       when 'player_access' then (select nickname from players where id = i.target_id)
       else 'Go4Pro' end,
    'status', case when i.accepted_at is not null then 'angenommen' when i.revoked_at is not null then 'zurückgezogen'
                   when i.expires_at < now() then 'abgelaufen' else 'offen' end,
    'email_matches', auth.uid() is not null and lower(coalesce((select email from profiles where id = auth.uid()), '')) = i.email) end
  from (select 1) d left join admin_invites i on i.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

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
  elsif i.kind = 'player_access' then
    if exists (select 1 from players where id = i.target_id and guardian_user_id = auth.uid()) then
      raise exception 'Das ist das Elternkonto. Bitte mit der E-Mail des Kindes anmelden.';
    end if;
    perform set_config('kick.player_access', 'on', true);
    update players set own_user_id = auth.uid() where id = i.target_id and own_user_id is null;
    if not found then raise exception 'Für dieses Profil gibt es schon einen eigenen Zugang.'; end if;
    update profiles set app_mode = 'spieler' where id = auth.uid() and app_mode is null;
  else
    update profiles set role = 'platform_admin' where id = auth.uid();
  end if;
  update profiles set display_name = i.name where id = auth.uid() and display_name = split_part(email, '@', 1);
  update admin_invites set accepted_at = now(), accepted_by = auth.uid() where id = i.id;
  return jsonb_build_object('kind', i.kind, 'target_id', i.target_id);
end $$;

-- Kind ohne Elternkonto bittet die Eltern um Zugang (Mail über Edge Function request-parent; hier nur Protokoll + Limit)
create table if not exists parent_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references profiles (id),
  parent_email text not null,
  child_name text not null,
  created_at timestamptz not null default now()
);
alter table parent_requests enable row level security;

create or replace function log_parent_request(p_parent_email text, p_child_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Bitte anmelden.'; end if;
  if p_parent_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'Bitte eine gültige E-Mail der Eltern angeben.'; end if;
  if lower(trim(p_parent_email)) = lower((select email from profiles where id = auth.uid())) then
    raise exception 'Bitte die E-Mail-Adresse deiner Eltern angeben, nicht deine eigene.';
  end if;
  if (select count(*) from parent_requests where requested_by = auth.uid() and created_at > now() - interval '1 day') >= 3 then
    raise exception 'Heute wurden schon 3 Anfragen verschickt. Bitte morgen noch einmal.';
  end if;
  insert into parent_requests (requested_by, parent_email, child_name) values (auth.uid(), lower(trim(p_parent_email)), trim(p_child_name));
end $$;

revoke execute on function log_parent_request(text, text) from public, anon;
grant execute on function log_parent_request(text, text) to authenticated;
