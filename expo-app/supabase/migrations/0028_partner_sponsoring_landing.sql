-- Go4Pro 0028: Partner mit Gutscheinen (gegen Punkte), Sponsoring-Börse, eigene Landingpages.

-- ───────────────────────── Partner ─────────────────────────
create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 80),
  category text not null default 'sport' check (category in ('sport', 'freizeit', 'essen', 'bildung', 'mode', 'sonstiges')),
  description text not null default '' check (length(description) <= 600),
  website text check (website is null or website ~ '^https://'),
  logo text check (logo is null or (length(logo) <= 40000 and logo like 'data:image/%')),
  contact_email text not null check (contact_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  status approval_status not null default 'pending',
  owner_user_id uuid not null references profiles (id),
  approved_by uuid references profiles (id),
  created_at timestamptz not null default now()
);
alter table partners enable row level security;

create table if not exists vouchers (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners (id),
  title text not null check (length(title) between 2 and 80),
  description text not null default '' check (length(description) <= 400),
  points_cost int not null check (points_cost between 50 and 100000),
  shared_code text,                 -- ein Code für alle …
  uses_pool boolean not null default false,  -- … oder Einzel-Codes aus voucher_codes
  stock int check (stock is null or stock >= 0),
  valid_until date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table vouchers enable row level security;

create table if not exists voucher_codes (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references vouchers (id),
  code text not null,
  redemption_id uuid,
  unique (voucher_id, code)
);
alter table voucher_codes enable row level security;

create table if not exists redemptions (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references vouchers (id),
  player_id uuid references players (id),
  user_id uuid not null references profiles (id),
  points int not null,
  code text not null,
  created_at timestamptz not null default now()
);
alter table redemptions enable row level security;
drop trigger if exists redemptions_no_delete on redemptions;
create trigger redemptions_no_delete before delete on redemptions for each row execute function forbid_delete();

create or replace function register_partner(p_name text, p_category text, p_description text, p_website text, p_email text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  pid uuid;
begin
  if auth.uid() is null then raise exception 'Bitte anmelden.'; end if;
  if (select count(*) from partners where owner_user_id = auth.uid()) >= 5 then raise exception 'Höchstens 5 Partner pro Konto.'; end if;
  insert into partners (name, category, description, website, contact_email, owner_user_id)
  values (trim(p_name), coalesce(p_category, 'sport'), coalesce(trim(p_description), ''), nullif(trim(p_website), ''), trim(p_email), auth.uid())
  returning id into pid;
  return pid;
end $$;

create or replace function set_partner_logo(p_partner uuid, p_data text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from partners where id = p_partner and owner_user_id = auth.uid()) then raise exception 'Keine Berechtigung.'; end if;
  update partners set logo = nullif(p_data, '') where id = p_partner;
end $$;

create or replace function admin_partners() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when is_platform_admin() then coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'name', p.name, 'category', p.category, 'description', p.description, 'website', p.website,
    'email', p.contact_email, 'status', p.status, 'owner', pr.email, 'created_at', p.created_at,
    'vouchers', (select count(*) from vouchers v where v.partner_id = p.id)) order by p.status = 'pending' desc, p.created_at desc), '[]'::jsonb) end
    from partners p join profiles pr on pr.id = p.owner_user_id;
$$;

create or replace function review_partner(p_partner uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Partner gibt Go4Pro frei.'; end if;
  update partners set status = case when p_accept then 'approved'::approval_status else 'rejected'::approval_status end, approved_by = auth.uid()
   where id = p_partner;
end $$;

create or replace function my_partners() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'name', p.name, 'category', p.category, 'description', p.description, 'website', p.website, 'logo', p.logo,
    'email', p.contact_email, 'status', p.status,
    'vouchers', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', v.id, 'title', v.title, 'description', v.description, 'points_cost', v.points_cost, 'shared_code', v.shared_code,
        'uses_pool', v.uses_pool, 'stock', v.stock, 'valid_until', v.valid_until, 'active', v.active,
        'redeemed', (select count(*) from redemptions r where r.voucher_id = v.id),
        'codes_left', (select count(*) from voucher_codes c where c.voucher_id = v.id and c.redemption_id is null)) order by v.created_at desc), '[]'::jsonb)
        from vouchers v where v.partner_id = p.id)) order by p.created_at), '[]'::jsonb)
    from partners p where p.owner_user_id = auth.uid();
