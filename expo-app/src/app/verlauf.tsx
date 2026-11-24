import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card, Chip, H, Label, Num, Row, Screen, Stat, StripeHeader, T } from '@/components/ui';
import { Font } from '@/constants/theme';
import { DIARY_TYPES, MOODS } from '@/data/diary';
import { getExercise, LEVELS } from '@/data/exercises';
import { useTheme } from '@/hooks/use-theme';
import { DIARY_XP, logXp, weekStart } from '@/lib/game';
import { useStore } from '@/lib/store';
import type { DiaryEntry, ExerciseLog } from '@/lib/types';

type Item = { kind: 'log'; date: string; log: ExerciseLog } | { kind: 'diary'; date: string; diary: DiaryEntry };
type Filter = 'alle' | 'uebungen' | 'tagebuch';

const WEEKS = 10;

function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y.getTime()) / 86400000 + 1) / 7);
}

function weekTitle(start: Date, now: Date) {
  const diff = Math.round((weekStart(now).getTime() - start.getTime()) / (7 * 86400000));
  if (diff === 0) return 'Diese Woche';
  if (diff === 1) return 'Letzte Woche';
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const f = (d: Date) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  return `KW ${isoWeek(start)} · ${f(start)}–${f(end)}`;
}

export default function Verlauf() {
  const { state } = useStore();
  const theme = useTheme();
  const [filter, setFilter] = useState<Filter>('alle');
  const now = useMemo(() => new Date(), []);

  // Punkte pro Woche (letzte 10 Wochen)
  const weeks = useMemo(() => {
    const list = Array.from({ length: WEEKS }, (_, i) => {
      const s = weekStart(now);
      s.setDate(s.getDate() - (WEEKS - 1 - i) * 7);
      return { start: s, xp: 0 };
    });
    const add = (date: string, xp: number) => {
      const t = new Date(date).getTime();
      for (let i = list.length - 1; i >= 0; i--) {
        if (t >= list[i].start.getTime()) {
          if (i === list.length - 1 || t < list[i + 1].start.getTime()) list[i].xp += xp;
          return;
        }
      }
    };
    state.logs.forEach((l) => add(l.date, logXp(l)));
    state.diary.forEach((d) => add(d.date, DIARY_XP));
    return list;
  }, [state.logs, state.diary, now]);
  const maxXp = Math.max(1, ...weeks.map((w) => w.xp));

  const groups = useMemo(() => {
    const items: Item[] = [
      ...(filter !== 'tagebuch' ? state.logs.map((log) => ({ kind: 'log' as const, date: log.date, log })) : []),
      ...(filter !== 'uebungen' ? state.diary.map((diary) => ({ kind: 'diary' as const, date: diary.date, diary })) : []),
    ].sort((a, b) => b.date.localeCompare(a.date));
    const map = new Map<number, Item[]>();
    items.forEach((it) => {
      const k = weekStart(new Date(it.date)).getTime();
      map.set(k, [...(map.get(k) ?? []), it]);
    });
    return [...map.entries()].map(([k, list]) => ({ start: new Date(k), list }));
  }, [state.logs, state.diary, filter]);

  const confirmed = state.logs.filter((l) => l.status === 'confirmed').length;
  const minutes = state.diary.reduce((s, d) => s + d.minutes, 0);

  return (
    <Screen
      bottomBar={false}
      topInset={false}
      header={
        <StripeHeader height={150}>
          <H size={48}>Verlauf</H>
          <T size={14} color="textSecondary">
            Alles, was du eingetragen hast – nichts geht verloren.
          </T>
        </StripeHeader>
      }>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Label>Punkte pro Woche</Label>
          <T size={13} color="textSecondary">
            letzte {WEEKS} Wochen
          </T>
        </Row>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 6, marginTop: 6 }}>
          {weeks.map((w, i) => {
            const current = i === weeks.length - 1;
            return (
              <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }} accessibilityLabel={`KW ${isoWeek(w.start)}: ${w.xp} Punkte`}>
                {w.xp > 0 && (
                  <Text style={{ fontFamily: Font.label, fontSize: 10, color: current ? theme.primary : theme.textSecondary }}>{w.xp}</Text>
                )}
                <View
                  style={{
                    width: '100%',
                    height: Math.max(4, (w.xp / maxXp) * 88),
                    borderRadius: 6,
                    backgroundColor: current ? theme.primary : w.xp > 0 ? theme.primarySoft : theme.backgroundSelected,
                  }}
                />
                <Text style={{ fontFamily: Font.label, fontSize: 10, color: theme.textSecondary }}>{isoWeek(w.start)}</Text>
              </View>
            );
          })}
        </View>
      </Card>

      <Row>
        <Stat label="Übungen" value={String(state.logs.length)} />
        <Stat label="Bestätigt" value={String(confirmed)} />
        <Stat label="Minuten" value={minutes.toLocaleString('de-DE')} />
      </Row>

      <Row style={{ gap: 8 }}>
        <Chip label="Alle" selected={filter === 'alle'} onPress={() => setFilter('alle')} />
        <Chip label="Übungen" selected={filter === 'uebungen'} onPress={() => setFilter('uebungen')} />
        <Chip label="Tagebuch" selected={filter === 'tagebuch'} onPress={() => setFilter('tagebuch')} />
      </Row>

      {groups.length === 0 && (
        <Card>
          <T color="textSecondary">Noch nichts eingetragen. Tippe unten auf das Plus und leg los!</T>
        </Card>
      )}

      {groups.map((g) => (
        <View key={g.start.getTime()} style={{ gap: 8 }}>
          <Label color="primary">{weekTitle(g.start, now)}</Label>
          {g.list.map((it) => (it.kind === 'log' ? <LogItem key={it.log.id} log={it.log} /> : <DiaryItem key={it.diary.id} d={it.diary} />))}
        </View>
      ))}
    </Screen>
  );
}

