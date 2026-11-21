import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button, Card, Checkbox, Chip, Field, Screen, T, Wrap } from '@/components/ui';
import { getExercise, LEVELS, targetFor } from '@/data/exercises';
import { useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/lib/game';
import { useStore } from '@/lib/store';
import type { TrainerRole } from '@/lib/types';

const ROLES: TrainerRole[] = ['Vereinstrainer', 'NLZ-Trainer'];

export default function Confirm() {
  const { logId } = useLocalSearchParams<{ logId: string }>();
  const { state, group, confirmLog } = useStore();
  const theme = useTheme();
  const log = state.logs.find((l) => l.id === logId);
  const ex = log ? getExercise(log.exerciseId) : undefined;

  const [trainerName, setTrainerName] = useState('');
  const [club, setClub] = useState(state.profile?.club ?? '');
  const [role, setRole] = useState<TrainerRole>('Vereinstrainer');
  const [license, setLicense] = useState('');
  const [comment, setComment] = useState('');
  const [seen, setSeen] = useState(false);

  if (!log || !ex) {
    return (
      <Screen bottomBar={false} topInset={false}>
        <T>Eintrag nicht gefunden.</T>
      </Screen>
    );
  }

  if (log.confirmation) {
    return (
      <Screen bottomBar={false} topInset={false}>
        <Card>
          <T size={20} weight="800">
            ✔ Bereits bestätigt
          </T>
          <T>
            von {log.confirmation.trainerName} ({log.confirmation.role}, {log.confirmation.club}) am{' '}
            {formatDate(log.confirmation.date)}
          </T>
        </Card>
        <Button title="Zurück" onPress={() => router.back()} />
      </Screen>
    );
  }

  const valid = trainerName.trim().length >= 3 && club.trim().length >= 2 && seen;
  const level = LEVELS.find((l) => l.id === log.level)!;

  const submit = () => {
    if (!valid) return;
    confirmLog(log.id, {
      trainerName: trainerName.trim(),
      club: club.trim(),
      role,
      license: license.trim(),
      comment: comment.trim(),
    });
    router.back();
  };

  return (
    <Screen bottomBar={false} topInset={false}>
      <Card style={{ backgroundColor: theme.primarySoft, borderColor: theme.primary }}>
        <T weight="800">📱 Gib das Handy jetzt deinem Trainer.</T>
        <T size={14}>Liebe Trainerin, lieber Trainer: Bitte bestätigen Sie nur Leistungen, die Sie selbst gesehen haben.</T>
      </Card>

      <Card>
        <T size={13} color="textSecondary">
          Zu bestätigende Leistung von {state.profile?.nickname}
        </T>
        <T size={18} weight="800">
          {ex.emoji} {ex.title} · {level.label}
        </T>
        <T>
          Ergebnis: {log.value !== null ? `${String(log.value).replace('.', ',')} ${ex.unit}` : 'erledigt'}
          {ex.measure !== 'check' && ` (Ziel: ${targetFor(ex, log.level, group)})`}
        </T>
        <T size={14} color="textSecondary">
          Aufgabe: {ex.variant[log.level]}
        </T>
        <T size={12} color="textSecondary">
          Eingetragen am {formatDate(log.date)}
        </T>
      </Card>

      <Card>
        <Field label="Name Trainer/in" placeholder="Vor- und Nachname" value={trainerName} onChangeText={setTrainerName} maxLength={50} />
        <Field label="Verein / NLZ" placeholder="z. B. SV Musterstadt" value={club} onChangeText={setClub} maxLength={60} />
        <T size={14} weight="600" color="textSecondary">
          Rolle
        </T>
        <Wrap>
          {ROLES.map((r) => (
            <Chip key={r} label={r} selected={role === r} onPress={() => setRole(r)} />
          ))}
        </Wrap>
        <Field label="Trainerlizenz (optional)" placeholder="z. B. C-Lizenz, B-Lizenz, A-Lizenz" value={license} onChangeText={setLicense} maxLength={40} />
        <Field label="Kommentar (optional)" placeholder="z. B. saubere Technik, weiter so!" value={comment} onChangeText={setComment} multiline maxLength={200} />
        <Checkbox checked={seen} onChange={setSeen} label="Ich habe diese Leistung selbst gesehen und bestätige sie." />
      </Card>

      <Button title="Leistung bestätigen" onPress={submit} disabled={!valid} />
      <T size={12} color="textSecondary">
        Hinweis: In dieser Version wird die Bestätigung nur auf diesem Gerät gespeichert. Geprüfte Trainer-Konten folgen in
        einer späteren Version.
      </T>
    </Screen>
  );
}