$$;

create or replace function save_voucher(p_id uuid, p_partner uuid, p_title text, p_description text, p_points int, p_shared_code text,
                                        p_uses_pool boolean, p_stock int, p_valid_until date, p_active boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  vid uuid := p_id;
begin
  if not exists (select 1 from partners where id = p_partner and owner_user_id = auth.uid() and status = 'approved') then
    raise exception 'Gutscheine können freigegebene Partner anlegen.';
  end if;
  if not coalesce(p_uses_pool, false) and nullif(trim(p_shared_code), '') is null then
    raise exception 'Bitte einen Gutschein-Code angeben oder Einzel-Codes verwenden.';
  end if;
  if vid is null then
    insert into vouchers (partner_id, title, description, points_cost, shared_code, uses_pool, stock, valid_until, active)
    values (p_partner, trim(p_title), coalesce(trim(p_description), ''), p_points, nullif(trim(p_shared_code), ''), coalesce(p_uses_pool, false),
            p_stock, p_valid_until, coalesce(p_active, true))
    returning id into vid;
  else
    update vouchers set title = trim(p_title), description = coalesce(trim(p_description), ''), points_cost = p_points,
                        shared_code = nullif(trim(p_shared_code), ''), uses_pool = coalesce(p_uses_pool, false), stock = p_stock,
                        valid_until = p_valid_until, active = coalesce(p_active, true)
     where id = vid and partner_id = p_partner;
  end if;
  return vid;
end $$;

create or replace function add_voucher_codes(p_voucher uuid, p_codes text[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if not exists (select 1 from vouchers v join partners p on p.id = v.partner_id where v.id = p_voucher and p.owner_user_id = auth.uid()) then
    raise exception 'Keine Berechtigung.';
  end if;
  insert into voucher_codes (voucher_id, code)
  select p_voucher, trim(c) from unnest(p_codes) c where length(trim(c)) between 3 and 60
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Gutschein-Shop
create or replace function voucher_shop() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id, 'title', v.title, 'description', v.description, 'points_cost', v.points_cost, 'valid_until', v.valid_until,
    'partner', p.name, 'partner_logo', p.logo, 'category', p.category, 'website', p.website,
    'left', case when v.uses_pool then (select count(*) from voucher_codes c where c.voucher_id = v.id and c.redemption_id is null)
                 when v.stock is not null then greatest(0, v.stock - (select count(*) from redemptions r where r.voucher_id = v.id)) end)
    order by v.points_cost), '[]'::jsonb)
    from vouchers v join partners p on p.id = v.partner_id
   where v.active and p.status = 'approved' and (v.valid_until is null or v.valid_until >= current_date);
$$;

-- Einlösen: Punkte der Spielerin/des Spielers (p_player) oder des eigenen Kontos (null)
create or replace function redeem_voucher(p_voucher uuid, p_player uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v vouchers;
  bal int;
  code_ text;
  cid uuid;
  rid uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'Bitte anmelden.'; end if;
  if p_player is not null and not is_player_owner(p_player) then raise exception 'Keine Berechtigung.'; end if;
  select * into v from vouchers where id = p_voucher and active and (valid_until is null or valid_until >= current_date) for update;
  if not found or not exists (select 1 from partners where id = v.partner_id and status = 'approved') then
    raise exception 'Dieser Gutschein ist nicht mehr verfügbar.';
  end if;
  bal := points_balance(p_player, auth.uid());
  if bal < v.points_cost then raise exception 'Dafür fehlen dir noch % Punkte.', v.points_cost - bal; end if;
  if v.uses_pool then
    select id, code into cid, code_ from voucher_codes where voucher_id = v.id and redemption_id is null limit 1 for update skip locked;
    if cid is null then raise exception 'Leider sind alle Codes vergeben.'; end if;
    update voucher_codes set redemption_id = rid where id = cid;
  else
    if v.stock is not null and (select count(*) from redemptions where voucher_id = v.id) >= v.stock then
      raise exception 'Leider sind alle Gutscheine vergeben.';
    end if;
    code_ := v.shared_code;
  end if;
  insert into redemptions (id, voucher_id, player_id, user_id, points, code) values (rid, v.id, p_player, auth.uid(), v.points_cost, code_);
  insert into points_ledger (player_id, user_id, amount, reason, ref_id)
  values (p_player, case when p_player is null then auth.uid() end, -v.points_cost, 'Gutschein: ' || v.title, rid);
  return jsonb_build_object('code', code_, 'points', v.points_cost);
end $$;

create or replace function my_redemptions(p_player uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('code', r.code, 'points', r.points, 'at', r.created_at, 'title', v.title, 'partner', p.name,
                                               'website', p.website) order by r.created_at desc), '[]'::jsonb)
    from redemptions r join vouchers v on v.id = r.voucher_id join partners p on p.id = v.partner_id
   where r.user_id = auth.uid() and r.player_id is not distinct from p_player;
