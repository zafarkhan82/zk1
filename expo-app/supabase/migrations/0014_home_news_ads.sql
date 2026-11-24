-- Go4Pro 0014: Startseite – Rang-Übersicht mit Wochentrend, Team-Aktivität, Nachrichten und kindgerechte Werbung.

-- ───────────────────────── Ranglisten: gemeinsamer Spieler-Pool ─────────────────────────
-- Wer in welcher Rangliste auftaucht. Intern (nicht direkt aufrufbar).
create or replace function rank_pool(p_player uuid, p_scope text)
returns table (player_id uuid, nickname text, birth_year int, club_name text, team_name text)
language plpgsql stable security definer set search_path = public as $$
declare
  t teams;
  c clubs;
  grp text;
begin
  select * into t from teams where id = active_team_of(p_player);
  if found then select * into c from clubs where id = t.club_id; end if;
  grp := coalesce(t.age_group, (select age_group(pl.birth_year) from players pl where pl.id = p_player));
  if p_scope in ('team', 'league') and t.id is null then return; end if;
  if p_scope = 'league' and t.league is null then return; end if;
  if p_scope = 'region' and c.association is null then return; end if;

  return query
  select p.id, p.nickname, p.birth_year, cl.name, tm.name
    from team_members m
    join teams tm on tm.id = m.team_id and tm.active
    join clubs cl on cl.id = tm.club_id
    join players p on p.id = m.player_id and p.anonymized_at is null
   where m.status = 'approved' and m.to_date is null
     and case p_scope
           when 'team' then tm.id = t.id
           when 'league' then tm.league = t.league and tm.age_group = t.age_group and tm.season = t.season
           when 'region' then cl.association = c.association and tm.age_group = grp
           else tm.age_group = grp end
     and (p_scope = 'team' or p.id = p_player
          or (p.public_consent_at is not null and is_premium(p.id)));
end $$;
revoke execute on function rank_pool(uuid, text) from public, anon, authenticated;

create or replace function rank_scope_label(p_player uuid, p_scope text) returns text
language sql stable security definer set search_path = public as $$
  select case p_scope
           when 'team' then c.name || ' ' || t.name
           when 'league' then t.league
           when 'region' then coalesce(t.age_group, age_group(p.birth_year)) || '-Jugend · ' || c.association
           else coalesce(t.age_group, age_group(p.birth_year)) || '-Jugend · Deutschland' end
    from players p
    left join teams t on t.id = active_team_of(p.id)
    left join clubs c on c.id = t.club_id
   where p.id = p_player;
$$;
revoke execute on function rank_scope_label(uuid, text) from public, anon, authenticated;

-- Anzeigename: im Team und ab der C-Jugend voll, sonst nur Initiale
create or replace function rank_display_name(p_nickname text, p_birth_year int, p_is_me boolean, p_scope text) returns text
language sql immutable as $$
  select case when p_is_me or p_scope = 'team' or u_class(p_birth_year) >= 14 then p_nickname
              else left(p_nickname, 1) || '.' end;
$$;

-- Rangliste (ersetzt 0013, gleiche Ausgabe)
create or replace function rankings(p_player uuid, p_scope text, p_period text default 'season')
returns table (rank int, player_id uuid, nickname text, club_name text, team_name text,
               points int, entries int, is_me boolean, total int, locked boolean, scope_label text)
language plpgsql stable security definer set search_path = public as $$
declare
  since timestamptz;
  season_ text;
  can_see boolean;
  label text;
