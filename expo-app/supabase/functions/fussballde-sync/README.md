# fussball.de-Anbindung

Abgleich von Vereinen, Jugendteams (E–A), Spielplänen und Ergebnissen über die **offizielle** API von
fussball.de / DFBnet. Kein Auslesen der Webseite (Scraping) – das verbieten die Nutzungsbedingungen.

## Wenn der DFB den Zugang freigibt

1. **Zugangsdaten hinterlegen** (Supabase → Edge Functions → Secrets):
   - `FUSSBALLDE_API_BASE` – Basis-Adresse der API aus der Dokumentation
   - `FUSSBALLDE_API_KEY` – API-Schlüssel bzw. Token
2. **Adapter anpassen**: In `index.ts` den Abschnitt `ADAPTER` an die Dokumentation anpassen
   (Pfade, Feldnamen, ggf. Art der Anmeldung). Nur dieser Abschnitt ist API-spezifisch.
3. Function neu deployen und im Admin-Bereich „Alle Vereine abgleichen“ testen.
4. Optional: täglichen Abgleich per `pg_cron` einrichten.

## Was fest eingebaut ist

- Protokoll jedes Laufs (`sync_runs`) inkl. Fehlermeldung
- Zwischenspeicher mit Originaldaten (`import_fussballde`) zur Nachvollziehbarkeit
- Übernahme nur per Anlegen/Aktualisieren – **nie Löschen**. Spiele, die bei fussball.de verschwinden,
  bleiben erhalten und werden nur als „nicht mehr gemeldet“ markiert.
- Ergebnisse von fussball.de können in der App nicht von Hand überschrieben werden.
- Nur Jugendteams E–A werden übernommen (Altersklasse aus dem Mannschaftsnamen, z. B. „D-Junioren“, „U13“).
- Rate-Limit: pro Verein höchstens ein Abgleich alle 15 Minuten.
- Berechtigung: Vereins-Admin für den eigenen Verein, Plattform-Admin für alle.

## Was die API voraussichtlich nicht liefert

Spielerdaten (Spielerpass, Einsätze einzelner Spieler) sind im DFBnet geschützt und kommen in der Regel
nicht über eine öffentliche Schnittstelle. Einsatzminuten, Tore und Vorlagen erfassen weiterhin Trainer
in Go4Pro (doppelt bestätigt).