$$;

-- ───────────────────────── Sponsoring-Börse ─────────────────────────
create table if not exists sponsor_listings (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('team', 'spieler')),
  team_id uuid references teams (id),
  player_id uuid references players (id),
  title text not null check (length(title) between 3 and 100),
  pitch text not null check (length(pitch) between 10 and 1200),
  needs text check (needs is null or length(needs) <= 300),
  amount_wanted int check (amount_wanted is null or amount_wanted between 0 and 1000000),
  status text not null default 'aktiv' check (status in ('aktiv', 'beendet')),
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  check ((kind = 'team') = (team_id is not null) and (kind = 'spieler') = (player_id is not null))
);
alter table sponsor_listings enable row level security;

create table if not exists sponsor_offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references sponsor_listings (id),
  partner_id uuid not null references partners (id),
  message text not null check (length(message) between 10 and 1000),
  amount int check (amount is null or amount between 0 and 1000000),
  status text not null default 'offen' check (status in ('offen', 'angenommen', 'abgelehnt')),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
alter table sponsor_offers enable row level security;

-- Wer gilt als „überragend“? Spieler*in: Gold oder besser (≥ 61). Team: Ø-Wertung ≥ 55 oder Tabellenplatz 1–3.
create or replace function team_rating_avg(p_team uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select round(avg((rating_breakdown(m.player_id) ->> 'overall')::int), 1)
    from team_members m where m.team_id = p_team and m.status = 'approved' and m.to_date is null;
$$;

create or replace function sponsor_eligibility(p_kind text, p_target uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  ovr int;
  avg_ numeric;
  pl int;
  pr players;
begin
  if p_kind = 'spieler' then
    select * into pr from players where id = p_target;
    if not found or not is_player_owner(p_target) then return jsonb_build_object('ok', false, 'reason', 'Keine Berechtigung.'); end if;
    if pr.own_user_id = auth.uid() and pr.guardian_user_id is not null
       and extract(year from now())::int - pr.birth_year < 17 then
      return jsonb_build_object('ok', false, 'reason', 'Für Spieler*innen unter 16 stellen die Eltern das Gesuch ein.');
    end if;
    ovr := (rating_breakdown(p_target) ->> 'overall')::int;
    return jsonb_build_object('ok', ovr >= 61, 'overall', ovr, 'needed', 61,
                              'reason', case when ovr < 61 then 'Ab Gold-Karte (61) kannst du dich in der Börse präsentieren.' end);
  end if;
  if not (is_team_staff(p_target) or is_platform_admin()) then return jsonb_build_object('ok', false, 'reason', 'Nur Trainer*innen des Teams.'); end if;
  avg_ := team_rating_avg(p_target);
  select l.platz into pl from league_tables l join teams t on t.staffel_id = l.staffel_id where t.id = p_target and l.team_id = p_target;
  return jsonb_build_object('ok', coalesce(avg_, 0) >= 55 or coalesce(pl, 99) <= 3, 'avg', avg_, 'platz', pl,
                            'reason', case when not (coalesce(avg_, 0) >= 55 or coalesce(pl, 99) <= 3)
                                           then 'Ab Ø-Wertung 55 oder Tabellenplatz 1–3 kann das Team ein Gesuch einstellen.' end);
end $$;

create or replace function create_sponsor_listing(p_kind text, p_target uuid, p_title text, p_pitch text, p_needs text, p_amount int) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  lid uuid;
begin
  if not (sponsor_eligibility(p_kind, p_target) ->> 'ok')::boolean then
    raise exception '%', coalesce(sponsor_eligibility(p_kind, p_target) ->> 'reason', 'Noch nicht freigeschaltet.');
  end if;
  insert into sponsor_listings (kind, team_id, player_id, title, pitch, needs, amount_wanted, created_by)
  values (p_kind, case when p_kind = 'team' then p_target end, case when p_kind = 'spieler' then p_target end,
          trim(p_title), trim(p_pitch), nullif(trim(p_needs), ''), p_amount, auth.uid())
  returning id into lid;
  return lid;
end $$;

create or replace function close_sponsor_listing(p_listing uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update sponsor_listings set status = 'beendet' where id = p_listing and (created_by = auth.uid() or is_platform_admin());
end $$;

-- Börse: alle aktiven Gesuche (für angemeldete Nutzer*innen)
create or replace function sponsor_board() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'kind', l.kind, 'title', l.title, 'pitch', l.pitch, 'needs', l.needs, 'amount', l.amount_wanted, 'at', l.created_at,
    'name', case when l.kind = 'team' then (select c.name || ' ' || t.name from teams t join clubs c on c.id = t.club_id where t.id = l.team_id)
                 else (select case when u_class(p.birth_year) >= 14 then p.nickname else left(p.nickname, 1) || '.' end from players p where p.id = l.player_id) end,
    'detail', case when l.kind = 'team' then (select t.league from teams t where t.id = l.team_id)
                   else (select c.name from players p left join teams t on t.id = active_team_of(p.id) left join clubs c on c.id = t.club_id where p.id = l.player_id) end,
    'avatar', case when l.kind = 'spieler' then (select case when p.public_consent_at is not null then p.avatar end from players p where p.id = l.player_id) end,
    'rating', case when l.kind = 'spieler' then (rating_breakdown(l.player_id) ->> 'overall')::int else team_rating_avg(l.team_id) end,
    'offers', (select count(*) from sponsor_offers o where o.listing_id = l.id),
    'mine', l.created_by = auth.uid()) order by l.created_at desc), '[]'::jsonb)
    from sponsor_listings l where l.status = 'aktiv' and auth.uid() is not null;
