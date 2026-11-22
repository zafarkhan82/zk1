import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Field, Row, SectionTitle, T } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { errorText, supabase } from '@/lib/supabase';

interface Status {
  linked_club_id: string | null;
  last_sync: string | null;
  last_status: 'laeuft' | 'ok' | 'fehler' | 'nicht_eingerichtet' | null;
  last_message: string | null;
  teams_linked: number;
  matches_synced: number;
}

interface Team {
  team_id: string;
  name: string;
  season: string;
  active: boolean;
}

/** fussball.de-Anbindung eines Vereins: IDs verknüpfen, abgleichen, Status. */
export function FussballdePanel({ clubId, teams, onSynced }: { clubId: string; teams: Team[]; onSynced: () => void }) {
  const theme = useTheme();
  const [status, setStatus] = useState<Status | null>(null);
  const [clubExt, setClubExt] = useState('');
  const [teamExt, setTeamExt] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('fussballde_status', { p_club: clubId });
    const s = ((data as Status[]) ?? [])[0] ?? null;
    setStatus(s);
    setClubExt(s?.linked_club_id ?? '');
  }, [clubId]);

  useEffect(() => {
    load();
  }, [load]);

  const linkClub = async () => {
    setMsg('');
    const { error } = await supabase.rpc('link_club_fussballde', { p_club: clubId, p_external: clubExt });
    setMsg(error ? '❌ ' + errorText(error) : '✅ Verein verknüpft');
    load();
  };

  const linkTeam = async (teamId: string) => {
    setMsg('');
    const { error } = await supabase.rpc('link_team_fussballde', { p_team: teamId, p_external: teamExt[teamId] ?? '' });
    setMsg(error ? '❌ ' + errorText(error) : '✅ Team verknüpft');
    load();
  };

  const sync = async () => {
    setBusy(true);
    setMsg('');
    const { data, error } = await supabase.functions.invoke('fussballde-sync', { body: { club_id: clubId } });
    setBusy(false);
    if (error) {
      // Fehlertext aus der Antwort der Funktion lesen
      let text = errorText(error);
      try {
        const body = await (error as { context?: Response }).context?.json();
        if (body?.error || body?.message) text = body.error ?? body.message;
      } catch {
        // ignorieren
      }
      setMsg('❌ ' + text);
    } else if (data?.status === 'nicht_eingerichtet') {
      setMsg('ℹ️ ' + data.message + ' Sobald der DFB den Zugang freigibt, läuft der Abgleich automatisch.');
    } else {
      setMsg(`✅ Abgeglichen: ${data?.teams ?? 0} Teams, ${data?.matches ?? 0} Spiele`);
      onSynced();
    }
    load();
  };

  const statusText =
    status?.last_status === 'ok'
      ? `✅ Zuletzt abgeglichen am ${new Date(status.last_sync!).toLocaleString('de-DE')}`
      : status?.last_status === 'fehler'
        ? `❌ Letzter Abgleich fehlgeschlagen: ${status.last_message}`
        : status?.last_status === 'nicht_eingerichtet'
          ? 'ℹ️ Der API-Zugang zu fussball.de ist beantragt und wird bald freigeschaltet.'
          : 'Noch kein Abgleich.';

  return (
    <View style={{ gap: 12 }}>
      <T size={13} color="textSecondary">
        Verknüpfe euren Verein und eure Teams mit fussball.de. Dann kommen Spielpläne, Ergebnisse und Staffeln automatisch in
        die App. Es wird nie etwas gelöscht – abgesagte Spiele werden nur ausgeblendet.
      </T>
      <Card>
        <T weight="700">Status</T>
        <T size={14}>{statusText}</T>
        <T size={13} color="textSecondary">
          {status?.teams_linked ?? 0} Teams verknüpft · {status?.matches_synced ?? 0} Spiele von fussball.de
        </T>
        <Button title={busy ? 'Gleiche ab …' : '🔄 Jetzt abgleichen'} disabled={busy || !status?.linked_club_id} onPress={sync} />
      </Card>

      <SectionTitle>Verein verknüpfen</SectionTitle>
      <Card>
        <Field
          label="fussball.de-Vereins-ID"
          placeholder="steht in der Adresse eurer Vereinsseite auf fussball.de"
          autoCapitalize="characters"
          value={clubExt}
          onChangeText={setClubExt}
        />
        <Button title="Verknüpfen" variant="secondary" disabled={clubExt.trim().length < 5} onPress={linkClub} />
        <T size={12} color="textSecondary">
          Tipp: Öffne eure Vereinsseite auf fussball.de. Die lange Kennung am Ende der Adresse (nach „/id/“) ist die Vereins-ID.
        </T>
      </Card>

      <SectionTitle>Teams verknüpfen</SectionTitle>
      <T size={13} color="textSecondary">
        Optional: Teams werden beim Abgleich automatisch angelegt. Bestehende Go4Pro-Teams kannst du hier mit der Mannschafts-ID
        verbinden, damit nichts doppelt entsteht.
      </T>
      {teams
        .filter((t) => t.active)
        .map((t) => (
          <Card key={t.team_id}>
            <T weight="700">
              {t.name} ({t.season})
            </T>
            <Row>
              <View style={{ flex: 1 }}>
                <Field
                  label="fussball.de-Mannschafts-ID"
                  autoCapitalize="characters"
                  value={teamExt[t.team_id] ?? ''}
                  onChangeText={(v) => setTeamExt((x) => ({ ...x, [t.team_id]: v }))}
                />
              </View>
            </Row>
            <Button title="Team verknüpfen" variant="secondary" disabled={(teamExt[t.team_id] ?? '').trim().length < 5} onPress={() => linkTeam(t.team_id)} />
          </Card>
        ))}

      {!!msg && (
        <Card style={{ borderColor: msg.startsWith('❌') ? theme.danger : theme.primary }}>
          <T size={14}>{msg}</T>
        </Card>
      )}
    </View>
  );
}

