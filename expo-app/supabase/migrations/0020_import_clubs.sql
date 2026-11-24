-- Go4Pro 0020: Vereine (und Jugendteams) übernehmen, die ein Kreis-Admin aus Bild, PDF oder Link ausgelesen und geprüft hat.
-- Abgleich: DFB-Vereinsnummer, sonst Name innerhalb des Kreises – nie doppelt. Personen werden nicht übernommen.
-- Optional eine Ziel-Staffel: dann bekommen die Teams Altersklasse, Spielklasse und Staffel-Zuordnung.

create or replace function import_clubs(p_kreis uuid, p_clubs jsonb, p_staffel uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  kr org_units;
  vb org_units;
  st staffeln;
  c jsonb;
  t jsonb;
  cid uuid;
  ag text;
  tname text;
  suffix text;
  n_new int := 0;
  n_updated int := 0;
  n_teams int := 0;
begin
  select * into kr from org_units where id = p_kreis and kind = 'kreis';
  if not found then raise exception 'Kreis nicht gefunden.'; end if;
  if not is_unit_admin(p_kreis) then raise exception 'Nur Admins des Kreises (oder darüber).'; end if;
  select * into vb from org_units where id = kr.parent_id;
  if p_staffel is not null then
    select * into st from staffeln where id = p_staffel and kreis_id = p_kreis;
    if not found then raise exception 'Staffel gehört nicht zu diesem Kreis.'; end if;
  end if;
  if jsonb_typeof(p_clubs) <> 'array' or jsonb_array_length(p_clubs) > 500 then
    raise exception 'Bitte höchstens 500 Vereine auf einmal übernehmen.';
  end if;

  for c in select * from jsonb_array_elements(p_clubs) loop
    continue when length(trim(coalesce(c ->> 'name', ''))) < 3;
    cid := null;
    if nullif(trim(c ->> 'dfb_club_number'), '') is not null then
      select id into cid from clubs where dfb_club_number = trim(c ->> 'dfb_club_number');
    end if;
    if cid is null then
      select id into cid from clubs where kreis_id = p_kreis and lower(name) = lower(trim(c ->> 'name')) limit 1;
    end if;
    if cid is null then
      insert into clubs (name, city, postal_code, association, district, kreis_id, dfb_club_number, status, approved_by, created_by)
      values (trim(c ->> 'name'), nullif(trim(c ->> 'city'), ''), nullif(trim(c ->> 'postal_code'), ''),
              coalesce(vb.short_name, vb.name), kr.name, p_kreis, nullif(trim(c ->> 'dfb_club_number'), ''),
              'approved', auth.uid(), auth.uid())
      returning id into cid;
      n_new := n_new + 1;
    else
      update clubs set city = coalesce(city, nullif(trim(c ->> 'city'), '')),
                       postal_code = coalesce(postal_code, nullif(trim(c ->> 'postal_code'), '')),
                       dfb_club_number = coalesce(dfb_club_number, nullif(trim(c ->> 'dfb_club_number'), '')),
                       kreis_id = coalesce(kreis_id, p_kreis)
       where id = cid;
      n_updated := n_updated + 1;
    end if;

    -- Teams: mit Ziel-Staffel immer deren Altersklasse, sonst die ausgelesene
    for t in select * from jsonb_array_elements(coalesce(c -> 'teams', '[]'::jsonb)) loop
      ag := coalesce(st.age_group, nullif(t ->> 'age_group', ''));
      continue when ag is null or ag not in ('A', 'B', 'C', 'D', 'E');
      suffix := substring(trim(coalesce(t ->> 'name', '')) from '\s(I{1,3}|IV|[2-9])$');
      tname := ag || '-Jugend' || coalesce(' ' || suffix, '');
      if not exists (select 1 from teams where club_id = cid and name = tname and season = coalesce(st.season, current_season()) and active) then
        insert into teams (club_id, name, age_group, season, league, staffel_id, created_by)
        values (cid, tname, ag, coalesce(st.season, current_season()),
                case when st.id is not null then st.age_group || '-Junioren ' || st.name end, st.id, auth.uid());
        n_teams := n_teams + 1;
      elsif st.id is not null then
        update teams set staffel_id = st.id, league = st.age_group || '-Junioren ' || st.name
         where club_id = cid and name = tname and season = st.season and active;
      end if;
    end loop;
  end loop;

  return jsonb_build_object('clubs_new', n_new, 'clubs_updated', n_updated, 'teams_new', n_teams);
end $$;

-- Vorhandene Vereine des Kreises (für den Abgleich in der Vorschau)
create or replace function kreis_club_names(p_kreis uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when is_unit_admin(p_kreis) then
    coalesce(jsonb_agg(jsonb_build_object('name', name, 'dfb', dfb_club_number)), '[]'::jsonb) end
    from clubs where kreis_id = p_kreis;
$$;

revoke execute on function import_clubs(uuid, jsonb, uuid), kreis_club_names(uuid) from public, anon;
grant execute on function import_clubs(uuid, jsonb, uuid), kreis_club_names(uuid) to authenticated;
