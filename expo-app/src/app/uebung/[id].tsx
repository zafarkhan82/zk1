import { router, useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useState } from 'react';
import { Share, View } from 'react-native';

import { Button, Card, Chip, Field, Pill, Row, Screen, SectionTitle, T, Wrap } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { getExercise, isAchieved, LEVELS, targetFor } from '@/data/exercises';
import { useTheme } from '@/hooks/use-theme';
import { bestLevel, formatDate, logXp } from '@/lib/game';
import { useStore } from '@/lib/store';
import { errorText } from '@/lib/supabase';
import type { ExerciseLog, Level } from '@/lib/types';

export default function ExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ex = getExercise(id);
  const { state, group, premium, addLog, requestConfirmation } = useStore();
  const theme = useTheme();
  const best = ex ? bestLevel(state.logs, ex.id) : null;
  const [level, setLevel] = useState<Level>(
    !premium ? 'bronze' : best === 'gold' ? 'gold' : best === 'silber' ? 'gold' : best === 'bronze' ? 'silber' : 'bronze',
  );
  const locked = !premium && level !== 'bronze';
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState<ExerciseLog | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!ex) {
    return (
      <Screen bottomBar={false} topInset={false}>
        <T>Übung nicht gefunden.</T>
      </Screen>
    );
  }

  const target = targetFor(ex, level, group);
  const logs = state.logs.filter((l) => l.exerciseId === ex.id);
  const numeric = value.replace(',', '.');
  const parsed = ex.measure === 'check' ? null : numeric.trim() === '' ? NaN : Number(numeric);
  const canSave = ex.measure === 'check' || (parsed !== null && !Number.isNaN(parsed) && parsed >= 0);

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError('');
    try {
      const achieved = isAchieved(ex, level, group, parsed);
      const log = await addLog({ exerciseId: ex.id, level, value: parsed, achieved, note: note.trim() });
      setResult(log);
      setValue('');
      setNote('');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const askTrainer = async (logId: string) => {
    if (!premium) {
      router.push('/premium');
      return;
    }
    setError('');
    try {
      await requestConfirmation(logId);
      if (result?.id === logId) setResult({ ...result, requested: true });
    } catch (e) {
      setError(errorText(e));
    }
  };

  const challengeFriend = async (log: ExerciseLog) => {
    const valueText = log.value !== null ? `${log.value} ${ex.unit}` : 'geschafft';
    const message = `⚽ Go4Pro-Duell!\nIch habe bei „${ex.title}“ (${LEVELS.find((l) => l.id === log.level)!.label}) ${valueText}. Schaffst du ${ex.lowerIsBetter ? 'eine bessere Zeit' : 'mehr'}?`;
    try {
      await Share.share({ message });
    } catch {
      // Teilen abgebrochen oder nicht verfügbar
    }
  };

  return (
    <Screen bottomBar={false} topInset={false}>
      <Stack.Screen options={{ title: ex.title }} />

      <Row>
        <T size={44}>{ex.emoji}</T>
        <View style={{ flex: 1 }}>
          <T size={22} weight="800">
            {ex.title}
          </T>
          <T size={13} color="textSecondary">
            {ex.equipment} · ca. {ex.minutes} Min.
          </T>
        </View>
      </Row>
      <T size={15}>{ex.description}</T>

      <SectionTitle>Stärkegrad wählen</SectionTitle>
      <Wrap>
        {LEVELS.map((l) => (
          <Chip
            key={l.id}
            label={`${!premium && l.id !== 'bronze' ? '⭐ ' : ''}${l.label} · ${l.sub}`}
            selected={level === l.id}
            color={theme[l.id]}
            onPress={() => {
              setLevel(l.id);
              setResult(null);
            }}
          />
        ))}
      </Wrap>

      <Card style={{ borderColor: theme[level], borderWidth: 2 }}>
        <T weight="700">So geht's auf {LEVELS.find((l) => l.id === level)!.label}:</T>
        <T size={14}>{ex.variant[level]}</T>
        {ex.measure !== 'check' && (
          <T weight="800" size={18} style={{ color: theme[level] }}>
            Ziel: {ex.lowerIsBetter ? 'höchstens ' : ''}
            {target} {ex.unit}
          </T>
        )}
      </Card>

      <Card>
        <T weight="700">Ablauf</T>
        {ex.steps.map((s, i) => (
          <T key={i} size={14}>
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

      <SectionTitle>Ergebnis eintragen</SectionTitle>
      <Card>
        {ex.measure !== 'check' && (
          <Field
            label={`Dein Ergebnis (${ex.unit})`}
            keyboardType="decimal-pad"
            placeholder={ex.lowerIsBetter ? 'z. B. 17,5' : 'z. B. 12'}
            value={value}
            onChangeText={(t) => {
              setValue(t);
              setResult(null);
            }}
          />
        )}
        <Field label="Notiz (optional)" placeholder="Wie lief's?" value={note} onChangeText={setNote} maxLength={200} />
        {locked ? (
          <>
            <T size={14} color="textSecondary">
              Silber und Gold sind Premium. Bronze kannst du jederzeit kostenlos eintragen.
            </T>
            <Button title="⭐ Premium freischalten" onPress={() => router.push('/premium')} />
          </>
        ) : (
          <Button title={busy ? 'Speichere …' : ex.measure === 'check' ? 'Als erledigt eintragen' : 'Speichern'} onPress={save} disabled={!canSave || busy} />
        )}
        {!!error && <T size={14} style={{ color: theme.danger }}>{error}</T>}
      </Card>

      {result && (
        <Card style={{ backgroundColor: theme.primarySoft, borderColor: theme.primary }}>
          <T size={20} weight="800">
            {result.achieved ? '🎉 Ziel geschafft!' : '💪 Gut gemacht – weiter so!'}
          </T>
          <T>
            +{logXp(result)} XP{result.achieved ? '' : ' · Das Ziel schaffst du beim nächsten Mal!'}
          </T>
          <T size={14} color="textSecondary">
            Lass die Leistung von deinem Trainer bestätigen: Das bringt doppelte Basis-Punkte und zählt für die Ranglisten.
          </T>
          {result.requested ? (
            <T weight="700" style={{ color: theme.primary }}>
              📨 Bestätigung angefragt
            </T>
          ) : (
            <Button title={premium ? 'Trainer-Bestätigung anfragen' : '⭐ Trainer-Bestätigung (Premium)'} onPress={() => askTrainer(result.id)} />
          )}
          <Button title="Freund herausfordern" variant="secondary" onPress={() => challengeFriend(result)} />
        </Card>
      )}

      {logs.length > 0 && <SectionTitle>Deine Einträge ({logs.length})</SectionTitle>}
      {logs.map((l) => (
        <Card key={l.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Pill text={LEVELS.find((x) => x.id === l.level)!.label} color={theme[l.level]} />
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
          {l.status === 'confirmed' ? (
            <T size={13} style={{ color: theme.primary }} weight="700">
              ✔ Von Spieler und Trainer bestätigt
            </T>
          ) : l.status === 'rejected' ? (
            <T size={13} style={{ color: theme.danger }} weight="700">
              ✖ Bestätigung abgelehnt
            </T>
          ) : l.requested ? (
            <T size={13} color="textSecondary" weight="700">
              📨 Bestätigung angefragt – wartet auf E-Mail-Bestätigung
            </T>
          ) : (
            <Button
              title={premium ? 'Trainer-Bestätigung anfragen' : '⭐ Trainer-Bestätigung (Premium)'}
              variant="secondary"
              style={{ minHeight: 40 }}
              onPress={() => askTrainer(l.id)}
            />
          )}
        </Card>
      ))}
    </Screen>
  );
}
