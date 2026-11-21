import { router } from 'expo-router';
import { useState } from 'react';

import { Button, Card, Chip, Field, Screen, T, Wrap } from '@/components/ui';
import { DIARY_TYPES, MOODS } from '@/data/diary';
import { DIARY_XP } from '@/lib/game';
import { useStore } from '@/lib/store';
import { errorText } from '@/lib/supabase';
import type { DiaryEntry, DiaryType } from '@/lib/types';

const MINUTES = [0, 15, 30, 45, 60, 75, 90, 120];

export default function NewEntry() {
  const { addDiary } = useStore();
  const [type, setType] = useState<DiaryType>('training');
  const [minutes, setMinutes] = useState(60);
  const [mood, setMood] = useState<DiaryEntry['mood']>(4);
  const [good, setGood] = useState('');
  const [improve, setImprove] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await addDiary({ type, minutes, mood, good: good.trim(), improve: improve.trim() });
      router.back();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen bottomBar={false} topInset={false}>
      <Card>
        <T weight="700">Was hast du gemacht?</T>
        <Wrap>
          {DIARY_TYPES.map((t) => (
            <Chip key={t.id} label={t.label} selected={type === t.id} onPress={() => setType(t.id)} />
          ))}
        </Wrap>
        <T weight="700">Wie lange? (Minuten)</T>
        <Wrap>
          {MINUTES.map((m) => (
            <Chip key={m} label={String(m)} selected={minutes === m} onPress={() => setMinutes(m)} />
          ))}
        </Wrap>
        <T weight="700">Wie hast du dich gefühlt?</T>
        <Wrap>
          {MOODS.map((m) => (
            <Chip key={m.id} label={m.emoji} selected={mood === m.id} onPress={() => setMood(m.id)} />
          ))}
        </Wrap>
      </Card>

      <Card>
        <Field label="Das lief gut 👍" placeholder="z. B. Viele gute Pässe gespielt" value={good} onChangeText={setGood} multiline maxLength={300} />
        <Field label="Das will ich verbessern 🎯" placeholder="z. B. Mehr mit links schießen" value={improve} onChangeText={setImprove} multiline maxLength={300} />
      </Card>

      {!!error && <T size={14}>{error}</T>}
      <Button title={busy ? 'Speichere …' : `Speichern (+${DIARY_XP} XP)`} onPress={save} disabled={busy} />
      <T size={12} color="textSecondary">
        Tagebucheinträge werden dauerhaft gespeichert und können nicht gelöscht werden.
      </T>
    </Screen>
  );
}
