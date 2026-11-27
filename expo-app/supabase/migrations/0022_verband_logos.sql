-- Go4Pro 0022: Logos der Landes- und Regionalverbände (Dateien liegen in der App unter /logos).
alter table org_units add column if not exists logo_url text;
alter table org_units add column if not exists regional_logo_url text;

do $$
declare
  base constant text := 'https://zafarkhan82.github.io/zk1/logos/';
  r record;
begin
  for r in select * from (values
    ('Badischer Fußballverband', 'bfv'), ('Südbadischer Fußballverband', 'sbfv'), ('Württembergischer Fußball-Verband', 'wfv'),
    ('Bayerischer Fußball-Verband', 'bayern'), ('Hessischer Fußball-Verband', 'hessen'), ('Berliner Fußball-Verband e. V.', 'berlin'),
    ('Fußball-Landesverband Brandenburg', 'flb'), ('Landesfußballverband Mecklenburg-Vorpommern', 'lfv-mv'),
    ('Sächsischer Fußball-Verband', 'sachsen'), ('Fußballverband Sachsen-Anhalt', 'fsa'), ('Thüringer Fußball-Verband', 'tfv'),
    ('Bremer Fußball-Verband', 'bremen'), ('Hamburger Fußball-Verband', 'hamburg'), ('Niedersächsischer Fußballverband', 'nfv-niedersachsen'),
    ('Schleswig-Holsteinischer Fußballverband', 'shfv'), ('Fußball-Verband Mittelrhein', 'fvm'), ('Fußballverband Niederrhein e.V.', 'fvn'),
    ('Fußball- und Leichtathletik-Verband Westfalen', 'flvw'), ('Fußballverband Rheinland', 'fvr'),
    ('Südwestdeutscher Fußball-Verband', 'swfv'), ('Saarländischer Fußball-Verband', 'saarland')
  ) as v(name, file) loop
    update org_units set logo_url = base || r.file || '.png' where kind = 'verband' and name = r.name;
  end loop;
  update org_units set regional_logo_url = base || case regional_short
      when 'NFV' then 'rv-nfv' when 'NOFV' then 'rv-nofv' when 'SFV' then 'rv-sfv' when 'FRVS' then 'rv-frvs' when 'WDFV' then 'rv-wdfv' end || '.png'
   where kind = 'verband' and regional_short is not null;
end $$;

-- Logos aller Ebenen (Kreise und Bundesländer zeigen das Logo ihres Verbands bzw. keines)
create or replace function unit_logos() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(o.id, jsonb_build_object(
           'logo', coalesce(o.logo_url, p.logo_url),
           'regional', coalesce(o.regional_verband, p.regional_verband),
           'regional_logo', coalesce(o.regional_logo_url, p.regional_logo_url))), '{}'::jsonb)
    from org_units o left join org_units p on p.id = o.parent_id;
$$;
grant execute on function unit_logos() to authenticated;