begin
  if not (is_player_owner(p_player) or is_platform_admin()) then raise exception 'Nur für eigene Spieler.'; end if;
  if p_scope not in ('team', 'league', 'region', 'national') then raise exception 'Unbekannte Rangliste.'; end if;
  since := case when p_period = 'month' then now() - interval '30 days' else '-infinity'::timestamptz end;
  season_ := coalesce((select t.season from teams t where t.id = active_team_of(p_player)), current_season());
  can_see := p_scope = 'team' or is_premium(p_player) or is_platform_admin();
  label := rank_scope_label(p_player, p_scope);

  return query
  with scored as (
    select rp.*, coalesce(sum(entry_points(e.level, e.achieved)), 0)::int as pts, count(e.id)::int as n
      from rank_pool(p_player, p_scope) rp
      left join exercise_entries e on e.player_id = rp.player_id and e.status = 'confirmed' and e.created_at >= since
            and (p_period = 'month' or e.season = season_)
     group by rp.player_id, rp.nickname, rp.birth_year, rp.club_name, rp.team_name
  ), ranked as (
    select s.*, (rank() over (order by s.pts desc))::int as rk, (count(*) over ())::int as cnt from scored s
  )
  select r.rk, r.player_id, rank_display_name(r.nickname, r.birth_year, r.player_id = p_player, p_scope),
         r.club_name, r.team_name, r.pts, r.n, r.player_id = p_player, r.cnt, not can_see, label
    from ranked r
   where r.player_id = p_player or (can_see and r.rk <= 50)
   order by r.rk, r.nickname;
end $$;