$$;

create or replace function make_sponsor_offer(p_listing uuid, p_partner uuid, p_message text, p_amount int) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  oid uuid;
begin
  if not exists (select 1 from partners where id = p_partner and owner_user_id = auth.uid() and status = 'approved') then
    raise exception 'Angebote können freigegebene Partner machen.';
  end if;
  if not exists (select 1 from sponsor_listings where id = p_listing and status = 'aktiv') then raise exception 'Gesuch nicht mehr aktiv.'; end if;
  insert into sponsor_offers (listing_id, partner_id, message, amount) values (p_listing, p_partner, trim(p_message), p_amount)
  returning id into oid;
  return oid;
end $$;

-- Eigene Gesuche mit Angeboten (Kontakt des Partners sichtbar)
create or replace function my_sponsor_listings() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'kind', l.kind, 'title', l.title, 'status', l.status, 'at', l.created_at,
    'offers', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'partner', p.name, 'logo', p.logo, 'website', p.website,
                 'email', p.contact_email, 'message', o.message, 'amount', o.amount, 'status', o.status, 'at', o.created_at) order by o.created_at desc), '[]'::jsonb)
                 from sponsor_offers o join partners p on p.id = o.partner_id where o.listing_id = l.id)) order by l.created_at desc), '[]'::jsonb)
    from sponsor_listings l where l.created_by = auth.uid();
$$;

create or replace function respond_sponsor_offer(p_offer uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from sponsor_offers o join sponsor_listings l on l.id = o.listing_id where o.id = p_offer and l.created_by = auth.uid()) then
    raise exception 'Keine Berechtigung.';
  end if;
  update sponsor_offers set status = case when p_accept then 'angenommen' else 'abgelehnt' end, answered_at = now() where id = p_offer;
end $$;

