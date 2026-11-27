-- Go4Pro 0018: Verwaltungs-Hierarchie Super-Admin → Bundesland → Verband → Kreis → Verein.
--   Super-Admin:       alles, ernennt weitere Super-Admins, legt Bundesländer an
--   Bundesland-Admin:  legt Verbände an, aktiviert/deaktiviert sie, ernennt Verbands-Admins
--   Verbands-Admin:    legt Kreise an, aktiviert/deaktiviert Kreise und Vereine, ernennt Kreis-Admins
--   Kreis-Admin:       gibt Vereinsanfragen im Kreis frei oder lehnt sie ab
-- Ein Verein meldet sich in Verband + Kreis an. Ist eine Ebene darüber deaktiviert, ist der Verein gesperrt.

create table if not exists org_units (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('bundesland', 'verband', 'kreis')),
  parent_id uuid references org_units (id),
  name text not null check (length(name) between 2 and 120),
  short_name text check (short_name is null or length(short_name) <= 20),
  active boolean not null default true,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  check ((kind = 'bundesland') = (parent_id is null))
);
create unique index if not exists org_units_unique_name on org_units (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
alter table org_units enable row level security;
create policy "Gebiete lesen" on org_units for select to authenticated using (true);

create or replace function org_unit_check() returns trigger
language plpgsql set search_path = public as $$
declare
  pk text;
begin
  select kind into pk from org_units where id = new.parent_id;
  if (new.kind = 'verband' and pk is distinct from 'bundesland') or (new.kind = 'kreis' and pk is distinct from 'verband') then
    raise exception 'Ein Verband gehört zu einem Bundesland, ein Kreis zu einem Verband.';
  end if;
  return new;
end $$;
create trigger org_units_check before insert or update of parent_id, kind on org_units for each row execute function org_unit_check();
create trigger org_units_audit after insert or update on org_units for each row execute function audit_trigger();
create trigger org_units_no_delete before delete on org_units for each row execute function forbid_delete();

create table if not exists org_admins (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references org_units (id),
  user_id uuid not null references profiles (id),
  appointed_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid references profiles (id)
);
create unique index if not exists org_admins_active on org_admins (unit_id, user_id) where ended_at is null;
alter table org_admins enable row level security;  -- Zugriff nur über Funktionen
create trigger org_admins_audit after insert or update on org_admins for each row execute function audit_trigger();
create trigger org_admins_no_delete before delete on org_admins for each row execute function forbid_delete();

alter table clubs add column if not exists kreis_id uuid references org_units (id);
alter table clubs add column if not exists active boolean not null default true;
alter table clubs add column if not exists deactivated_at timestamptz;
alter table clubs add column if not exists deactivated_by uuid references profiles (id);

-- ───────────────────────── Hilfsfunktionen ─────────────────────────

create or replace function unit_ancestors(p_unit uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  with recursive up as (
    select id, parent_id from org_units where id = p_unit
    union all
    select o.id, o.parent_id from org_units o join up on o.id = up.parent_id
  ) select id from up;
$$;

-- Admin dieser Ebene oder einer Ebene darüber (oder Super-Admin)
create or replace function is_unit_admin(p_unit uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_platform_admin() or exists (
    select 1 from org_admins a where a.user_id = auth.uid() and a.ended_at is null
       and a.unit_id in (select unit_ancestors(p_unit)));
$$;

-- Aktivieren/Deaktivieren nur von einer Ebene darüber
create or replace function can_toggle_unit(p_unit uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_platform_admin() or exists (
    select 1 from org_admins a where a.user_id = auth.uid() and a.ended_at is null
       and a.unit_id in (select u from unit_ancestors(p_unit) u where u <> p_unit));
$$;

create or replace function unit_chain_active(p_unit uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from org_units o where o.id in (select unit_ancestors(p_unit)) and not o.active);
$$;

create or replace function club_is_active(p_club uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from clubs c where c.id = p_club and c.active and c.status = 'approved'
                   and (c.kreis_id is null or unit_chain_active(c.kreis_id)));
$$;

-- Verband eines Vereins (über den Kreis)
create or replace function club_verband(p_club uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select k.parent_id from clubs c join org_units k on k.id = c.kreis_id where c.id = p_club;
$$;

-- Vereinsrechte gelten nur, solange der Verein (und Kreis/Verband/Bundesland) aktiv ist
create or replace function is_club_staff(p_club uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select club_is_active(p_club) and exists (
    select 1 from club_memberships
     where club_id = p_club and user_id = auth.uid() and status = 'approved'
       and (valid_to is null or valid_to >= current_date));
$$;

create or replace function is_club_admin(p_club uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select club_is_active(p_club) and exists (
    select 1 from club_memberships
     where club_id = p_club and user_id = auth.uid() and role = 'club_admin' and status = 'approved');
$$;

create or replace function join_team(p_code text, p_player uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  t teams;
  mid uuid;
begin
  if not exists (select 1 from players where id = p_player
                  and (guardian_user_id = auth.uid() or own_user_id = auth.uid())) then
    raise exception 'Nur Eltern oder der Spieler selbst können einem Team beitreten.';
  end if;
  select * into t from teams where join_code = upper(trim(p_code)) and active;
  if not found then raise exception 'Team-Code nicht gefunden.'; end if;
  if not club_is_active(t.club_id) then raise exception 'Dieser Verein ist derzeit nicht freigeschaltet.'; end if;
  insert into team_members (team_id, player_id) values (t.id, p_player)
  on conflict do nothing returning id into mid;
  return mid;
end $$;

-- ───────────────────────── Vereinsanmeldung über Kreis ─────────────────────────

drop function if exists request_club(text, text, text, text, text);
create function request_club(p_name text, p_city text, p_postal text, p_kreis uuid, p_dfb_number text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
  k org_units;
  v org_units;
begin
  if auth.uid() is null then raise exception 'Bitte anmelden.'; end if;
  if length(trim(coalesce(p_name, ''))) < 3 then raise exception 'Bitte den Vereinsnamen angeben.'; end if;
  select * into k from org_units where id = p_kreis and kind = 'kreis';
  if not found or not unit_chain_active(k.id) then raise exception 'Bitte Verband und Kreis auswählen.'; end if;
  select * into v from org_units where id = k.parent_id;
  insert into clubs (name, city, postal_code, association, district, kreis_id, dfb_club_number, created_by)
  values (trim(p_name), nullif(trim(p_city), ''), nullif(trim(p_postal), ''), coalesce(v.short_name, v.name), k.name, k.id,
          nullif(trim(p_dfb_number), ''), auth.uid())
  returning id into cid;
  insert into club_memberships (club_id, user_id, role) values (cid, auth.uid(), 'club_admin');
  return cid;
end $$;

create or replace function list_org_units() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'kind', o.kind, 'parent_id', o.parent_id, 'name', o.name,
                                               'short_name', o.short_name) order by o.kind, o.name), '[]'::jsonb)
    from org_units o where unit_chain_active(o.id);
$$;

-- Offene Anfragen, die ich freigeben darf (Kreis-Admins und darüber)
create or replace function pending_club_requests() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'club_id', c.id, 'name', c.name, 'city', c.city, 'postal', c.postal_code, 'dfb', c.dfb_club_number,
           'kreis', k.name, 'verband', v.name, 'requested_by', pr.email, 'at', c.created_at) order by c.created_at), '[]'::jsonb)
    from clubs c
    left join org_units k on k.id = c.kreis_id
    left join org_units v on v.id = k.parent_id
    left join profiles pr on pr.id = c.created_by
   where c.status = 'pending' and (is_platform_admin() or (c.kreis_id is not null and is_unit_admin(c.kreis_id)));
$$;

create or replace function review_club(p_club uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  c clubs;
begin
  select * into c from clubs where id = p_club;
  if not found then raise exception 'Verein nicht gefunden.'; end if;
  if not (is_platform_admin() or (c.kreis_id is not null and is_unit_admin(c.kreis_id))) then
    raise exception 'Nur Admins des Kreises (oder darüber) können freigeben.';
  end if;
  update clubs set status = case when p_accept then 'approved'::approval_status else 'rejected'::approval_status end,
                   approved_by = auth.uid()
   where id = p_club and status = 'pending';
  update club_memberships set status = case when p_accept then 'approved'::approval_status else 'rejected'::approval_status end,
                              approved_by = auth.uid()
   where club_id = p_club and role = 'club_admin' and status = 'pending';
end $$;

-- Vereine aktivieren/deaktivieren: Verbands-Admins (und darüber)
create or replace function set_club_active(p_club uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  vb uuid := club_verband(p_club);
begin
  if not (is_platform_admin() or (vb is not null and is_unit_admin(vb))) then
    raise exception 'Vereine aktivieren/deaktivieren können Verbands-Admins.';
  end if;
  update clubs set active = p_active,
                   deactivated_at = case when p_active then null else now() end,
                   deactivated_by = case when p_active then null else auth.uid() end
   where id = p_club;
end $$;

-- ───────────────────────── Gebiete und Admins verwalten ─────────────────────────

create or replace function create_org_unit(p_kind text, p_parent uuid, p_name text, p_short text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  nid uuid;
begin
  if p_kind = 'bundesland' then
    if not is_platform_admin() then raise exception 'Bundesländer legen Super-Admins an.'; end if;
  elsif p_kind in ('verband', 'kreis') then
    if p_parent is null or not is_unit_admin(p_parent) then raise exception 'Keine Berechtigung für diese Ebene.'; end if;
  else
    raise exception 'Unbekannte Ebene.';
  end if;
  insert into org_units (kind, parent_id, name, short_name, created_by)
  values (p_kind, case when p_kind = 'bundesland' then null else p_parent end, trim(p_name), nullif(trim(p_short), ''), auth.uid())
  returning id into nid;
  return nid;
end $$;

create or replace function set_unit_active(p_unit uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_toggle_unit(p_unit) then
    raise exception 'Aktivieren/Deaktivieren kann nur die Ebene darüber.';
  end if;
  update org_units set active = p_active where id = p_unit;
end $$;

create or replace function add_org_admin(p_unit uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
begin
  if not is_unit_admin(p_unit) then raise exception 'Keine Berechtigung für diese Ebene.'; end if;
  select id into uid from profiles where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'Diese Person muss sich zuerst mit der E-Mail-Adresse bei Go4Pro anmelden.'; end if;
  if exists (select 1 from org_admins where unit_id = p_unit and user_id = uid and ended_at is null) then
    raise exception 'Diese Person ist hier schon Admin.';
  end if;
  insert into org_admins (unit_id, user_id, appointed_by) values (p_unit, uid, auth.uid());
end $$;

create or replace function remove_org_admin(p_admin uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  a org_admins;
begin
  select * into a from org_admins where id = p_admin and ended_at is null;
  if not found then raise exception 'Nicht gefunden.'; end if;
  if not is_unit_admin(a.unit_id) then raise exception 'Keine Berechtigung.'; end if;
  update org_admins set ended_at = now(), ended_by = auth.uid() where id = p_admin;
end $$;

-- Super-Admins ernennen/entfernen (nur Super-Admins, nicht sich selbst entfernen)
create or replace function set_super_admin(p_email text, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
begin
  if not is_platform_admin() then raise exception 'Nur Super-Admins.'; end if;
  select id into uid from profiles where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'Diese Person muss sich zuerst mit der E-Mail-Adresse bei Go4Pro anmelden.'; end if;
  if uid = auth.uid() and not p_on then raise exception 'Du kannst dich nicht selbst entfernen.'; end if;
  update profiles set role = case when p_on then 'platform_admin'::app_role else 'user'::app_role end where id = uid;
end $$;

create or replace function super_admins() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when is_platform_admin() then
    coalesce((select jsonb_agg(jsonb_build_object('id', id, 'email', email, 'name', display_name, 'me', id = auth.uid()) order by email)
                from profiles where role = 'platform_admin'), '[]'::jsonb) end;
$$;

-- Meine Verwaltungs-Bereiche
create or replace function my_admin_scope() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'super', is_platform_admin(),
    'units', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'kind', o.kind, 'name', o.name, 'short_name', o.short_name,
                                                          'active', o.active, 'parent', p.name) order by o.kind, o.name)
                         from org_admins a join org_units o on o.id = a.unit_id left join org_units p on p.id = o.parent_id
                        where a.user_id = auth.uid() and a.ended_at is null), '[]'::jsonb),
    'bundeslaender', case when is_platform_admin() then
       coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'kind', o.kind, 'name', o.name, 'short_name', o.short_name,
                                                    'active', o.active,
                                                    'children', (select count(*) from org_units c where c.parent_id = o.id)) order by o.name)
                   from org_units o where o.kind = 'bundesland'), '[]'::jsonb) end,
    'pending', jsonb_array_length(pending_club_requests()));
$$;

-- Details einer Ebene: Pfad, Unterebenen, Admins, Vereine, offene Anfragen
create or replace function org_unit_detail(p_unit uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  u org_units;
  res jsonb;
begin
  if not is_unit_admin(p_unit) then raise exception 'Keine Berechtigung.'; end if;
  select * into u from org_units where id = p_unit;
  if not found then raise exception 'Nicht gefunden.'; end if;

  select jsonb_build_object(
    'unit', jsonb_build_object('id', u.id, 'kind', u.kind, 'name', u.name, 'short_name', u.short_name, 'active', u.active,
                               'chain_active', unit_chain_active(u.id), 'can_toggle', can_toggle_unit(u.id)),
    'path', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'kind', o.kind, 'name', o.name)
                                      order by case o.kind when 'bundesland' then 1 when 'verband' then 2 else 3 end), '[]'::jsonb)
               from org_units o where o.id in (select unit_ancestors(u.id)) and o.id <> u.id),
    'children', (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', c.id, 'kind', c.kind, 'name', c.name, 'short_name', c.short_name, 'active', c.active,
                   'admins', (select count(*) from org_admins a where a.unit_id = c.id and a.ended_at is null),
                   'clubs', (select count(*) from clubs cl where cl.kreis_id = c.id or cl.kreis_id in (select id from org_units k where k.parent_id = c.id)))
                   order by c.name), '[]'::jsonb)
                   from org_units c where c.parent_id = u.id),
    'admins', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'email', p.email, 'name', p.display_name,
                                                           'me', a.user_id = auth.uid(), 'since', a.created_at) order by p.email), '[]'::jsonb)
                 from org_admins a join profiles p on p.id = a.user_id where a.unit_id = u.id and a.ended_at is null),
    'clubs', case when u.kind in ('verband', 'kreis') then
               (select coalesce(jsonb_agg(jsonb_build_object(
                  'id', cl.id, 'name', cl.name, 'city', cl.city, 'status', cl.status, 'active', cl.active, 'kreis', k.name,
                  'teams', (select count(*) from teams t where t.club_id = cl.id and t.active)) order by cl.name), '[]'::jsonb)
                  from clubs cl join org_units k on k.id = cl.kreis_id
                 where cl.status <> 'pending' and (cl.kreis_id = u.id or k.parent_id = u.id)) end,
    'can_toggle_clubs', is_platform_admin() or (u.kind = 'verband' and is_unit_admin(u.id))
                        or (u.kind = 'kreis' and u.parent_id is not null and is_unit_admin(u.parent_id)),
    'pending', (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(pending_club_requests()) x
                 where (select kreis_id from clubs where id = (x ->> 'club_id')::uuid) in
                       (select id from org_units where id = u.id or parent_id = u.id
                        or parent_id in (select id from org_units where parent_id = u.id))))
  into res;
  return res;