-- Übersicht für die Startseite: Platz je Bereich, Veränderung zur Vorwoche, Abstand zum nächsten Platz
create or replace function my_rank_overview(p_player uuid)
returns table (scope text, label text, rank int, total int, points int, rank_week_ago int,
               points_to_next int, next_name text, locked boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  s text;
  season_ text;
  can_see boolean;
begin
  if not (is_player_owner(p_player) or is_platform_admin()) then raise exception 'Nur für eigene Spieler.'; end if;
  season_ := coalesce((select t.season from teams t where t.id = active_team_of(p_player)), current_season());
  foreach s in array array['team', 'league', 'region', 'national'] loop
    can_see := s = 'team' or is_premium(p_player) or is_platform_admin();
    return query
    with scored as (
      select rp.player_id, rp.nickname, rp.birth_year,
             coalesce(sum(entry_points(e.level, e.achieved)), 0)::int as pts,
             coalesce(sum(entry_points(e.level, e.achieved)) filter (where e.created_at < now() - interval '7 days'), 0)::int as pts_old
        from rank_pool(p_player, s) rp
        left join exercise_entries e on e.player_id = rp.player_id and e.status = 'confirmed' and e.season = season_
       group by rp.player_id, rp.nickname, rp.birth_year
    ), ranked as (
      select sc.*, (rank() over (order by sc.pts desc))::int as rk,
             (rank() over (order by sc.pts_old desc))::int as rk_old,
             (count(*) over ())::int as cnt
        from scored sc
    ), me as (select * from ranked where player_id = p_player),
    above as (
      select r.* from ranked r, me where r.pts > me.pts order by r.pts asc, r.nickname limit 1
    )
    select s, rank_scope_label(p_player, s), me.rk, me.cnt, me.pts, me.rk_old,
           (select a.pts - me.pts + 1 from above a),
           case when can_see then (select rank_display_name(a.nickname, a.birth_year, false, s) from above a) end,
           not can_see
      from me;
  end loop;
end $$;
revoke execute on function my_rank_overview(uuid) from public, anon;
grant execute on function my_rank_overview(uuid) to authenticated;

-- ───────────────────────── Team-Aktivität ─────────────────────────
-- Erfolge der letzten 14 Tage im eigenen Team (nur bestätigt, nur Ziel geschafft)
create or replace function team_feed(p_team uuid)
returns table (player_id uuid, nickname text, exercise_id text, level level, value numeric, at timestamptz, is_mine boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_team_staff(p_team) or is_platform_admin() or exists (
      select 1 from team_members m where m.team_id = p_team and m.status = 'approved' and m.to_date is null
         and is_player_owner(m.player_id))) then
    raise exception 'Nur für Mitglieder des Teams.';
  end if;
  return query
  select p.id, p.nickname, e.exercise_id, e.level, e.value, coalesce(e.trainer_confirmed_at, e.created_at), is_player_owner(p.id)
    from team_members m
    join players p on p.id = m.player_id and p.anonymized_at is null
    join exercise_entries e on e.player_id = p.id and e.status = 'confirmed' and e.achieved
   where m.team_id = p_team and m.status = 'approved' and m.to_date is null
     and e.created_at > now() - interval '14 days'
   order by (e.level = 'gold') desc, e.created_at desc
   limit 8;
end $$;
revoke execute on function team_feed(uuid) from public, anon;
grant execute on function team_feed(uuid) to authenticated;

-- ───────────────────────── Nachrichten ─────────────────────────
-- Nur Erwachsene mit Rolle schreiben (Go4Pro-Admin, Vereins-Admin, Team-Trainer). Kein Chat zwischen Kindern.
create table if not exists news (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references clubs (id),
  team_id uuid references teams (id),
  kind text not null default 'info' check (kind in ('info', 'training', 'spiel', 'lob', 'tipp')),
  title text not null check (length(title) between 2 and 120),
  body text not null default '' check (length(body) <= 2000),
  link_url text check (link_url is null or link_url ~ '^https://'),
  author_label text not null,
  pinned boolean not null default false,
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  archived_at timestamptz,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  is_test boolean not null default false
);
create index if not exists news_scope on news (team_id, club_id, published_at desc);
alter table news enable row level security;
-- Zugriff nur über die Funktionen unten
create trigger news_no_delete before delete on news for each row execute function forbid_delete();
create trigger news_audit after insert or update on news for each row execute function audit_trigger();

create or replace function my_news(p_player uuid, p_limit int default 20)
returns table (id uuid, kind text, title text, body text, link_url text, author_label text, pinned boolean,
               published_at timestamptz, scope text)
language plpgsql stable security definer set search_path = public as $$
declare
  tid uuid;
  cid uuid;
begin
  if not (is_player_owner(p_player) or is_platform_admin()) then raise exception 'Nur für eigene Spieler.'; end if;
  tid := active_team_of(p_player);
  cid := (select t.club_id from teams t where t.id = tid);
  return query
  select n.id, n.kind, n.title, n.body, n.link_url, n.author_label, n.pinned, n.published_at,
         case when n.team_id is not null then 'team' when n.club_id is not null then 'club' else 'global' end
    from news n
   where n.archived_at is null and n.published_at <= now() and (n.expires_at is null or n.expires_at > now())
     and ((n.team_id is null and n.club_id is null) or n.team_id = tid or (n.team_id is null and n.club_id = cid))
   order by n.pinned desc, n.published_at desc
   limit least(greatest(p_limit, 1), 50);
end $$;

-- p_scope: global | club | team
create or replace function post_news(p_scope text, p_target uuid, p_kind text, p_title text, p_body text,
                                      p_link text default null, p_pinned boolean default false, p_days int default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  nid uuid;
  lbl text;
  cid uuid;
begin
  if p_scope = 'global' then
    if not is_platform_admin() then raise exception 'Nur Go4Pro-Admins.'; end if;
    lbl := 'Go4Pro';
  elsif p_scope = 'club' then
    if not (is_club_admin(p_target) or is_platform_admin()) then raise exception 'Nur Vereins-Admins.'; end if;
    lbl := (select name from clubs where id = p_target);
  elsif p_scope = 'team' then
    if not (is_team_staff(p_target) or is_platform_admin()) then raise exception 'Nur Trainer*innen des Teams.'; end if;
    select t.club_id, 'Trainer-Team ' || t.name into cid, lbl from teams t where t.id = p_target;
  else
    raise exception 'Unbekannter Empfängerkreis.';
  end if;
  insert into news (club_id, team_id, kind, title, body, link_url, author_label, pinned, expires_at, created_by)
  values (case p_scope when 'club' then p_target when 'team' then cid end,
          case when p_scope = 'team' then p_target end,
          coalesce(p_kind, 'info'), trim(p_title), coalesce(trim(p_body), ''), nullif(trim(p_link), ''), lbl,
          coalesce(p_pinned, false), case when p_days > 0 then now() + make_interval(days => p_days) end, auth.uid())
  returning id into nid;
  return nid;
end $$;

create or replace function archive_news(p_news uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  n news;
begin
  select * into n from news where id = p_news;
  if not found then raise exception 'Nachricht nicht gefunden.'; end if;
  if not (n.created_by = auth.uid() or is_platform_admin()
          or (n.team_id is null and n.club_id is not null and is_club_admin(n.club_id))
          or (n.team_id is not null and is_team_staff(n.team_id))) then
    raise exception 'Keine Berechtigung.';
  end if;
  update news set archived_at = now() where id = p_news;
end $$;

-- Nachrichten, die jemand selbst verwalten darf (für Trainer-/Admin-Ansicht)
create or replace function manageable_news()
returns table (id uuid, title text, author_label text, published_at timestamptz, archived_at timestamptz, scope text)
language sql stable security definer set search_path = public as $$
  select n.id, n.title, n.author_label, n.published_at, n.archived_at,
         case when n.team_id is not null then 'team' when n.club_id is not null then 'club' else 'global' end
    from news n
   where n.created_by = auth.uid() or is_platform_admin()
      or (n.team_id is not null and is_team_staff(n.team_id))
      or (n.team_id is null and n.club_id is not null and is_club_admin(n.club_id))
   order by n.published_at desc
   limit 50;
$$;

revoke execute on function my_news(uuid, int), post_news(text, uuid, text, text, text, text, boolean, int),
  archive_news(uuid), manageable_news() from public, anon;
grant execute on function my_news(uuid, int), post_news(text, uuid, text, text, text, text, boolean, int),
  archive_news(uuid), manageable_news() to authenticated;

-- ───────────────────────── Werbung (kindgerecht) ─────────────────────────
-- Regeln: als „Anzeige“ gekennzeichnet, vorab von Go4Pro freigegeben, keine personenbezogene Auswertung
-- (nur Summen für Einblendungen/Klicks), kein Profiling (DSA Art. 28). Ausspielung nur nach Kontext:
-- Vereinssponsor des eigenen Vereins oder allgemeine Partner. Premium ist frei von allgemeiner Werbung.
create table if not exists ads (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references clubs (id),            -- null = allgemeiner Go4Pro-Partner, sonst Vereinssponsor
  sponsor text not null check (length(sponsor) between 2 and 80),
  title text not null check (length(title) between 2 and 80),
  body text not null default '' check (length(body) <= 240),
  cta_label text not null default 'Mehr erfahren' check (length(cta_label) <= 30),
  link_url text check (link_url is null or link_url ~ '^https://'),
  image_url text check (image_url is null or image_url ~ '^https://'),
  category text not null default 'sport' check (category in ('sport', 'camp', 'verein', 'bildung', 'gesundheit', 'sonstiges')),
  status text not null default 'entwurf' check (status in ('entwurf', 'aktiv', 'pausiert', 'beendet')),
  active_from date not null default current_date,
  active_until date,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  price_cents int,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  approved_by uuid references profiles (id),
  is_test boolean not null default false
);
alter table ads enable row level security;
create trigger ads_no_delete before delete on ads for each row execute function forbid_delete();
create trigger ads_audit after insert or update on ads for each row execute function audit_trigger();

-- Eine Anzeige für die Startseite. Zählt nur die Einblendung (ohne Bezug zur Person).
create or replace function home_ad(p_player uuid)
returns table (id uuid, sponsor text, title text, body text, cta_label text, link_url text, image_url text, is_club_sponsor boolean)
language plpgsql volatile security definer set search_path = public as $$
declare
  cid uuid;
  a ads;
begin
  if not (is_player_owner(p_player) or is_platform_admin()) then raise exception 'Nur für eigene Spieler.'; end if;
  cid := (select t.club_id from teams t where t.id = active_team_of(p_player));
  select * into a from ads x
   where x.status = 'aktiv' and x.active_from <= current_date and (x.active_until is null or x.active_until >= current_date)
     and ((cid is not null and x.club_id = cid) or (x.club_id is null and not is_premium(p_player)))
   order by (x.club_id is not null) desc, random()
   limit 1;
  if not found then return; end if;
  update ads set impressions = impressions + 1 where ads.id = a.id;
  return query select a.id, a.sponsor, a.title, a.body, a.cta_label, a.link_url, a.image_url, a.club_id is not null;
end $$;

create or replace function ad_click(p_ad uuid) returns void
language sql security definer set search_path = public as $$
  update ads set clicks = clicks + 1 where id = p_ad and status = 'aktiv';
$$;

-- Verwaltung: Go4Pro-Admins alle, Vereins-Admins die Sponsoren ihres Vereins (Freigabe trotzdem durch Go4Pro)
create or replace function manage_ads()
returns table (id uuid, club_id uuid, club_name text, sponsor text, title text, body text, cta_label text, link_url text,
               image_url text, category text, status text, active_from date, active_until date, impressions bigint,
               clicks bigint, price_cents int, approved boolean)
language sql stable security definer set search_path = public as $$
  select a.id, a.club_id, c.name, a.sponsor, a.title, a.body, a.cta_label, a.link_url, a.image_url, a.category, a.status,
         a.active_from, a.active_until, a.impressions, a.clicks, a.price_cents, a.approved_by is not null
    from ads a left join clubs c on c.id = a.club_id
   where is_platform_admin() or (a.club_id is not null and is_club_admin(a.club_id))
   order by a.status = 'aktiv' desc, a.created_at desc;
$$;

create or replace function save_ad(p_id uuid, p_club uuid, p_sponsor text, p_title text, p_body text, p_cta text,
                                   p_link text, p_image text, p_category text, p_from date, p_until date, p_price int)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  aid uuid := p_id;
begin
  if not (is_platform_admin() or (p_club is not null and is_club_admin(p_club))) then raise exception 'Keine Berechtigung.'; end if;
  if aid is null then
    insert into ads (club_id, sponsor, title, body, cta_label, link_url, image_url, category, active_from, active_until,
                     price_cents, created_by)
    values (p_club, trim(p_sponsor), trim(p_title), coalesce(trim(p_body), ''), coalesce(nullif(trim(p_cta), ''), 'Mehr erfahren'),
            nullif(trim(p_link), ''), nullif(trim(p_image), ''), coalesce(p_category, 'sport'), coalesce(p_from, current_date),
            p_until, p_price, auth.uid())
    returning id into aid;
  else
    if not exists (select 1 from ads where id = aid and (is_platform_admin() or (club_id is not null and is_club_admin(club_id)))) then
      raise exception 'Keine Berechtigung.';
    end if;
    -- Inhaltliche Änderung braucht eine neue Freigabe
    update ads set sponsor = trim(p_sponsor), title = trim(p_title), body = coalesce(trim(p_body), ''),
                   cta_label = coalesce(nullif(trim(p_cta), ''), 'Mehr erfahren'), link_url = nullif(trim(p_link), ''),
                   image_url = nullif(trim(p_image), ''), category = coalesce(p_category, 'sport'),
                   active_from = coalesce(p_from, current_date), active_until = p_until,
                   price_cents = case when is_platform_admin() then p_price else price_cents end,
                   approved_by = case when is_platform_admin() then auth.uid() end,
                   status = case when is_platform_admin() then status else 'entwurf' end
     where id = aid;
  end if;
  return aid;
end $$;

-- Status ändern. Aktivieren nur durch Go4Pro (Prüfung auf Kindgerechtigkeit).
create or replace function set_ad_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare
  a ads;
begin
  select * into a from ads where id = p_id;
  if not found then raise exception 'Anzeige nicht gefunden.'; end if;
  if p_status = 'aktiv' then
    if not is_platform_admin() then raise exception 'Anzeigen schaltet Go4Pro nach Prüfung frei.'; end if;
    update ads set status = 'aktiv', approved_by = auth.uid() where id = p_id;
  elsif p_status in ('pausiert', 'beendet', 'entwurf') then
    if not (is_platform_admin() or (a.club_id is not null and is_club_admin(a.club_id))) then raise exception 'Keine Berechtigung.'; end if;
    update ads set status = p_status where id = p_id;
  else
    raise exception 'Unbekannter Status.';
  end if;
end $$;

revoke execute on function home_ad(uuid), ad_click(uuid), manage_ads(),
  save_ad(uuid, uuid, text, text, text, text, text, text, text, date, date, int), set_ad_status(uuid, text) from public, anon;
grant execute on function home_ad(uuid), ad_click(uuid), manage_ads(),
  save_ad(uuid, uuid, text, text, text, text, text, text, text, date, date, int), set_ad_status(uuid, text) to authenticated;
