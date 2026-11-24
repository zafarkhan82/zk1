import { router, useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useState } from 'react';
import { Pressable, Share, Text, TextInput, View } from 'react-native';

import { Celebration, type CelebrationInfo } from '@/components/celebration';
import { Button, Card, Field, H, Label, Num, Pill, Row, Screen, SectionTitle, T, useLevelColors } from '@/components/ui';
import { Font } from '@/constants/theme';
import { CATEGORIES, distanceFor, getExercise, isAchieved, LEVELS, targetFor } from '@/data/exercises';
import { useTheme } from '@/hooks/use-theme';
import { bestLevel, formatDate, levelInfo, logXp, totalXp } from '@/lib/game';
import { useStore } from '@/lib/store';
import { errorText } from '@/lib/supabase';
import type { ExerciseLog, Level } from '@/lib/types';

function statusText(l: ExerciseLog): { text: string; tone: 'ok' | 'wait' | 'bad' | 'info' } {
  if (l.status === 'confirmed') return { text: '✓ Vom Trainer freigegeben', tone: 'ok' };
  if (l.status === 'rejected') return { text: '✕ Vom Trainer nicht freigegeben', tone: 'bad' };
  if (!l.playerConfirmed) return { text: 'Vom Trainer eingetragen – bitte im Tagebuch bestätigen', tone: 'wait' };
  if (l.requested) return { text: 'Wartet auf Freigabe durch den Trainer', tone: 'wait' };
  if (l.level !== 'bronze') return { text: 'Kein Trainer im Team – tritt einem Team bei', tone: 'info' };
  return { text: 'Selbst erfasst', tone: 'info' };
}