interface Match {
  match_id: string;
  kickoff: string;
  opponent: string;
  is_home: boolean;
  competition: string | null;
  venue: string | null;
  goals_for: number | null;
  goals_against: number | null;
  from_fussballde: boolean;
}

/** Spielplan eines Teams (kommende Spiele zuerst, danach Ergebnisse) */
export function TeamSchedule({ teamId }: { teamId: string }) {
  const theme = useTheme();
  const [matches, setMatches] = useState<Match[]>([]);

  useEffect(() => {
    supabase.rpc('team_schedule', { p_team: teamId }).then(({ data }) => setMatches((data as Match[]) ?? []));
  }, [teamId]);

  if (matches.length === 0) return null;
  const now = Date.now();
  const upcoming = matches.filter((m) => new Date(m.kickoff).getTime() >= now).slice(0, 5);
  const past = matches.filter((m) => new Date(m.kickoff).getTime() < now).slice(-5).reverse();

  const line = (m: Match) => (
    <View key={m.match_id} style={{ gap: 2, paddingVertical: 4 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T weight="700" style={{ flex: 1 }}>
          {m.is_home ? 'vs. ' : '@ '}
          {m.opponent}
        </T>
        {m.goals_for !== null && (
          <T
            weight="800"
            style={{ color: m.goals_for > (m.goals_against ?? 0) ? theme.primary : m.goals_for < (m.goals_against ?? 0) ? theme.danger : theme.text }}>
            {m.goals_for}:{m.goals_against}
          </T>
        )}
      </Row>
      <T size={12} color="textSecondary">
        {new Date(m.kickoff).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        {m.competition ? ` · ${m.competition}` : ''}
        {m.venue ? ` · ${m.venue}` : ''}
        {m.from_fussballde ? ' · fussball.de' : ''}
      </T>
    </View>
  );

  return (
    <Card>
      {upcoming.length > 0 && <T weight="700">📅 Nächste Spiele</T>}
      {upcoming.map(line)}
      {past.length > 0 && (
        <T weight="700" style={{ marginTop: 8 }}>
          🏁 Letzte Ergebnisse
        </T>
      )}
      {past.map(line)}
    </Card>
  );
}
