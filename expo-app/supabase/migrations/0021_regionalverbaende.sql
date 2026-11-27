-- Go4Pro 0021: Landesverbände mit den exakten Namen wie auf fussball.de und Zuordnung zu den 5 Regionalverbänden.
alter table org_units add column if not exists regional_verband text;
alter table org_units add column if not exists regional_short text;

do $$
declare
  r record;
begin
  for r in select * from (values
    -- alter Name, neuer Name (fussball.de), Kürzel, Regionalverband, Kürzel RV
    ('Badischer Fußballverband', 'Badischer Fußballverband', 'bfv', 'Süddeutscher Fußball-Verband', 'SFV'),
    ('Südbadischer Fußball-Verband', 'Südbadischer Fußballverband', 'SBFV', 'Süddeutscher Fußball-Verband', 'SFV'),
    ('Württembergischer Fußballverband', 'Württembergischer Fußball-Verband', 'WFV', 'Süddeutscher Fußball-Verband', 'SFV'),
    ('Bayerischer Fußball-Verband', 'Bayerischer Fußball-Verband', 'BFV', 'Süddeutscher Fußball-Verband', 'SFV'),
    ('Hessischer Fußball-Verband', 'Hessischer Fußball-Verband', 'HFV', 'Süddeutscher Fußball-Verband', 'SFV'),
    ('Berliner Fußball-Verband', 'Berliner Fußball-Verband e. V.', 'BFV', 'Nordostdeutscher Fußballverband', 'NOFV'),
    ('Fußball-Landesverband Brandenburg', 'Fußball-Landesverband Brandenburg', 'FLB', 'Nordostdeutscher Fußballverband', 'NOFV'),
    ('Landesfußballverband Mecklenburg-Vorpommern', 'Landesfußballverband Mecklenburg-Vorpommern', 'LFV MV', 'Nordostdeutscher Fußballverband', 'NOFV'),
    ('Sächsischer Fußball-Verband', 'Sächsischer Fußball-Verband', 'SFV', 'Nordostdeutscher Fußballverband', 'NOFV'),
    ('Fußballverband Sachsen-Anhalt', 'Fußballverband Sachsen-Anhalt', 'FSA', 'Nordostdeutscher Fußballverband', 'NOFV'),
    ('Thüringer Fußball-Verband', 'Thüringer Fußball-Verband', 'TFV', 'Nordostdeutscher Fußballverband', 'NOFV'),
    ('Bremer Fußball-Verband', 'Bremer Fußball-Verband', 'BFV', 'Norddeutscher Fußball-Verband', 'NFV'),
    ('Hamburger Fußball-Verband', 'Hamburger Fußball-Verband', 'HFV', 'Norddeutscher Fußball-Verband', 'NFV'),
    ('Niedersächsischer Fußballverband', 'Niedersächsischer Fußballverband', 'NFV', 'Norddeutscher Fußball-Verband', 'NFV'),
    ('Schleswig-Holsteinischer Fußballverband', 'Schleswig-Holsteinischer Fußballverband', 'SHFV', 'Norddeutscher Fußball-Verband', 'NFV'),
    ('Fußball-Verband Mittelrhein', 'Fußball-Verband Mittelrhein', 'FVM', 'Westdeutscher Fußballverband', 'WDFV'),
    ('Fußballverband Niederrhein', 'Fußballverband Niederrhein e.V.', 'FVN', 'Westdeutscher Fußballverband', 'WDFV'),
    ('Fußball- und Leichtathletik-Verband Westfalen', 'Fußball- und Leichtathletik-Verband Westfalen', 'FLVW', 'Westdeutscher Fußballverband', 'WDFV'),
    ('Fußballverband Rheinland', 'Fußballverband Rheinland', 'FVR', 'Fußball-Regional-Verband Südwest', 'FRVS'),
    ('Südwestdeutscher Fußballverband', 'Südwestdeutscher Fußball-Verband', 'SWFV', 'Fußball-Regional-Verband Südwest', 'FRVS'),
    ('Saarländischer Fußballverband', 'Saarländischer Fußball-Verband', 'SFV', 'Fußball-Regional-Verband Südwest', 'FRVS')
  ) as v(old_name, new_name, short, rv, rv_short)
  loop
    update org_units set name = r.new_name, short_name = r.short, regional_verband = r.rv, regional_short = r.rv_short
     where kind = 'verband' and (name = r.old_name or name = r.new_name);
    if not found then
      raise exception 'Verband % nicht gefunden', r.old_name;
    end if;
  end loop;
end $$;

-- Regionalverband in der Detailansicht mitliefern
create or replace function unit_regional(p_unit uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(o.regional_verband, (select v.regional_verband from org_units v where v.id = o.parent_id and v.kind = 'verband'))
    from org_units o where o.id = p_unit;
$$;
grant execute on function unit_regional(uuid) to authenticated;
