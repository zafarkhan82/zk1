-- Go4Pro 0019: Staffeln je Kreis (DFB-Staffel-Kennung + fussball.de-Schlüssel) und Import der offiziellen
-- DFB-Sportmedia-Dateien (XML Version 2 und 3: Spielplan bzw. Ergebnisse/Tabelle).
-- Feste Schlüssel: Verein = DFB-Vereins-ID (XML3), Mannschaft = 32-stellige DFB-Mannschafts-ID, Spiel = DFB-Spiel-ID.
-- Spieler*innen werden nie automatisch angelegt; Kader/Aufstellungen werden nicht übernommen.

create table if not exists staffeln (
  id uuid primary key default gen_random_uuid(),
  kreis_id uuid not null references org_units (id),
  age_group text not null check (age_group in ('E', 'D', 'C', 'B', 'A')),
  art text not null default 'Liga',
  name text not null,
  kennung int,                                   -- 6-stellige Staffel-Kennung (DFBnet/Sportmedia), je Saison
  fussballde_key text unique,                    -- Schlüssel aus der fussball.de-Adresse
  season text not null default current_season(),
  team_count int,
  active boolean not null default true,
  last_import_at timestamptz,
  last_import_info jsonb,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);
create unique index if not exists staffeln_kennung on staffeln (season, kennung) where kennung is not null;
alter table staffeln enable row level security;
drop trigger if exists staffeln_audit on staffeln;
create trigger staffeln_audit after insert or update on staffeln for each row execute function audit_trigger();
drop trigger if exists staffeln_no_delete on staffeln;
create trigger staffeln_no_delete before delete on staffeln for each row execute function forbid_delete();

alter table teams add column if not exists staffel_id uuid references staffeln (id);

create table if not exists league_tables (
  staffel_id uuid not null references staffeln (id),
  team_key text not null,                        -- DFB-Mannschafts-ID
  team_id uuid references teams (id),
  team_name text not null,
  platz int,
  spiele int, gewonnen int, unentschieden int, verloren int,
  tore_plus int, tore_minus int, punkte int,
  updated_at timestamptz not null default now(),
  primary key (staffel_id, team_key)
);
alter table league_tables enable row level security;
drop policy if exists "Tabellen lesen" on league_tables;
create policy "Tabellen lesen" on league_tables for select to authenticated using (true);

-- ───────────────────────── Staffeln verwalten (Kreis-Admins und darüber) ─────────────────────────

create or replace function kreis_staffeln(p_kreis uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when is_unit_admin(p_kreis) then coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'age_group', s.age_group, 'art', s.art, 'name', s.name, 'kennung', s.kennung,
           'fussballde_key', s.fussballde_key, 'season', s.season, 'team_count', s.team_count, 'active', s.active,
           'last_import_at', s.last_import_at, 'last_import_info', s.last_import_info,
           'teams', (select count(*) from teams t where t.staffel_id = s.id))
           order by s.age_group desc, s.art, s.name), '[]'::jsonb) end
    from staffeln s where s.kreis_id = p_kreis;
$$;

create or replace function save_staffel(p_id uuid, p_kreis uuid, p_age text, p_art text, p_name text, p_kennung int,
                                        p_key text, p_active boolean default true) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  sid uuid := p_id;
  k uuid := coalesce(p_kreis, (select kreis_id from staffeln where id = p_id));
begin
  if k is null or not is_unit_admin(k) or (select kind from org_units where id = k) <> 'kreis' then
    raise exception 'Staffeln pflegen Kreis-Admins (oder darüber).';
  end if;
  if sid is null then
    insert into staffeln (kreis_id, age_group, art, name, kennung, fussballde_key, active, created_by)
    values (k, upper(p_age), coalesce(nullif(trim(p_art), ''), 'Liga'), trim(p_name), p_kennung, nullif(trim(p_key), ''),
            coalesce(p_active, true), auth.uid())
    returning id into sid;
  else
    update staffeln set age_group = upper(p_age), art = coalesce(nullif(trim(p_art), ''), art), name = trim(p_name),
                        kennung = p_kennung, fussballde_key = nullif(trim(p_key), ''), active = coalesce(p_active, active)
     where id = sid and kreis_id = k;
  end if;
  return sid;
