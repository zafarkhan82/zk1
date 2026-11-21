import { useEffect, useState } from 'react';

import { Button, Card, EmptyState, Field, Row, Screen, T } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useStore } from '@/lib/store';
import { errorText, supabase } from '@/lib/supabase';

const STATUS = { pending: '⏳ wartet auf Trainer', approved: '✅ im Team', rejected: '❌ abgelehnt' } as const;

export default function Team() {
  const { teams, joinTeam, state } = useStore();
  const theme = useTheme();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [history, setHistory] = useState<
    { club_name: string; team_name: string; season: string; age_group: string; from_date: string; to_date: string | null; jersey_number: number | null }[]
  >([]);

  useEffect(() => {
    if (!state.profile) return;
    supabase.rpc('my_club_history', { p_player: state.profile.id }).then(({ data }) => setHistory((data as typeof history) ?? []));
  }, [state.profile, teams]);

  const join = async () => {
    setBusy(true);
    setMsg('');
    try {
      await joinTeam(code);
      setCode('');
      setMsg('Anfrage gesendet! Der Trainer muss sie noch bestätigen.');
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen bottomBar={false} topInset={false}>
      <T size={24} weight="800">
        Team von {state.profile?.nickname}
      </T>

      {teams.length === 0 && (
        <EmptyState
          emoji="👥"
          title="Noch in keinem Team"
          text="Frag deinen Trainer nach dem 6-stelligen Team-Code und gib ihn unten ein. Danach kann er deine Silber- und Gold-Leistungen freigeben."
        />
      )}

      {teams.map((t) => (
        <Card key={t.memberId}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T weight="800">{t.teamName}</T>
            {t.jerseyNumber !== null && <T weight="800">#{t.jerseyNumber}</T>}
          </Row>
          <T size={14} color="textSecondary">
            {t.clubName}
          </T>
          <T size={14} weight="600" style={{ color: t.status === 'approved' ? theme.primary : theme.textSecondary }}>
            {STATUS[t.status]}
          </T>
        </Card>
      ))}

      <Card>
        <T weight="700">Team beitreten</T>
        <Field
          label="Team-Code"
          placeholder="z. B. AB12CD"
          autoCapitalize="characters"
          value={code}
          onChangeText={(v) => setCode(v.toUpperCase())}
          maxLength={6}
        />
        <Button title={busy ? 'Sende …' : 'Beitreten'} onPress={join} disabled={code.trim().length !== 6 || busy} />
        {!!msg && <T size={14}>{msg}</T>}
      </Card>

      {history.length > 0 && (
        <Card>
          <T weight="700">📜 Vereinshistorie</T>
          {history.map((h, i) => (
            <T key={i} size={14} color={h.to_date ? 'textSecondary' : 'text'}>
              {h.season} · {h.club_name} · {h.team_name} ({h.age_group}-Jugend){h.jersey_number ? ` · #${h.jersey_number}` : ''}
              {h.to_date ? ` · bis ${new Date(h.to_date).toLocaleDateString('de-DE')}` : ' · aktuell'}
            </T>
          ))}
        </Card>
      )}

      <T size={12} color="textSecondary">
        Ein Vereinswechsel wird dokumentiert: Die alte Mitgliedschaft bleibt in der Historie erhalten.
      </T>
    </Screen>
  );
}