end $$;

revoke execute on function unit_ancestors(uuid), is_unit_admin(uuid), can_toggle_unit(uuid), unit_chain_active(uuid),
  club_is_active(uuid), club_verband(uuid) from public, anon;
grant execute on function is_unit_admin(uuid), club_is_active(uuid) to authenticated;
revoke execute on function request_club(text, text, text, uuid, text), list_org_units(), pending_club_requests(),
  review_club(uuid, boolean), set_club_active(uuid, boolean), create_org_unit(text, uuid, text, text),
  set_unit_active(uuid, boolean), add_org_admin(uuid, text), remove_org_admin(uuid), set_super_admin(text, boolean),
  super_admins(), my_admin_scope(), org_unit_detail(uuid) from public, anon;
grant execute on function request_club(text, text, text, uuid, text), list_org_units(), pending_club_requests(),
  review_club(uuid, boolean), set_club_active(uuid, boolean), create_org_unit(text, uuid, text, text),
  set_unit_active(uuid, boolean), add_org_admin(uuid, text), remove_org_admin(uuid), set_super_admin(text, boolean),
  super_admins(), my_admin_scope(), org_unit_detail(uuid) to authenticated;

-- ───────────────────────── Bundesländer und Landesverbände (DFB-Struktur) ─────────────────────────
-- Kreise legen die Verbands-Admins an (bzw. werden mit den Daten eines Kreises importiert).
do $$
declare
  bl record;
  bid uuid;
  data constant jsonb := '{
    "Baden-Württemberg": [["Badischer Fußballverband","bfv"],["Südbadischer Fußball-Verband","SBFV"],["Württembergischer Fußballverband","WFV"]],
    "Bayern": [["Bayerischer Fußball-Verband","BFV"]],
    "Berlin": [["Berliner Fußball-Verband","BFV"]],
    "Brandenburg": [["Fußball-Landesverband Brandenburg","FLB"]],
    "Bremen": [["Bremer Fußball-Verband","BFV"]],
    "Hamburg": [["Hamburger Fußball-Verband","HFV"]],
    "Hessen": [["Hessischer Fußball-Verband","HFV"]],
    "Mecklenburg-Vorpommern": [["Landesfußballverband Mecklenburg-Vorpommern","LFV MV"]],
    "Niedersachsen": [["Niedersächsischer Fußballverband","NFV"]],
    "Nordrhein-Westfalen": [["Fußball-Verband Mittelrhein","FVM"],["Fußballverband Niederrhein","FVN"],["Fußball- und Leichtathletik-Verband Westfalen","FLVW"]],
    "Rheinland-Pfalz": [["Fußballverband Rheinland","FVR"],["Südwestdeutscher Fußballverband","SWFV"]],
    "Saarland": [["Saarländischer Fußballverband","SFV"]],
    "Sachsen": [["Sächsischer Fußball-Verband","SFV"]],
    "Sachsen-Anhalt": [["Fußballverband Sachsen-Anhalt","FSA"]],
    "Schleswig-Holstein": [["Schleswig-Holsteinischer Fußballverband","SHFV"]],
    "Thüringen": [["Thüringer Fußball-Verband","TFV"]]
  }';
  v jsonb;
begin
  for bl in select key, value from jsonb_each(data) loop
    select id into bid from org_units where kind = 'bundesland' and name = bl.key;
    if bid is null then
      insert into org_units (kind, name) values ('bundesland', bl.key) returning id into bid;
    end if;
    for v in select * from jsonb_array_elements(bl.value) loop
      if not exists (select 1 from org_units where parent_id = bid and name = v ->> 0) then
        insert into org_units (kind, parent_id, name, short_name) values ('verband', bid, v ->> 0, v ->> 1);
      end if;
    end loop;
  end loop;
end $$;