end $$;

-- Tabelle der Staffel eines Teams (für den Team-Bereich)
create or replace function team_table(p_team uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'staffel', (select jsonb_build_object('name', s.name, 'art', s.art, 'age_group', s.age_group, 'updated', s.last_import_at)
                  from staffeln s where s.id = t.staffel_id),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('platz', l.platz, 'team', l.team_name, 'spiele', l.spiele,
                       'tore', l.tore_plus || ':' || l.tore_minus, 'diff', l.tore_plus - l.tore_minus, 'punkte', l.punkte,
                       'mine', l.team_id = t.id) order by l.platz)
                       from league_tables l where l.staffel_id = t.staffel_id), '[]'::jsonb))
    from teams t where t.id = p_team;
$$;

-- ───────────────────────── Import der DFB-Datei ─────────────────────────

-- Vereinsname aus dem Mannschaftsnamen (nur falls die Datei keine Vereinsdaten enthält, z. B. XML2)
create or replace function club_name_from_team(p_team text) returns text
language sql immutable as $$
  select trim(regexp_replace(regexp_replace(coalesce(p_team, ''), '\s*\([^)]*\)\s*$', ''),
                             '\s+(I{1,3}|IV|[2-9]|U\s?\d{1,2}|[A-E][1-9]?)$', ''));
$$;

create or replace function parse_de_date(p_date text, p_time text) returns timestamptz
language plpgsql immutable as $$
declare
  d date;
begin
  if p_date ~ '^\d{4}-\d{2}-\d{2}' then
    d := substr(p_date, 1, 10)::date;
  elsif p_date ~ '\d{2}\.\d{2}\.\d{4}' then
    d := to_date(substring(p_date from '\d{2}\.\d{2}\.\d{4}'), 'DD.MM.YYYY');
  else
    return null;
  end if;
  return ((d::text || ' ' || coalesce(nullif(substr(coalesce(p_time, ''), 1, 5), ''), '00:00'))::timestamp) at time zone 'Europe/Berlin';
end $$;

