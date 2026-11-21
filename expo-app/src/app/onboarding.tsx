import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Checkbox, Chip, Field, Screen, T, Wrap } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { AGE_GROUP_LABEL, ageGroupFor, allowedBirthYears, uClass } from '@/lib/age';
import { useStore } from '@/lib/store';
import type { Position } from '@/lib/types';

const POSITIONS: Position[] = ['Tor', 'Abwehr', 'Mittelfeld', 'Sturm', 'Noch offen'];

export default function Onboarding() {
  const { setProfile } = useStore();
  const [nickname, setNickname] = useState('');
  const [birthYear, setBirthYear] = useState<number | null>(null);
  const [position, setPosition] = useState<Position>('Noch offen');
  const [club, setClub] = useState('');
  const [consent, setConsent] = useState(false);

  const group = birthYear ? ageGroupFor(birthYear) : null;
  const valid = nickname.trim().length >= 2 && group !== null && consent;

  const submit = () => {
    if (!valid || !birthYear) return;
    setProfile({
      nickname: nickname.trim(),
      birthYear,
      position,
      club: club.trim(),
      parentConsent: consent,
      createdAt: new Date().toISOString(),
    });
    router.replace('/');
  };

  return (
    <Screen bottomBar={false}>
      <View style={{ alignItems: 'center', gap: Spacing.two, marginTop: Spacing.four }}>
        <T size={56}>⚽</T>
        <T size={30} weight="800" style={{ textAlign: 'center' }}>
          Kick-Tagebuch
        </T>
        <T color="textSecondary" style={{ textAlign: 'center' }}>
          Trainiere, sammle Punkte und lass deine Leistungen vom Trainer bestätigen.
        </T>
      </View>

      <Card>
        <Field
          label="Dein Spitzname"
          placeholder="z. B. Flitzer10"
          value={nickname}
          onChangeText={setNickname}
          maxLength={20}
          autoCapitalize="none"
        />
        <T size={12} color="textSecondary">
          Bitte nicht deinen echten vollen Namen verwenden.
        </T>
      </Card>

      <Card>
        <T weight="700">Dein Jahrgang</T>
        <Wrap>
          {allowedBirthYears().map((y) => (
            <Chip key={y} label={String(y)} selected={birthYear === y} onPress={() => setBirthYear(y)} />
          ))}
        </Wrap>
        {birthYear && group && (
          <T color="textSecondary" size={14}>
            Du spielst diese Saison {AGE_GROUP_LABEL[group]} (U{uClass(birthYear)}).
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
        <Field label="Verein (optional)" placeholder="z. B. SV Musterstadt" value={club} onChangeText={setClub} maxLength={40} />
      </Card>

      <Card>
        <T weight="700">Für deine Eltern</T>
        <T size={14} color="textSecondary">
          Alle Daten bleiben nur auf diesem Gerät gespeichert. Es gibt keine Anmeldung, keine Fotos und keinen Kontakt zu
          Fremden.
        </T>
        <Checkbox
          checked={consent}
          onChange={setConsent}
          label="Ein Elternteil hat die App gesehen und ist einverstanden, dass ich sie nutze."
        />
      </Card>

      <Button title="Los geht's!" onPress={submit} disabled={!valid} />
    </Screen>
  );
}
