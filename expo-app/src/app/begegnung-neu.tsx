import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Chip, EmptyState, Field, H, Label, Screen, T, Wrap } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { KIND, type EncounterKind } from '@/lib/ratings';
import { useStore } from '@/lib/store';
import { errorText, supabase } from '@/lib/supabase';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const DAYS = [0, 1, 2, 3, 4, 5, 6].map((i) => {
  const d = new Date();
  d.setDate(d.getDate() - i);
  return { iso: iso(d), label: i === 0 ? 'Heute' : i === 1 ? 'Gestern' : d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }) };
});

/** Trainer*in legt eine Begegnung an – danach können alle Beteiligten 7 Tage lang bewerten */
export default function BegegnungNeu() {
  const { staff } = useStore();
  const theme = useTheme();
  const teams = useMemo(
    () => staff.filter((s) => s.teamId && s.membershipStatus === 'approved').map((s) => ({ id: s.teamId!, name: `${s.clubName} ${s.teamName}` })),
    [staff],
  );
  const [team, setTeam] = useState<string | null>(teams[0]?.id ?? null);
  const [kind, setKind] = useState<EncounterKind>('training');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(DAYS[0].iso);
  const [opps, setOpps] = useState<{ id: string; name: string }[]>([]);
  const [opp, setOpp] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const withOpp = kind === 'spiel' || kind === 'turnier';

  useEffect(() => {
    if (!team && teams[0]) setTeam(teams[0].id);
  }, [teams, team]);
  useEffect(() => {
    setOpp(null);
    if (!team || !withOpp) return setOpps([]);
    supabase.rpc('opponent_options', { p_team: team }).then(({ data }) => setOpps((data as { id: string; name: string }[]) ?? []));
  }, [team, withOpp]);

  const shown = opps.filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 12);
  const defaultTitle = kind === 'training' ? 'Training' : kind === 'einzelaktion' ? 'Einzelaktion' : kind === 'turnier' ? 'Turnier' : opp ? `Spiel gegen ${opps.find((o) => o.id === opp)?.name}` : 'Spiel';

  const save = async () => {
    setBusy(true);
    setErr('');
    const { error } = await supabase.rpc('create_encounter', {
      p_team: team,
      p_kind: kind,
      p_title: title.trim() || defaultTitle,
      p_date: date,
      p_opponent_team: withOpp ? opp : null,
    });
    setBusy(false);
    if (error) return setErr(errorText(error));
    router.replace({ pathname: '/bewerten', params: { als: 'trainer' } });
  };

  if (!teams.length)
    return (
      <Screen>
        <EmptyState emoji="🧑‍🏫" title="Kein Team" text="Begegnungen legen Trainer*innen eines freigegebenen Teams an." action={<Button title="Zum Trainer-Bereich" onPress={() => router.replace('/trainer')} />} />
      </Screen>
    );

  return (
    <Screen>
      <H size={36}>Neue Begegnung</H>
      <T size={14} color="textSecondary">
        Nach dem Anlegen bewerten sich alle im Team gegenseitig – bei Spiel und Turnier auch die Gegner, wenn deren Team in Go4Pro ist. 7 Tage lang.
      </T>

      {teams.length > 1 && (
        <Card style={{ gap: 8 }}>
          <Label>Team</Label>
          <Wrap>
            {teams.map((t) => (
              <Chip key={t.id} label={t.name} selected={team === t.id} onPress={() => setTeam(t.id)} />
            ))}
          </Wrap>
        </Card>
      )}

      <Card style={{ gap: 8 }}>
        <Label>Art</Label>
        <Wrap>
          {(Object.keys(KIND) as EncounterKind[]).map((k) => (
            <Chip key={k} label={`${KIND[k].emoji} ${KIND[k].label}`} selected={kind === k} onPress={() => setKind(k)} />
          ))}
        </Wrap>
        <Label style={{ marginTop: 6 }}>Wann</Label>
        <Wrap>
          {DAYS.map((d) => (
            <Chip key={d.iso} label={d.label} selected={date === d.iso} onPress={() => setDate(d.iso)} />
          ))}
        </Wrap>
      </Card>

      {withOpp && (
        <Card style={{ gap: 8 }}>
          <Label>Gegner (optional)</Label>
          {opps.length === 0 ? (
            <T size={13} color="textSecondary">
              Kein Gegnerteam in Go4Pro gefunden – dann bewertet nur dein Team.
            </T>
          ) : (
            <>
              {opps.length > 8 && <Field label="Suchen" value={q} onChangeText={setQ} placeholder="Vereinsname" />}
              <View style={{ gap: 6 }}>
                {shown.map((o) => (
                  <Chip key={o.id} label={o.name} selected={opp === o.id} onPress={() => setOpp(opp === o.id ? null : o.id)} />
                ))}
              </View>
            </>
          )}
        </Card>
      )}

      <Card style={{ gap: 8 }}>
        <Field label="Titel" value={title} onChangeText={setTitle} placeholder={defaultTitle} maxLength={80} />
      </Card>
      {!!err && <T style={{ color: theme.danger }}>{err}</T>}
      <Button title={busy ? 'Lege an …' : 'Begegnung anlegen'} disabled={!team || busy} onPress={save} />
    </Screen>
  );
}
