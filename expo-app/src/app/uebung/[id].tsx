import { router, useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useState } from 'react';
import { Share, View } from 'react-native';

import { Celebration, type CelebrationInfo } from '@/components/celebration';
import { Button, Card, Chip, Field, Pill, Row, Screen, SectionTitle, T, useLevelColors } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { CATEGORIES, distanceFor, getExercise, isAchieved, LEVELS, targetFor } from '@/data/exercises';
import { useTheme } from '@/hooks/use-theme';
import { bestLevel, formatDate, levelInfo, logXp, totalXp } from '@/lib/game';
import { useStore } from '@/lib/store';
import { errorText } from '@/lib/supabase';
import type { ExerciseLog, Level } from '@/lib/types';

function statusText(l: ExerciseLog): { text: string; tone: 'ok' | 'wait' | 'bad' | 'info' } {
  if (l.status === 'confirmed') return { text: '✔ Vom Trainer freigegeben', tone: 'ok' };
  if (l.status === 'rejected') return { text: '✖ Vom Trainer nicht freigegeben', tone: 'bad' };
  if (!l.playerConfirmed) return { text: '📝 Vom Trainer eingetragen – bitte im Tagebuch bestätigen', tone: 'wait' };
  if (l.requested) return { text: '⏳ Wartet auf Freigabe durch den Trainer', tone: 'wait' };
  if (l.level !== 'bronze') return { text: 'ℹ️ Kein Trainer im Team – tritt einem Team bei, damit er freigeben kann', tone: 'info' };
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
  const [value, setValue] = useState('');
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

  const locked = !premium && level !== 'bronze';
  const target = targetFor(ex, level, group);
  const distance = distanceFor(ex, group);
  const logs = state.logs.filter((l) => l.exerciseId === ex.id);
  const numeric = value.replace(',', '.');
  const parsed = ex.measure === 'check' ? null : numeric.trim() === '' ? NaN : Number(numeric);
  const canSave = ex.measure === 'check' || (parsed !== null && !Number.isNaN(parsed) && parsed >= 0);
  const cat = CATEGORIES.find((c) => c.id === ex.category);

  const save = async () => {
    if (!canSave || locked) return;
    setBusy(true);
    setError('');
    try {
      const before = levelInfo(totalXp(state));
      const prev = logs.filter((l) => l.level === level && l.value !== null).map((l) => l.value as number);
      const log = await addLog({ exerciseId: ex.id, level, value: parsed, note: note.trim() });
      const after = levelInfo(totalXp({ ...state, logs: [log, ...state.logs] }));
      const personalBest =
        parsed !== null && prev.length > 0 && (ex.lowerIsBetter ? parsed < Math.min(...prev) : parsed > Math.max(...prev));
      setLastLog(log);
      setCelebration({
        xp: logXp(log),
        achieved: log.achieved || isAchieved(ex, level, group, parsed),
        personalBest,
        levelUp: after.level > before.level ? { level: after.level, title: after.title } : null,
        waitingForTrainer: log.requested && !log.trainerConfirmed,
        isCheck: ex.measure === 'check',
      });
      setValue('');
      setNote('');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const challengeFriend = async (log: ExerciseLog) => {
    const valueText = log.value !== null ? `${String(log.value).replace('.', ',')} ${ex.unit}` : 'geschafft';
    const message = `⚽ Go4Pro-Duell!\nIch habe bei „${ex.title}“ (${LEVELS.find((l) => l.id === log.level)!.label}) ${valueText}. Schaffst du ${ex.lowerIsBetter ? 'eine bessere Zeit' : 'mehr'}?`;
    try {
      await Share.share({ message });
    } catch {
      // abgebrochen
    }
  };

  return (
    <Screen bottomBar={false} topInset={false}>
      <Stack.Screen options={{ title: ex.title }} />
      <Celebration info={celebration} onClose={() => setCelebration(null)} />

      <Row>
        <T size={40}>{ex.emoji}</T>
        <View style={{ flex: 1 }}>
          <T size={13} color="textSecondary">
            {cat?.emoji} {cat?.label} · ca. {ex.minutes} Min. · {ex.equipment}
          </T>
          <T size={15}>{ex.description}</T>
        </View>
      </Row>

      <Row style={{ gap: Spacing.two }}>
        {LEVELS.map((l) => {
          const isLocked = !premium && l.id !== 'bronze';
          const selected = level === l.id;
          return (
            <View key={l.id} style={{ flex: 1 }}>
              <Chip
                label={`${isLocked ? '🔒 ' : ''}${l.label}`}
                accessibilityLabel={`${l.label}${isLocked ? ', Premium' : ''}`}
                selected={selected}
                color={levelColors[l.id].bg}
                textColor={levelColors[l.id].fg}
                onPress={() => setLevel(l.id)}
              />
            </View>
          );
        })}
      </Row>

      <Card style={{ borderColor: levelColors[level].bg, borderWidth: 2 }}>
        <T size={13} weight="700" style={{ color: levelColors[level].text }}>
          {LEVELS.find((l) => l.id === level)!.label.toUpperCase()} · {LEVELS.find((l) => l.id === level)!.sub}
        </T>
        <T size={15}>{ex.variant[level]}</T>
        {ex.measure !== 'check' && (
          <T weight="800" size={20} style={{ color: levelColors[level].text }}>
            Ziel: {ex.lowerIsBetter ? 'höchstens ' : ''}
            {String(target).replace('.', ',')} {ex.unit}
          </T>
        )}
        {distance && (
          <T size={14} weight="600">
            📏 Abstand für deine Altersklasse: {distance}
          </T>
        )}
        {ex.measure === 'check' && (
          <T size={13} color="textSecondary">
            Bei dieser Übung entscheidet dein Trainer beim Freigeben, ob das Ziel geschafft ist.
          </T>
        )}

        {locked ? (
          <>
            <T size={14} color="textSecondary">
              Silber und Gold gibt es mit Premium. Bronze kannst du jederzeit kostenlos eintragen.
            </T>
            <Button title="🔒 Premium ansehen" onPress={() => router.push('/premium')} />
          </>
        ) : (
          <>
            {ex.measure !== 'check' && (
              <Field
                label={`Dein Ergebnis (${ex.unit})`}
                keyboardType="decimal-pad"
                placeholder={ex.lowerIsBetter ? 'z. B. 17,5' : 'z. B. 12'}
                value={value}
                onChangeText={setValue}
              />
            )}
            <Field label="Notiz (optional)" placeholder="Wie lief's?" value={note} onChangeText={setNote} maxLength={200} />
            <Button
              title={busy ? 'Speichere …' : ex.measure === 'check' ? 'Als erledigt eintragen' : 'Ergebnis speichern'}
              onPress={save}
              disabled={!canSave || busy}
            />
            {!!error && (
              <T size={14} style={{ color: theme.danger }}>
                {error}
              </T>
            )}
          </>
        )}
      </Card>

      {lastLog && (
        <Button title="🤝 Freund herausfordern" variant="secondary" onPress={() => challengeFriend(lastLog)} />
      )}

      <SectionTitle>So geht's</SectionTitle>
      <Card>
        {ex.steps.map((s, i) => (
          <T key={i} size={15}>
            {i + 1}. {s}
          </T>
        ))}
        <T weight="700" style={{ marginTop: Spacing.two }}>
          Profi-Tipps
        </T>
        {ex.tips.map((s, i) => (
          <T key={i} size={14} color="textSecondary">
            • {s}
          </T>
        ))}
      </Card>

      {logs.length > 0 && <SectionTitle>Deine Einträge ({logs.length})</SectionTitle>}
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
            <T weight="700">
              {l.value !== null ? `${String(l.value).replace('.', ',')} ${ex.unit}` : 'Erledigt'} {l.achieved ? '✅' : ''}
              {'  '}+{logXp(l)} XP
            </T>
            {!!l.note && (
              <T size={14} color="textSecondary">
                „{l.note}“
              </T>
            )}
            <T size={13} weight="700" style={{ color }}>
              {st.text}
            </T>
          </Card>
        );
      })}
      {best === null && logs.length === 0 && (
        <T size={13} color="textSecondary" style={{ textAlign: 'center' }}>
          Noch kein Eintrag – dein erster bringt dir Punkte!
        </T>
      )}
    </Screen>
  );
}