-- Angebote eines Partners: nach Annahme sieht der Partner die Kontakt-E-Mail
create or replace function partner_offers(p_partner uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'listing', l.title, 'status', o.status, 'amount', o.amount, 'at', o.created_at,
           'contact', case when o.status = 'angenommen' then (select email from profiles where id = l.created_by) end) order by o.created_at desc), '[]'::jsonb)
    from sponsor_offers o join sponsor_listings l on l.id = o.listing_id join partners p on p.id = o.partner_id
   where o.partner_id = p_partner and p.owner_user_id = auth.uid();
$$;

-- ───────────────────────── Landingpages ─────────────────────────
create table if not exists landing_pages (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('spieler', 'trainer')),
  player_id uuid unique references players (id),
  user_id uuid references profiles (id),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  headline text not null default '' check (length(headline) <= 120),
  bio text not null default '' check (length(bio) <= 1500),
  highlights text not null default '' check (length(highlights) <= 1000),
  video_url text check (video_url is null or video_url ~ '^https://'),
  published boolean not null default false,
  updated_at timestamptz not null default now(),
  check ((kind = 'spieler') = (player_id is not null))
);
create unique index if not exists landing_trainer_once on landing_pages (user_id) where kind = 'trainer';
alter table landing_pages enable row level security;

create or replace function landing_threshold() returns int language sql immutable as $$ select 300 $$;

