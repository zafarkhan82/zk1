import { useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Share, View } from 'react-native';

import { TeamSchedule } from '@/components/fussballde-panel';
import { Button, Card, Chip, EmptyState, Field, Row, Screen, SectionTitle, T, useLevelColors, Wrap } from '@/components/ui';
import { EXERCISES, LEVELS, targetFor } from '@/data/exercises';
import { useTheme } from '@/hooks/use-theme';
import { AGE_GROUP_LABEL, groupIndex } from '@/lib/age';
import { useStore } from '@/lib/store';
import { errorText, supabase } from '@/lib/supabase';
import type { AgeGroup, Level } from '@/lib/types';

interface Member {
  member_id: string;
  player_id: string;
  nickname: string;
  birth_year: number;
  status: 'pending' | 'approved' | 'rejected';
  jersey_number: number | null;
}

export default function TeamDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { staff } = useStore();
  const theme = useTheme();
  const levelColors = useLevelColors();
  const team = staff.find((s) => s.teamId === id);
  const group = (team?.ageGroup ?? 'D') as AgeGroup;
  const [members, setMembers] = useState<Member[]>([]);
  const [jersey, setJersey] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');

  // Team-Erfassung
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [level, setLevel] = useState<Level>('bronze');
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('team_member_requests', { p_team: id });
    setMembers((data as Member[]) ?? []);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const exercises = useMemo(
    () => EXERCISES.filter((e) => groupIndex(e.minGroup) <= groupIndex(group) && e.measure !== 'check'),
    [group],
  );
  const ex = exercises.find((e) => e.id === exerciseId) ?? null;
  const approved = members.filter((m) => m.status === 'approved');
  const pending = members.filter((m) => m.status === 'pending');

  const decide = async (m: Member, accept: boolean) => {
    setMsg('');
    const nr = jersey[m.member_id] ? Number(jersey[m.member_id]) : null;
    const { error } = await supabase
      .from('team_members')
      .update({ status: accept ? 'approved' : 'rejected', jersey_number: nr })
      .eq('id', m.member_id);
    if (error) return setMsg(errorText(error));
    load();
  };

  const shareCode = async () => {
    if (!team?.joinCode) return;
    try {
      await Share.share({
        message: `⚽ Go4Pro: Tritt unserem Team ${team.teamName} bei! Öffne https://zafarkhan82.github.io/zk1/, lege dein Kind an und gib unter Profil → Team diesen Code ein: ${team.joinCode}`,
      });
    } catch {
      // abgebrochen
    }
  };

  const saveAll = async () => {
    if (!ex) return;
    setBusy(true);
    const res: Record<string, string> = {};
    for (const m of approved) {
      const raw = (values[m.player_id] ?? '').replace(',', '.').trim();
      if (!raw) continue;
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from('exercise_entries').insert({
        player_id: m.player_id,
        exercise_id: ex.id,
        level,
        value: Number(raw),
        achieved: false,
        created_by: userData.user?.id,
      });
      res[m.player_id] = error ? `❌ ${errorText(error)}` : '✅ gespeichert – Eltern bestätigen in der App';
    }
    setResult(res);
    setValues({});
    setBusy(false);
  };

  if (!team) {
    return (
      <Screen bottomBar={false} topInset={false}>
        <EmptyState emoji="🤷" title="Team nicht gefunden" text="Öffne das Team aus dem Trainer-Bereich." />
      </Screen>
    );
  }

  return (
    <Screen bottomBar={false} topInset={false}>
      <Stack.Screen options={{ title: team.teamName ?? 'Team' }} />
      <Card style={{ alignItems: 'center' }}>
        <T size={13} color="textSecondary">
          {team.clubName} · {AGE_GROUP_LABEL[group]} · Saison {team.season}
        </T>
        <T size={13} color="textSecondary">
          Team-Code für Eltern
        </T>
        <T size={36} weight="800" style={{ letterSpacing: 4 }}>
          {team.joinCode}
        </T>
        <Button title="📤 Code an Eltern schicken" onPress={shareCode} style={{ alignSelf: 'stretch' }} />
      </Card>

      <TeamSchedule teamId={id} />

      {!!msg && (
        <T size={14} style={{ color: theme.danger }}>
          {msg}
        </T>
      )}

      <SectionTitle>Beitrittsanfragen ({pending.length})</SectionTitle>
      {pending.length === 0 && (
        <T size={14} color="textSecondary">
          Keine offenen Anfragen.
        </T>
      )}
      {pending.map((m) => (
        <Card key={m.member_id}>
          <T weight="700">
            {m.nickname} · Jahrgang {m.birth_year}
          </T>
          <Field
            label="Rückennummer (optional)"
            keyboardType="number-pad"
            value={jersey[m.member_id] ?? ''}
            onChangeText={(v) => setJersey((j) => ({ ...j, [m.member_id]: v }))}
            maxLength={2}
          />
          <Row>
            <Button title="Aufnehmen" style={{ flex: 1 }} onPress={() => decide(m, true)} />
            <Button title="Ablehnen" variant="danger" onPress={() => decide(m, false)} />
          </Row>
        </Card>
      ))}

      <SectionTitle>Kader ({approved.length})</SectionTitle>
      <Card>
        {approved.length === 0 ? (
          <T size={14} color="textSecondary">
            Noch niemand im Team. Schick den Code an die Eltern.
          </T>
        ) : (
          approved.map((m) => (
            <T key={m.member_id}>
              {m.jersey_number ? `#${m.jersey_number} ` : ''}
              {m.nickname} · {m.birth_year}
            </T>
          ))
        )}
      </Card>

      {approved.length > 0 && (
        <>
          <SectionTitle>Team-Erfassung</SectionTitle>
          <Card>
            <T size={14} color="textSecondary">
              Trag Ergebnisse für mehrere Kinder auf einmal ein, z. B. nach einem Testtag. Die Eltern bestätigen sie danach in der App.
            </T>
            <Wrap>
              {exercises.map((e) => (
                <Chip key={e.id} label={`${e.emoji} ${e.title}`} selected={exerciseId === e.id} onPress={() => setExerciseId(e.id)} />
              ))}
            </Wrap>
            {ex && (
              <>
                <Row style={{ gap: 8 }}>
                  {LEVELS.map((l) => (
                    <View key={l.id} style={{ flex: 1 }}>
                      <Chip
                        label={l.label}
                        selected={level === l.id}
                        color={levelColors[l.id].bg}
                        textColor={levelColors[l.id].fg}
                        onPress={() => setLevel(l.id)}
                      />
                    </View>
                  ))}
                </Row>
                <T size={13} color="textSecondary">
                  {ex.variant[level]} Ziel: {String(targetFor(ex, level, group)).replace('.', ',')} {ex.unit}
                  {level !== 'bronze' ? ' · Silber/Gold nur für Kinder mit Premium oder Vereinslizenz.' : ''}
                </T>
                {approved.map((m) => (
                  <View key={m.player_id} style={{ gap: 2 }}>
                    <Field
                      label={`${m.jersey_number ? `#${m.jersey_number} ` : ''}${m.nickname}`}
                      keyboardType="decimal-pad"
                      placeholder={ex.unit}
                      value={values[m.player_id] ?? ''}
                      onChangeText={(v) => setValues((x) => ({ ...x, [m.player_id]: v }))}
                    />
                    {!!result[m.player_id] && <T size={12}>{result[m.player_id]}</T>}
                  </View>
                ))}
                <Button title={busy ? 'Speichere …' : 'Alle speichern'} disabled={busy} onPress={saveAll} />
              </>
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}
