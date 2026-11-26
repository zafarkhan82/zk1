-- Go4Pro 0025: Rolle beim Einstieg (Eltern, Spieler*in, Trainer*in, Admin) – steuert Startseite und Menü.
alter table profiles add column if not exists app_mode text check (app_mode in ('eltern', 'spieler', 'trainer', 'admin'));

create or replace function set_app_mode(p_mode text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Bitte anmelden.'; end if;
  if p_mode is not null and p_mode not in ('eltern', 'spieler', 'trainer', 'admin') then raise exception 'Unbekannte Rolle.'; end if;
  update profiles set app_mode = p_mode where id = auth.uid();
end $$;
revoke execute on function set_app_mode(text) from public, anon;
grant execute on function set_app_mode(text) to authenticated;

create or replace function my_app_mode() returns text
language sql stable security definer set search_path = public as $$
  select app_mode from profiles where id = auth.uid();
$$;
revoke execute on function my_app_mode() from public, anon;
grant execute on function my_app_mode() to authenticated;