function day(date: string) {
  return new Date(date).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

function LogItem({ log }: { log: ExerciseLog }) {
  const theme = useTheme();
  const ex = getExercise(log.exerciseId);
  const lvl = LEVELS.find((l) => l.id === log.level)!;
  const lvlColor = log.level === 'gold' ? theme.gold : log.level === 'silber' ? theme.silber : theme.bronze;
  const status =
    log.status === 'confirmed'
      ? { text: 'bestätigt', color: theme.success }
      : log.status === 'rejected'
        ? { text: 'abgelehnt', color: theme.danger }
        : { text: 'wartet', color: theme.textSecondary };
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => ex && router.push({ pathname: '/uebung/[id]', params: { id: ex.id } })}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: 16,
        backgroundColor: theme.backgroundElement,
        opacity: pressed ? 0.85 : 1,
      })}>
      <View style={{ width: 6, alignSelf: 'stretch', borderRadius: 3, backgroundColor: lvlColor }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: Font.bold, fontSize: 15, color: theme.text }}>
          {ex?.title ?? log.exerciseId}
        </Text>
        <Text numberOfLines={1} style={{ fontFamily: Font.medium, fontSize: 12, color: theme.textSecondary }}>
          {day(log.date)} · {lvl.label}
          {log.achieved ? ' · Ziel ✓' : ''} · <Text style={{ color: status.color }}>{status.text}</Text>
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {log.value != null ? (
          <Num size={24}>{log.value.toLocaleString('de-DE')}</Num>
        ) : (
          <Num size={24}>{log.achieved ? '✓' : '–'}</Num>
        )}
        <Text style={{ fontFamily: Font.label, fontSize: 10, letterSpacing: 1, color: theme.primary }}>+{logXp(log)} XP</Text>
      </View>
    </Pressable>
  );
}

function DiaryItem({ d }: { d: DiaryEntry }) {
  const theme = useTheme();
  const type = DIARY_TYPES.find((t) => t.id === d.type);
  const mood = MOODS.find((m) => m.id === d.mood);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/tagebuch')}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.border,
        opacity: pressed ? 0.85 : 1,
      })}>
      <Text style={{ fontSize: 24 }}>{mood?.emoji ?? '📓'}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: Font.bold, fontSize: 15, color: theme.text }}>
          {type?.label ?? 'Tagebuch'}
        </Text>
        <Text numberOfLines={1} style={{ fontFamily: Font.medium, fontSize: 12, color: theme.textSecondary }}>
          {day(d.date)} · {d.minutes} Min.{d.good ? ` · ${d.good}` : ''}
        </Text>
      </View>
      <Text style={{ fontFamily: Font.label, fontSize: 10, letterSpacing: 1, color: theme.primary }}>+{DIARY_XP} XP</Text>
    </Pressable>
  );
}
