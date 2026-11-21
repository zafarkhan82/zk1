import { router } from 'expo-router';
import { View } from 'react-native';

import { Button, Card, Row, Screen, T } from '@/components/ui';
import { DIARY_TYPES, MOODS } from '@/data/diary';
import { getExercise, LEVELS } from '@/data/exercises';
import { useTheme } from '@/hooks/use-theme';
import { formatDate, weekStart } from '@/lib/game';
import { useStore } from '@/lib/store';

type Item =
  | { kind: 'diary'; date: string; id: string }
  | { kind: 'log'; date: string; id: string };

export default function Diary() {
  const { state, deleteDiary } = useStore();
  const theme = useTheme();

  const start = weekStart().getTime();
  const weekMinutes = state.diary.filter((d) => new Date(d.date).getTime() >= start).reduce((s, d) => s + d.minutes, 0);
  const weekLogs = state.logs.filter((l) => new Date(l.date).getTime() >= start).length;

  const items: Item[] = [
    ...state.diary.map((d) => ({ kind: 'diary' as const, date: d.date, id: d.id })),
    ...state.logs.map((l) => ({ kind: 'log' as const, date: l.date, id: l.id })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <T size={28} weight="800">
          Tagebuch
        </T>
        <Button title="+ Eintrag" onPress={() => router.push('/eintrag')} style={{ minHeight: 40 }} />
      </Row>

      <Row>
        <Card style={{ flex: 1 }}>
          <T size={12} color="textSecondary">
            Diese Woche
          </T>
          <T size={22} weight="800">
            {weekMinutes} Min.
          </T>
          <T size={12} color="textSecondary">
            Fußball laut Tagebuch
          </T>
        </Card>
        <Card style={{ flex: 1 }}>
          <T size={12} color="textSecondary">
            Diese Woche
          </T>
          <T size={22} weight="800">
            {weekLogs}
          </T>
          <T size={12} color="textSecondary">
            Übungen eingetragen
          </T>
        </Card>
      </Row>

      {items.length === 0 && (
        <Card>
          <T weight="700">Noch leer 📓</T>
          <T size={14} color="textSecondary">
            Schreib nach jedem Training oder Spiel kurz auf, was gut lief und was du verbessern willst. So siehst du später,
            wie sehr du dich entwickelt hast.
          </T>
        </Card>
      )}

      {items.map((it) => {
        if (it.kind === 'diary') {
          const d = state.diary.find((x) => x.id === it.id)!;
          const type = DIARY_TYPES.find((t) => t.id === d.type)!;
          const mood = MOODS.find((m) => m.id === d.mood)!;
          return (
            <Card key={`d-${d.id}`}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T weight="700">{type.label}</T>
                <T size={22}>{mood.emoji}</T>
              </Row>
              <T size={12} color="textSecondary">
                {formatDate(d.date)} · {d.minutes} Min.
              </T>
              {!!d.good && <T size={14}>👍 {d.good}</T>}
              {!!d.improve && <T size={14}>🎯 {d.improve}</T>}
              <Button title="Löschen" variant="danger" style={{ minHeight: 36, alignSelf: 'flex-end' }} onPress={() => deleteDiary(d.id)} />
            </Card>
          );
        }
        const l = state.logs.find((x) => x.id === it.id)!;
        const ex = getExercise(l.exerciseId);
        if (!ex) return null;
        const lv = LEVELS.find((x) => x.id === l.level)!;
        return (
          <Card key={`l-${l.id}`} onPress={() => router.push({ pathname: '/uebung/[id]', params: { id: ex.id } })}>
            <Row>
              <T size={24}>{ex.emoji}</T>
              <View style={{ flex: 1 }}>
                <T weight="700">
                  {ex.title} · <T style={{ color: theme[l.level] }} weight="700">{lv.label}</T>
                </T>
                <T size={12} color="textSecondary">
                  {formatDate(l.date)} · {l.value !== null ? `${String(l.value).replace('.', ',')} ${ex.unit}` : 'erledigt'}
                  {l.achieved ? ' · Ziel ✅' : ''}
                  {l.confirmation ? ' · vom Trainer bestätigt' : ''}
                </T>
              </View>
            </Row>
          </Card>
        );
      })}
    </Screen>
  );
}