export default function ExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ex = getExercise(id);
  const { state, group, premium, addLog } = useStore();
  const theme = useTheme();
  const levelColors = useLevelColors();
  const best = ex ? bestLevel(state.logs, ex.id) : null;
  const [level, setLevel] = useState<Level>(
    !premium ? 'bronze' : best === 'gold' ? 'gold' : best === 'silber' ? 'gold' : best === 'bronze' ? 'silber' : 'bronze',
  );
  const lastValue = ex ? state.logs.find((l) => l.exerciseId === ex.id && l.value !== null)?.value : null;
  const [count, setCount] = useState<number>(lastValue && ex?.measure !== 'seconds' ? Math.round(lastValue) : 0);
  const [seconds, setSeconds] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastLog, setLastLog] = useState<ExerciseLog | null>(null);
  const [celebration, setCelebration] = useState<CelebrationInfo | null>(null);

  if (!ex) {
    return (
      <Screen bottomBar={false} topInset={false}>
        <T>Übung nicht gefunden.</T>
      </Screen>
    );
  }

  const isTime = ex.measure === 'seconds';
  const isCheck = ex.measure === 'check';
  const max = ex.measure === 'hits' ? 10 : 999;
  const locked = !premium && level !== 'bronze';
  const target = targetFor(ex, level, group);
  const distance = distanceFor(ex, group);
  const logs = state.logs.filter((l) => l.exerciseId === ex.id);
  const parsedSeconds = Number(seconds.replace(',', '.'));
  const value: number | null = isCheck ? null : isTime ? (seconds.trim() === '' ? NaN : parsedSeconds) : count;
  const canSave = isCheck || (value !== null && !Number.isNaN(value) && value >= 0 && (!isTime || value > 0));
  const cat = CATEGORIES.find((c) => c.id === ex.category);
  const progress = logs
    .filter((l) => l.value !== null && l.status !== 'rejected')
    .slice(0, 10)
    .reverse();
  const maxVal = Math.max(...progress.map((l) => l.value as number), 0);
  const minVal = Math.min(...progress.map((l) => l.value as number), Infinity);
  const record = (() => {
    const vals = logs.filter((l) => l.level === level && l.value !== null).map((l) => l.value as number);
    if (!vals.length) return null;
    return ex.lowerIsBetter ? Math.min(...vals) : Math.max(...vals);
  })();

  const save = async () => {
    if (!canSave || locked) return;
    setBusy(true);
    setError('');
    try {
      const before = levelInfo(totalXp(state));
      const log = await addLog({ exerciseId: ex.id, level, value, note: note.trim() });
      const after = levelInfo(totalXp({ ...state, logs: [log, ...state.logs] }));
      const personalBest = value !== null && record !== null && (ex.lowerIsBetter ? value < record : value > record);
      setLastLog(log);
      setCelebration({
        xp: logXp(log),
        achieved: log.achieved || isAchieved(ex, level, group, value),
        personalBest,
        levelUp: after.level > before.level ? { level: after.level, title: after.title } : null,
        waitingForTrainer: log.requested && !log.trainerConfirmed,
        isCheck,
        value: value !== null ? `${String(value).replace('.', ',')}` : null,
        unit: ex.unit,
      });
      setSeconds('');
      setNote('');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const challengeFriend = async (log: ExerciseLog) => {
    const valueText = log.value !== null ? `${String(log.value).replace('.', ',')} ${ex.unit}` : 'geschafft';
    try {
      await Share.share({
        message: `⚽ Go4Pro-Duell!\nIch habe bei „${ex.title}“ (${LEVELS.find((l) => l.id === log.level)!.label}) ${valueText}. Schaffst du ${ex.lowerIsBetter ? 'eine bessere Zeit' : 'mehr'}?`,
      });
    } catch {
      // abgebrochen
    }
  };

  const StepBtn = ({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === '+' ? 'Mehr' : 'Weniger'}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 64,
        height: 64,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: primary ? theme.primary : 'transparent',
        borderWidth: 1.5,
        borderColor: primary ? theme.primary : theme.border,
        opacity: pressed ? 0.8 : 1,
      })}>
      <Text style={{ color: primary ? theme.primaryText : theme.text, fontFamily: Font.black, fontSize: 30, lineHeight: 34 }}>{label}</Text>
    </Pressable>
  );

  return (
    <Screen bottomBar={false} topInset={false}>
      <Stack.Screen options={{ title: '' }} />
      <Celebration info={celebration} onClose={() => setCelebration(null)} />

      <View style={{ gap: 4 }}>
        <Label color="primary">{cat?.label}</Label>
        <H size={48}>{ex.title}</H>
        <T size={14} color="textSecondary">
          ca. {ex.minutes} Min. · {ex.equipment}
        </T>
      </View>

      <Row style={{ gap: 8 }}>
        {LEVELS.map((l) => {
          const selected = level === l.id;
          const isLocked = !premium && l.id !== 'bronze';
          return (
            <Pressable
              key={l.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${l.label}${isLocked ? ', Premium' : ''}`}
              onPress={() => setLevel(l.id)}
              style={{
                flex: 1,
                minHeight: 78,
                borderRadius: 18,
                borderWidth: 2,
                borderColor: selected ? levelColors[l.id].bg : theme.border,
                backgroundColor: selected ? levelColors[l.id].bg : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
              }}>
              <Text style={{ fontFamily: Font.black, fontSize: 14, color: selected ? levelColors[l.id].fg : theme.text }}>
                {isLocked ? '🔒 ' : ''}
                {l.label}
              </Text>
              {!isCheck && (
                <Text style={{ fontFamily: Font.number, fontSize: 26, color: selected ? levelColors[l.id].fg : theme.text }}>
                  {String(targetFor(ex, l.id, group)).replace('.', ',')}
                </Text>
              )}
            </Pressable>
          );
        })}
      </Row>

      <T size={15} color="textSecondary">
        {ex.variant[level]}
        {!isCheck ? ` Ziel: ${ex.lowerIsBetter ? 'höchstens ' : ''}${String(target).replace('.', ',')} ${ex.unit}.` : ''}
        {distance ? ` Abstand: ${distance}.` : ''}
      </T>

      {locked ? (
        <Card style={{ borderColor: theme.primary, gap: 12 }}>
          <H size={24}>Silber und Gold mit Premium</H>
          <T size={14} color="textSecondary">
            Bronze kannst du jederzeit kostenlos eintragen. Silber und Gold gibt dein Trainer frei – das schalten deine Eltern frei.
          </T>
          <Button title="Premium ansehen" onPress={() => router.push('/premium')} />
        </Card>
      ) : (
        <>
          <Card style={{ alignItems: 'center', paddingVertical: 22, gap: 12 }}>
            <Label>{isCheck ? 'Erledigt?' : 'Dein Ergebnis'}</Label>
            {isCheck ? (
              <T size={15} color="textSecondary" style={{ textAlign: 'center' }}>
                Ob das Ziel geschafft ist, entscheidet dein Trainer beim Freigeben.
              </T>
            ) : isTime ? (
              <TextInput
                value={seconds}
                onChangeText={setSeconds}
                keyboardType="decimal-pad"
                placeholder="0,0"
                placeholderTextColor={theme.backgroundSelected}
                accessibilityLabel={`Ergebnis in ${ex.unit}`}
                style={{ color: theme.text, fontFamily: Font.number, fontSize: 88, textAlign: 'center', minWidth: 200 }}
              />
            ) : (
              <Row style={{ gap: 18 }}>
                <StepBtn label="−" onPress={() => setCount((c) => Math.max(0, c - 1))} />
                <Num size={92} style={{ minWidth: 120, textAlign: 'center' }}>
                  {count}
                </Num>
                <StepBtn label="+" primary onPress={() => setCount((c) => Math.min(max, c + 1))} />
              </Row>
            )}
            {!isCheck && (
              <T size={14} color="textSecondary">
                {ex.unit}
                {record !== null ? ` · Rekord: ${String(record).replace('.', ',')}` : ''}
              </T>
            )}
          </Card>
          <Field label="Notiz (optional)" placeholder="Wie lief’s?" value={note} onChangeText={setNote} maxLength={200} />
          <Button title={busy ? 'Speichere …' : isCheck ? 'Als erledigt eintragen' : 'Ergebnis speichern'} onPress={save} disabled={!canSave || busy} />
          {level !== 'bronze' && (
            <T size={13} color="textSecondary" style={{ textAlign: 'center' }}>
              Silber und Gold gibt dein Trainer frei.
            </T>
          )}
          {!!error && (
            <T size={14} style={{ color: theme.danger }}>
              {error}
            </T>
          )}
        </>
      )}

      {lastLog && <Button title="Freund herausfordern" variant="secondary" onPress={() => challengeFriend(lastLog)} />}

      <SectionTitle>So geht’s</SectionTitle>
      <Card>
        {ex.steps.map((s, i) => (
          <Row key={i} style={{ alignItems: 'flex-start', gap: 12 }}>
            <Num size={20} color="primary">
              {i + 1}
            </Num>
            <T size={15} style={{ flex: 1 }}>
              {s}
            </T>
          </Row>
        ))}
        <Label style={{ marginTop: 8 }}>Profi-Tipps</Label>
        {ex.tips.map((s, i) => (
          <T key={i} size={14} color="textSecondary">
            • {s}
          </T>
        ))}
      </Card>

      {progress.length >= 2 && (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Label>Dein Fortschritt</Label>
            <T size={12} color="textSecondary">
              letzte {progress.length} Ergebnisse
            </T>
          </Row>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 110, gap: 6, marginTop: 4 }}>
            {progress.map((l, i) => {
              const v = l.value as number;
              const h = ex.lowerIsBetter ? (minVal / Math.max(v, 0.1)) * 80 : (v / Math.max(maxVal, 1)) * 80;
              const last = i === progress.length - 1;
              return (
                <View key={l.id} style={{ flex: 1, alignItems: 'center', gap: 4 }} accessibilityLabel={`${v} ${ex.unit}`}>
                  <T size={10} color={last ? 'primary' : 'textSecondary'}>
                    {String(v).replace('.', ',')}
                  </T>
                  <View
                    style={{
                      width: '100%',
                      height: Math.max(6, h),
                      borderRadius: 6,
                      backgroundColor: last ? theme.primary : l.achieved ? theme.primarySoft : theme.backgroundSelected,
                    }}
                  />
                </View>
              );
            })}
          </View>
          <T size={12} color="textSecondary">
            {ex.lowerIsBetter ? 'Kürzer ist besser.' : 'Höher ist besser.'} Helle Balken: Ziel geschafft.
          </T>
        </Card>
      )}

      {logs.length > 0 && <SectionTitle>Deine Einträge</SectionTitle>}
      {logs.map((l) => {
        const st = statusText(l);
        const color = st.tone === 'ok' ? theme.primary : st.tone === 'bad' ? theme.danger : theme.textSecondary;
        return (
          <Card key={l.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Pill text={LEVELS.find((x) => x.id === l.level)!.label} color={levelColors[l.level].bg} textColor={levelColors[l.level].fg} />
              <T size={12} color="textSecondary">
                {formatDate(l.date)}
              </T>
            </Row>
            <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Num size={30}>{l.value !== null ? String(l.value).replace('.', ',') : '✓'}</Num>
              <Num size={18} color="primary">
                +{logXp(l)} XP
              </Num>
            </Row>
            {!!l.note && (
              <T size={14} color="textSecondary">
                „{l.note}“
              </T>
            )}
            <T size={13} weight="600" style={{ color }}>
              {st.text}
            </T>
          </Card>
        );
      })}
    </Screen>
  );
}