create or replace function import_staffel_xml(p_staffel uuid, p_xml text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  st staffeln;
  kr org_units;
  vb org_units;
  doc xml;
  root text;
  v3 boolean;
  m record;
  t record;
  cid uuid;
  tid uuid;
  n_clubs int := 0;
  n_teams int := 0;
  n_matches int := 0;
  n_table int := 0;
  ext text;
  league_label text;
begin
  select * into st from staffeln where id = p_staffel;
  if not found then raise exception 'Staffel nicht gefunden.'; end if;
  if not is_unit_admin(st.kreis_id) then raise exception 'Nur Kreis-Admins (oder darüber).'; end if;
  select * into kr from org_units where id = st.kreis_id;
  select * into vb from org_units where id = kr.parent_id;
  league_label := st.age_group || '-Junioren ' || st.name;

  -- Namensräume und Kopfzeile entfernen, damit XPath einfach bleibt
  begin
    doc := xmlparse(document regexp_replace(regexp_replace(regexp_replace(p_xml, '<\?xml[^>]*\?>', ''),
                     '\s(xmlns(:\w+)?|xsi:schemaLocation)="[^"]*"', '', 'g'), '<(/?)\w+:', '<\1', 'g'));
  exception when others then
    raise exception 'Die Datei ist kein gültiges XML.';
  end;
  root := (xpath('name(/*)', doc))[1]::text;
  v3 := root in ('spielplan', 'ergebnisse');
  if not v3 and root <> 'sportmedia_tabelle_std' then
    raise exception 'Unbekanntes Format (%). Erwartet: DFB-Sportmedia Spielplan oder Ergebnisse.', root;
  end if;

  -- Optional: Kennung aus der Datei übernehmen bzw. prüfen
  if v3 then
    ext := (xpath('/*/kopfdaten/staffel/@kennung', doc))[1]::text;
  else
    ext := (xpath('/*/kopfdaten/staffelid/text()', doc))[1]::text;
  end if;
  if ext ~ '^\d+$' then
    if st.kennung is null then
      update staffeln set kennung = ext::int where id = st.id;
    elsif st.kennung <> ext::int then
      raise exception 'Die Datei gehört zur Staffel % – ausgewählt ist %.', ext, st.kennung;
    end if;
  end if;

  perform set_config('kick.sync', 'on', true);

  -- 1) Mannschaften mit Verein sammeln
  create temp table if not exists imp_teams (team_key text primary key, team_name text, club_key text, club_name text, club_id uuid) on commit drop;
  truncate imp_teams;
  if v3 then
    insert into imp_teams
    select distinct on (k) k, n, null, null, null::uuid from (
      select (xpath('/*/@id', x))[1]::text as k, (xpath('/*/name/text()', x))[1]::text as n
        from unnest(xpath('//heimmannschaft | //gastmannschaft | //platzierung/mannschaft', doc)) x) q
     where k is not null and n is not null and k !~ '^0+$'
    on conflict do nothing;
    update imp_teams i set club_key = q.vid, club_name = q.vname from (
      select (xpath('/*/@mannschaftId', v))[1]::text as mid, (xpath('/*/@id', v))[1]::text as vid,
             coalesce((xpath('/*/name/text()', v))[1]::text, (xpath('/*/text()', v))[1]::text) as vname
        from unnest(xpath('//vereine/verein', doc)) v) q
     where q.mid = i.team_key;
  else
    insert into imp_teams
    select distinct on (k) k, n, null, null, null::uuid from (
      select (xpath('/*/heimmannschaftdfbid/text()', p))[1]::text as k, (xpath('/*/heimmannschaft/text()', p))[1]::text as n
        from unnest(xpath('//paarung | //vorschaupaarung', doc)) p
      union all
      select (xpath('/*/gastmannschaftdfbid/text()', p))[1]::text, (xpath('/*/gastmannschaft/text()', p))[1]::text
        from unnest(xpath('//paarung | //vorschaupaarung', doc)) p
      union all
      select (xpath('/*/mannschaftdfbid/text()', p))[1]::text, (xpath('/*/mannschaft/text()', p))[1]::text
        from unnest(xpath('//platzierung', doc)) p) q
     where k is not null and n is not null
    on conflict do nothing;
  end if;
  update imp_teams set club_name = coalesce(nullif(trim(club_name), ''), club_name_from_team(team_name));

  -- 2) Vereine (fester Schlüssel: DFB-Vereins-ID; ohne ID: Name innerhalb des Kreises)
  for t in select distinct club_key, club_name from imp_teams loop
    cid := null;
    if t.club_key is not null then
      select id into cid from clubs where fussballde_id = t.club_key;
    end if;
    if cid is null then
      select id into cid from clubs where kreis_id = st.kreis_id and lower(name) = lower(t.club_name) limit 1;
    end if;
    if cid is null then
      insert into clubs (name, association, district, kreis_id, fussballde_id, status, approved_by, created_by, fussballde_synced_at)
      values (t.club_name, coalesce(vb.short_name, vb.name), kr.name, st.kreis_id, t.club_key, 'approved', auth.uid(), auth.uid(), now())
      returning id into cid;
      n_clubs := n_clubs + 1;
    else
      update clubs set fussballde_id = coalesce(fussballde_id, t.club_key), fussballde_synced_at = now(),
                       kreis_id = coalesce(kreis_id, st.kreis_id)
       where id = cid;
    end if;
    update imp_teams set club_id = cid where club_name = t.club_name and club_key is not distinct from t.club_key;
  end loop;

  -- 3) Teams (fester Schlüssel: DFB-Mannschafts-ID)
  for t in select * from imp_teams where club_id is not null loop
    select id into tid from teams where fussballde_id = t.team_key;
    if tid is null then
      insert into teams (club_id, name, age_group, season, league, staffel_id, fussballde_id, fussballde_synced_at, created_by)
      values (t.club_id,
              st.age_group || '-Jugend' || coalesce(nullif(' ' || substring(t.team_name from '\s(I{1,3}|IV|[2-9])$'), ' '), ''),
              st.age_group, st.season, league_label, st.id, t.team_key, now(), auth.uid());
      n_teams := n_teams + 1;
    else
      update teams set league = league_label, staffel_id = st.id, fussballde_synced_at = now() where id = tid;
    end if;
  end loop;

  -- 4) Spiele: je beteiligtem Team ein Eintrag (Heim- bzw. Auswärtssicht)
  for m in
    select * from (
      select case when v3 then (xpath('/*/spiel/@id', p))[1]::text
                  else 'sm:' || coalesce(st.kennung::text, st.id::text) || ':' || (xpath('/*/spielnummer/text()', p))[1]::text end as spiel_key,
             case when v3 then (xpath('/*/heimmannschaft/@id', p))[1]::text else (xpath('/*/heimmannschaftdfbid/text()', p))[1]::text end as home_key,
             case when v3 then (xpath('/*/heimmannschaft/name/text()', p))[1]::text else (xpath('/*/heimmannschaft/text()', p))[1]::text end as home_name,
             case when v3 then (xpath('/*/gastmannschaft/@id', p))[1]::text else (xpath('/*/gastmannschaftdfbid/text()', p))[1]::text end as away_key,
             case when v3 then (xpath('/*/gastmannschaft/name/text()', p))[1]::text else (xpath('/*/gastmannschaft/text()', p))[1]::text end as away_name,
             case when v3 then (xpath('/*/spiel/datum/text()', p))[1]::text else (xpath('/*/spieldatum/text()', p))[1]::text end as d,
             case when v3 then (xpath('/*/spiel/uhrzeit/text()', p))[1]::text else (xpath('/*/spieluhrzeit/text()', p))[1]::text end as tm,
             case when v3 then (xpath('/*/ergebnis/heim/text()', p))[1]::text else (xpath('/*/heimergebnis/text()', p))[1]::text end as gh,
             case when v3 then (xpath('/*/ergebnis/gast/text()', p))[1]::text else (xpath('/*/gastergebnis/text()', p))[1]::text end as ga,
             case when v3 then (xpath('/*/spiel/status/@id', p))[1]::text else (xpath('/*/infoid/text()', p))[1]::text end as status,
             case when v3 then concat_ws(', ', (xpath('/*/spielstaette/name/text()', p))[1]::text, (xpath('/*/spielstaette/ort/text()', p))[1]::text) end as venue
        from unnest(xpath('//paarung | //vorschaupaarung', doc)) p) q
     where spiel_key is not null and coalesce(status, '') <> '100'
  loop
    -- Heimsicht
    select id, club_id into tid, cid from teams where fussballde_id = m.home_key;
    if tid is not null and m.away_name is not null then
      insert into matches (club_id, team_id, team_name, opponent, kickoff, competition, is_home, goals_for, goals_against, venue,
                           season, age_group, fussballde_id, result_source, fussballde_synced_at, created_by)
      values (cid, tid, (select name from teams where id = tid), m.away_name, parse_de_date(m.d, m.tm), league_label, true,
              nullif(m.gh, '')::int, nullif(m.ga, '')::int, nullif(m.venue, ''), st.season, st.age_group,
              m.spiel_key || ':H', 'sportmedia', now(), auth.uid())
      on conflict (fussballde_id) do update
         set opponent = excluded.opponent, kickoff = coalesce(excluded.kickoff, matches.kickoff),
             goals_for = coalesce(excluded.goals_for, matches.goals_for), goals_against = coalesce(excluded.goals_against, matches.goals_against),
             venue = coalesce(excluded.venue, matches.venue), fussballde_synced_at = now(), fussballde_missing_since = null;
      n_matches := n_matches + 1;
    end if;
    -- Auswärtssicht
    select id, club_id into tid, cid from teams where fussballde_id = m.away_key;
    if tid is not null and m.home_name is not null then
      insert into matches (club_id, team_id, team_name, opponent, kickoff, competition, is_home, goals_for, goals_against, venue,
                           season, age_group, fussballde_id, result_source, fussballde_synced_at, created_by)
      values (cid, tid, (select name from teams where id = tid), m.home_name, parse_de_date(m.d, m.tm), league_label, false,
              nullif(m.ga, '')::int, nullif(m.gh, '')::int, nullif(m.venue, ''), st.season, st.age_group,
              m.spiel_key || ':A', 'sportmedia', now(), auth.uid())
      on conflict (fussballde_id) do update
         set opponent = excluded.opponent, kickoff = coalesce(excluded.kickoff, matches.kickoff),
             goals_for = coalesce(excluded.goals_for, matches.goals_for), goals_against = coalesce(excluded.goals_against, matches.goals_against),
             venue = coalesce(excluded.venue, matches.venue), fussballde_synced_at = now(), fussballde_missing_since = null;
    end if;
  end loop;

  -- 5) Tabelle
  for t in
    select case when v3 then (xpath('/*/mannschaft/@id', p))[1]::text else (xpath('/*/mannschaftdfbid/text()', p))[1]::text end as k,
           case when v3 then (xpath('/*/mannschaft/name/text()', p))[1]::text else (xpath('/*/mannschaft/text()', p))[1]::text end as n,
           (xpath('/*/platz/text()', p))[1]::text as platz,
           (xpath('/*/gewonnen/text()', p))[1]::text as g, (xpath('/*/unentschieden/text()', p))[1]::text as u,
           (xpath('/*/verloren/text()', p))[1]::text as v,
           case when v3 then (xpath('/*/torePlus/text()', p))[1]::text else (xpath('/*/toreplus/text()', p))[1]::text end as tp,
           case when v3 then (xpath('/*/toreMinus/text()', p))[1]::text else (xpath('/*/toreminus/text()', p))[1]::text end as tm,
           (xpath('/*/punkte/text()', p))[1]::text as pts
      from unnest(xpath('//platzierungen/platzierung', doc)) p
  loop
    continue when t.k is null;
    insert into league_tables (staffel_id, team_key, team_id, team_name, platz, spiele, gewonnen, unentschieden, verloren,
                               tore_plus, tore_minus, punkte, updated_at)
    values (st.id, t.k, (select id from teams where fussballde_id = t.k), t.n, t.platz::int,
            coalesce(t.g::int, 0) + coalesce(t.u::int, 0) + coalesce(t.v::int, 0), t.g::int, t.u::int, t.v::int,
            t.tp::int, t.tm::int, t.pts::int, now())
    on conflict (staffel_id, team_key) do update
       set team_id = excluded.team_id, team_name = excluded.team_name, platz = excluded.platz, spiele = excluded.spiele,
           gewonnen = excluded.gewonnen, unentschieden = excluded.unentschieden, verloren = excluded.verloren,
           tore_plus = excluded.tore_plus, tore_minus = excluded.tore_minus, punkte = excluded.punkte, updated_at = now();
    n_table := n_table + 1;
  end loop;

  update staffeln set last_import_at = now(),
         team_count = coalesce((select count(*) from imp_teams), team_count),
         last_import_info = jsonb_build_object('format', case when v3 then 'XML3 ' || root else 'XML2' end, 'clubs_new', n_clubs,
                                               'teams_new', n_teams, 'matches', n_matches, 'table_rows', n_table)
   where id = st.id;
  insert into sync_runs (source, scope, status, clubs_upserted, teams_upserted, matches_upserted, message, started_by, finished_at)
  values ('sportmedia', 'staffel', 'ok', n_clubs, n_teams, n_matches, st.name, auth.uid(), now());

  return jsonb_build_object('clubs_new', n_clubs, 'teams_new', n_teams, 'matches', n_matches, 'table_rows', n_table,
                            'teams_total', (select count(*) from imp_teams));
end $$;

revoke execute on function kreis_staffeln(uuid), save_staffel(uuid, uuid, text, text, text, int, text, boolean), team_table(uuid),
  import_staffel_xml(uuid, text) from public, anon;
grant execute on function kreis_staffeln(uuid), save_staffel(uuid, uuid, text, text, text, int, text, boolean), team_table(uuid),
  import_staffel_xml(uuid, text) to authenticated;
