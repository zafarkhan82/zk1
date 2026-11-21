-- Vereinsmitgliedschaften: Vereins-Admins dürfen nur den Status (freigeben/ablehnen) und das Enddatum ändern.
create or replace function protect_club_membership() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_platform_admin() then return new; end if;
  if (new.club_id, new.user_id, new.role, new.valid_from, new.created_at, new.is_nlz, new.license)
     is distinct from (old.club_id, old.user_id, old.role, old.valid_from, old.created_at, old.is_nlz, old.license) then
    raise exception 'Verein, Person und Rolle einer Mitgliedschaft können nicht geändert werden.';
  end if;
  if new.user_id = auth.uid() and new.status is distinct from old.status then
    raise exception 'Die eigene Freigabe kann man nicht selbst ändern.';
  end if;
  if new.status is distinct from old.status then new.approved_by := auth.uid(); end if;
  return new;
end $$;
revoke execute on function protect_club_membership() from public, anon, authenticated;
create trigger club_memberships_protect before update on club_memberships
  for each row execute function protect_club_membership();
