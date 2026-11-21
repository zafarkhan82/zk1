-- Eltern bzw. Spieler (ab 16) dürfen ihr eigenes Profil direkt lesen.
-- Nötig, damit ein neu angelegter Spieler sofort zurückgegeben werden kann
-- (can_manage_player sieht den gerade eingefügten Datensatz innerhalb derselben Anweisung noch nicht).
create policy "Spieler lesen (eigene)" on players for select
  using (guardian_user_id = auth.uid() or own_user_id = auth.uid());
