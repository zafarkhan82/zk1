-- Härtung nach Supabase-Sicherheitscheck

-- Fester Suchpfad für alle Trigger-Funktionen
alter function forbid_delete() set search_path = public;
alter function entry_edit_window() set search_path = public;
alter function entry_insert_defaults() set search_path = public;
alter function protect_consent() set search_path = public;

-- Trigger-Funktionen sind nicht für direkte Aufrufe über die API gedacht.
revoke execute on function audit_trigger() from public, anon, authenticated;
revoke execute on function protect_profile_role() from public, anon, authenticated;
revoke execute on function forbid_delete() from public, anon, authenticated;
revoke execute on function entry_edit_window() from public, anon, authenticated;
revoke execute on function entry_insert_defaults() from public, anon, authenticated;
revoke execute on function protect_consent() from public, anon, authenticated;

-- Anonymisieren nur für angemeldete Nutzer (Funktion prüft zusätzlich auf Plattform-Admin).
revoke execute on function anonymize_player(uuid) from public, anon;

-- Hinweis: public_players, public_rankings und public_match_stats sind bewusst Views mit den
-- Rechten des Besitzers. Sie geben nur Spitzname, Jahrgang, Position, Verein und Punkte von
-- Spielern mit Eltern-Zustimmung frei – ohne die privaten Tabellen für anonyme Nutzer zu öffnen.
-- confirm_by_token bleibt für anon aufrufbar: Der Bestätigungslink in der E-Mail braucht keine Anmeldung.
