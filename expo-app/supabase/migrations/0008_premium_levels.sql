-- Stärkegrade Silber und Gold sind Premium. Ohne aktives Premium wird nur Bronze gespeichert.
-- Bereits vorhandene Einträge bleiben erhalten (nichts wird gelöscht).

create or replace function check_entry_premium() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.trainer_user_id is not null and not is_premium(new.player_id) then
    raise exception 'Trainer-Bestätigungen sind eine Premium-Funktion.';
  end if;
  if new.level in ('silber', 'gold') and not is_premium(new.player_id) then
    raise exception 'Silber und Gold sind Premium. Bitte zuerst Premium freischalten.';
  end if;
  return new;
end $$;
revoke execute on function check_entry_premium() from public, anon, authenticated;

-- Auch beim nachträglichen Ändern (12-h-Fenster) darf nicht auf Silber/Gold gewechselt werden.
create trigger exercise_entries_premium_update before update of level on exercise_entries
  for each row when (new.level is distinct from old.level)
  execute function check_entry_premium();
