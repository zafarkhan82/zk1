import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Checkbox, Chip, Field, Screen, T, Wrap } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { AGE_GROUP_LABEL, ageGroupFor, allowedBirthYears, uClass } from '@/lib/age';
import { useStore } from '@/lib/store';
import { errorText } from '@/lib/supabase';
import type { Position } from '@/lib/types';

const POSITIONS: Position[] = ['Tor', 'Abwehr', 'Mittelfeld', 'Sturm', 'Noch offen'];

export default function CreatePlayer() {
  const { createPlayer, players } = useStore();
  const theme = useTheme();
  const [forSelf, setForSelf] = useState(false);
  const [nickname, setNickname] = useState('');
  const [birthYear, setBirthYear] = useState<number | null>(null);
  const [position, setPosition] = useState<Position>('Noch offen');
  const [consent, setConsent] = useState(false);
  const [publicConsent, setPublicConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const group = birthYear ? ageGroupFor(birthYear) : null;
  const u = birthYear ? uClass(birthYear) : 0;
  // Eigenes Konto erst ab 16: Jahrgang konservativ (mind. 17 im laufenden Kalenderjahr), wie in der Datenbank
  const selfTooYoung = forSelf && birthYear !== null && new Date().getFullYear() - birthYear < 17;
  const valid = nickname.trim().length >= 2 && group !== null && consent && !selfTooYoung;

  const submit = async () => {
    if (!valid || !birthYear) return;
    setBusy(true);
    setError('');
    try {
      await createPlayer({ nickname: nickname.trim(), birthYear, position, forSelf, publicConsent });
      router.replace('/');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen bottomBar={false} topInset={false}>
      {players.length === 0 && (
        <View style={{ gap: Spacing.one }}>
          <T size={24} weight="800">
            Willkommen! 👋
          </T>
          <T color="textSecondary">Lege jetzt den Spieler an, dessen Entwicklung ihr festhalten wollt.</T>
        </View>
      )}

      <Card onPress={() => router.push('/trainer')}>
        <T weight="700">🧑‍🏫 Ich bin Trainer*in</T>
        <T size={14} color="textSecondary">
          Kein Spielerprofil nötig – direkt zum Trainer-Bereich: Verein, Teams und Freigaben.
        </T>
      </Card>

      <Card>
        <T weight="700">Für wen ist das Profil?</T>
        <Wrap>
          <Chip label="👨‍👩‍👧 Mein Kind" selected={!forSelf} onPress={() => setForSelf(false)} />
          <Chip label="🙋 Für mich (ab 16)" selected={forSelf} onPress={() => setForSelf(true)} />
        </Wrap>
      </Card>

      <Card>
        <Field
          label="Spitzname"
          placeholder="z. B. Flitzer10"
          value={nickname}
          onChangeText={setNickname}
          maxLength={20}
          autoCapitalize="none"
        />
        <T size={12} color="textSecondary">
          Der Spitzname ist in Ranglisten sichtbar. Bitte keinen vollen echten Namen verwenden.
        </T>
      </Card>

      <Card>
        <T weight="700">Jahrgang</T>
        <Wrap>
          {allowedBirthYears().map((y) => (
            <Chip key={y} label={String(y)} selected={birthYear === y} onPress={() => setBirthYear(y)} />
          ))}
        </Wrap>
        {birthYear && group && (
          <T color="textSecondary" size={14}>
            Spielt diese Saison {AGE_GROUP_LABEL[group]} (U{u}).
          </T>
        )}
        {selfTooYoung && (
          <T size={14} style={{ color: theme.danger }}>
            Unter 16 legt ein Elternteil das Profil an. Ab Jahrgang {new Date().getFullYear() - 17} geht ein eigenes Konto.
          </T>
        )}
      </Card>

      <Card>
        <T weight="700">Lieblingsposition</T>
        <Wrap>
          {POSITIONS.map((p) => (
            <Chip key={p} label={p} selected={position === p} onPress={() => setPosition(p)} />
          ))}
        </Wrap>
      </Card>

      <Card>
        <T weight="700">{forSelf ? 'Einverständnis' : 'Einverständnis der Eltern'}</T>
        <Checkbox
          checked={consent}
          onChange={setConsent}
          label={
            forSelf
              ? 'Ich stimme der Nutzung zu und habe die Datenschutzerklärung gelesen.'
              : 'Ich bin erziehungsberechtigt und stimme zu, dass mein Kind die App nutzt.'
          }
        />
        <Checkbox
          checked={publicConsent}
          onChange={setPublicConsent}
          label="Optional: Ab der C-Jugend dürfen Spitzname, Jahrgang, Verein und freigegebene Leistungen in Ranglisten erscheinen (nur mit Premium). Jederzeit widerrufbar."
        />
      </Card>

      {!!error && (
        <T size={14} style={{ color: theme.danger }}>
          {error}
        </T>
      )}
      <Button title={busy ? 'Speichere …' : "Los geht's!"} onPress={submit} disabled={!valid || busy} />
    </Screen>
  );
}
