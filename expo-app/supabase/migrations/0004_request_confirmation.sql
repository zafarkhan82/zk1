-- Trainer-Bestätigung anfragen (Premium). Setzt den zuständigen Team-Trainer am Eintrag.
-- Die Bestätigungs-Mails verschickt anschließend der Mail-Dienst (Edge Function).

-- trainer_user_id ist keine fachliche Änderung → nicht an das 12-h-Fenster gebunden.
create or replace function entry_edit_window() returns trigger
language plpgsql set search_path = public as $$
declare
  ignore_cols text[] := array['status','player_confirmed_at','trainer_confirmed_at','updated_at','version','trainer_user_id'];
  changed boolean;
begin
  if (new.status, new.player_confirmed_at, new.trainer_confirmed_at, new.version)
     is distinct from (old.status, old.player_confirmed_at, old.trainer_confirmed_at, old.version)
     and coalesce(current_setting('kick.confirming', true), '') <> 'on' then
    raise exception 'Bestätigungen sind nur über den E-Mail-Link möglich.';
  end if;
  if new.trainer_user_id is distinct from old.trainer_user_id
     and coalesce(current_setting('kick.requesting', true), '') <> 'on' then
    raise exception 'Trainer-Bestätigungen bitte über die App anfragen.';
  end if;
  changed := (to_jsonb(new) - ignore_cols) is distinct from (to_jsonb(old) - ignore_cols);
  if not changed then
    return new;
  end if;
  if now() > old.created_at + interval '12 hours' then
    raise exception 'Änderungen sind nur innerhalb von 12 Stunden nach dem Eintragen möglich.';
  end if;
  new.version := old.version + 1;
  new.status := 'pending';
  new.player_confirmed_at := null;
  new.trainer_confirmed_at := null;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function entry_edit_window() from public, anon, authenticated;

create or replace function request_trainer_confirmation(p_entry uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  e exercise_entries;
  trainer uuid;
begin
  select * into e from exercise_entries where id = p_entry;
  if not found then raise exception 'Eintrag nicht gefunden.'; end if;
  if not exists (select 1 from players where id = e.player_id
                  and (guardian_user_id = auth.uid() or own_user_id = auth.uid())) then
    raise exception 'Nur für eigene Einträge.';
  end if;
  if not is_premium(e.player_id) then
    raise exception 'Trainer-Bestätigungen sind eine Premium-Funktion.';
  end if;
  if e.trainer_user_id is not null then
    return e.trainer_user_id;
  end if;
  select s.user_id into trainer
    from team_members m join team_staff s on s.team_id = m.team_id
   where m.player_id = e.player_id and m.status = 'approved' and m.to_date is null
     and s.status = 'approved' and s.to_date is null
   order by s.created_at limit 1;
  if trainer is null then
    raise exception 'Kein freigeschalteter Trainer im Team. Tritt zuerst einem Team bei.';
  end if;
  perform set_config('kick.requesting', 'on', true);
  update exercise_entries set trainer_user_id = trainer where id = p_entry;
  return trainer;
end $$;
revoke execute on function request_trainer_confirmation(uuid) from public, anon;

-- Übersicht für die App: Teams des Spielers mit Status
create or replace function my_teams(p_player uuid)
returns table (member_id uuid, team_id uuid, team_name text, club_name text, status approval_status, jersey_number int)
language sql stable security definer set search_path = public as $$
  select m.id, t.id, t.name, c.name, m.status, m.jersey_number
    from team_members m join teams t on t.id = m.team_id join clubs c on c.id = t.club_id
   where m.player_id = p_player and m.to_date is null and can_manage_player(p_player);
$$;
revoke execute on function my_teams(uuid) from public, anon;