create or replace function my_landing(p_player uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  lp landing_pages;
  earned int;
begin
  if p_player is not null and not is_player_owner(p_player) then raise exception 'Keine Berechtigung.'; end if;
  if p_player is not null then select * into lp from landing_pages where player_id = p_player;
  else select * into lp from landing_pages where user_id = auth.uid() and kind = 'trainer'; end if;
  select coalesce(sum(amount) filter (where amount > 0), 0) into earned from points_ledger
   where (p_player is not null and player_id = p_player) or (p_player is null and user_id = auth.uid());
  return jsonb_build_object('page', case when lp.id is null then null else to_jsonb(lp) end, 'earned', earned,
                            'threshold', landing_threshold(), 'unlocked', earned >= landing_threshold(),
                            'needs_parent_consent', p_player is not null and (select public_consent_at is null from players where id = p_player));
end $$;

create or replace function save_landing(p_player uuid, p_slug text, p_headline text, p_bio text, p_highlights text, p_video text, p_published boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  earned int;
  slug_ text := lower(trim(p_slug));
begin
  if p_player is not null and not is_player_owner(p_player) then raise exception 'Keine Berechtigung.'; end if;
  if p_player is null and auth.uid() is null then raise exception 'Bitte anmelden.'; end if;
  select coalesce(sum(amount) filter (where amount > 0), 0) into earned from points_ledger
   where (p_player is not null and player_id = p_player) or (p_player is null and user_id = auth.uid());
  if coalesce(p_published, false) and earned < landing_threshold() then
    raise exception 'Deine Seite kannst du ab % gesammelten Punkten veröffentlichen.', landing_threshold();
  end if;
  if coalesce(p_published, false) and p_player is not null
     and (select public_consent_at is null from players where id = p_player) then
    raise exception 'Veröffentlichen geht erst, wenn die Eltern unter Ich der Veröffentlichung zugestimmt haben.';
  end if;
  if exists (select 1 from landing_pages where slug = slug_ and not ((p_player is not null and player_id = p_player)
             or (p_player is null and user_id = auth.uid() and kind = 'trainer'))) then
    raise exception 'Diese Adresse ist schon vergeben.';
  end if;
  if p_player is not null then
    insert into landing_pages (kind, player_id, slug, headline, bio, highlights, video_url, published)
    values ('spieler', p_player, slug_, coalesce(p_headline, ''), coalesce(p_bio, ''), coalesce(p_highlights, ''), nullif(trim(p_video), ''), coalesce(p_published, false))
    on conflict (player_id) do update set slug = excluded.slug, headline = excluded.headline, bio = excluded.bio, highlights = excluded.highlights,
      video_url = excluded.video_url, published = excluded.published, updated_at = now();
  else
    update landing_pages set slug = slug_, headline = coalesce(p_headline, ''), bio = coalesce(p_bio, ''), highlights = coalesce(p_highlights, ''),
                             video_url = nullif(trim(p_video), ''), published = coalesce(p_published, false), updated_at = now()
     where user_id = auth.uid() and kind = 'trainer';
    if not found then
      insert into landing_pages (kind, user_id, slug, headline, bio, highlights, video_url, published)
      values ('trainer', auth.uid(), slug_, coalesce(p_headline, ''), coalesce(p_bio, ''), coalesce(p_highlights, ''), nullif(trim(p_video), ''), coalesce(p_published, false));
    end if;
  end if;
end $$;

-- Öffentliche Seite (auch ohne Anmeldung)
create or replace function landing_public(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  lp landing_pages;
  pl players;
  rb jsonb;
begin
  select * into lp from landing_pages where slug = lower(trim(p_slug)) and published;
  if not found then return jsonb_build_object('found', false); end if;
  if lp.kind = 'spieler' then
    select * into pl from players where id = lp.player_id and anonymized_at is null and public_consent_at is not null;
    if not found then return jsonb_build_object('found', false); end if;
    rb := rating_breakdown(pl.id);
    return jsonb_build_object('found', true, 'kind', 'spieler', 'name', pl.nickname, 'avatar', pl.avatar, 'position', pl.preferred_position,
      'headline', lp.headline, 'bio', lp.bio, 'highlights', lp.highlights, 'video', lp.video_url, 'go4pro_id', 'G4P-' || pl.code,
      'overall', rb -> 'overall', 'attributes', rb -> 'attributes',
      'club', (select c.name || ' · ' || t.name from teams t join clubs c on c.id = t.club_id where t.id = active_team_of(pl.id)),
      'ratings', (select jsonb_build_object('count', count(*), 'avg', round(avg(avg_stars), 2)) from ratings where rated_player_id = pl.id and hidden_at is null));
  end if;
  return jsonb_build_object('found', true, 'kind', 'trainer',
    'name', (select display_name from profiles where id = lp.user_id), 'avatar', (select avatar from profiles where id = lp.user_id),
    'headline', lp.headline, 'bio', lp.bio, 'highlights', lp.highlights, 'video', lp.video_url,
    'clubs', (select coalesce(jsonb_agg(distinct c.name), '[]'::jsonb) from club_memberships m join clubs c on c.id = m.club_id
               where m.user_id = lp.user_id and m.status = 'approved' and (m.valid_to is null or m.valid_to >= current_date)),
    'teams', (select coalesce(jsonb_agg(c.name || ' ' || t.name), '[]'::jsonb) from team_staff s join teams t on t.id = s.team_id join clubs c on c.id = t.club_id
               where s.user_id = lp.user_id and s.status = 'approved' and s.to_date is null));
end $$;

revoke execute on function register_partner(text, text, text, text, text), set_partner_logo(uuid, text), admin_partners(), review_partner(uuid, boolean),
  my_partners(), save_voucher(uuid, uuid, text, text, int, text, boolean, int, date, boolean), add_voucher_codes(uuid, text[]), voucher_shop(),
  redeem_voucher(uuid, uuid), my_redemptions(uuid), sponsor_eligibility(text, uuid), create_sponsor_listing(text, uuid, text, text, text, int),
  close_sponsor_listing(uuid), sponsor_board(), make_sponsor_offer(uuid, uuid, text, int), my_sponsor_listings(), respond_sponsor_offer(uuid, boolean),
  partner_offers(uuid), my_landing(uuid), save_landing(uuid, text, text, text, text, text, boolean) from public, anon;
grant execute on function register_partner(text, text, text, text, text), set_partner_logo(uuid, text), admin_partners(), review_partner(uuid, boolean),
  my_partners(), save_voucher(uuid, uuid, text, text, int, text, boolean, int, date, boolean), add_voucher_codes(uuid, text[]), voucher_shop(),
  redeem_voucher(uuid, uuid), my_redemptions(uuid), sponsor_eligibility(text, uuid), create_sponsor_listing(text, uuid, text, text, text, int),
  close_sponsor_listing(uuid), sponsor_board(), make_sponsor_offer(uuid, uuid, text, int), my_sponsor_listings(), respond_sponsor_offer(uuid, boolean),
  partner_offers(uuid), my_landing(uuid), save_landing(uuid, text, text, text, text, text, boolean) to authenticated;
revoke execute on function team_rating_avg(uuid), landing_threshold() from public, anon;
revoke execute on function landing_public(text) from public;
grant execute on function landing_public(text) to anon, authenticated;
