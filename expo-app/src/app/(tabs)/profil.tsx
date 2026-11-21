import { router } from 'expo-router';
import { Alert, Platform, View } from 'react-native';

import { Button, Card, Progress, Row, Screen, SectionTitle, T, Wrap } from '@/components/ui';
import { CATEGORIES } from '@/data/exercises';
import { useTheme } from '@/hooks/use-theme';
import { AGE_GROUP_LABEL, uClass } from '@/lib/age';
import { badges, confirmedXp, levelInfo, overall, skillScores, totalXp } from '@/lib/game';
import { useStore } from '@/lib/store';

export default function ProfileScreen() {
  const { state, group, resetAll } = useStore();
  const theme = useTheme();
  const profile = state.profile!;
  const scores = skillScores(state, group);
  const xp = totalXp(state);
  const lvl = levelInfo(xp);
  const list = badges(state, group);
  const earned = list.filter((b) => b.earned).length;
  const confirmations = state.logs.filter((l) => l.confirmation);

  const reset = () => {
    const doReset = () => {
      resetAll();
      router.replace('/onboarding');
    };
    const msg = 'Alle Einträge, Punkte und dein Profil werden auf diesem Gerät gelöscht.';
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (typeof window !== 'undefined' && window.confirm(`Alles löschen?\n\n${msg}`)) doReset();
      return;
    }
    Alert.alert('Alles löschen?', msg, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: doReset },
    ]);
  };

  return (
    <Screen>
      <Card style={{ alignItems: 'center' }}>
        <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }}>
          <T size={34} weight="800" color="primaryText">
            {overall(scores)}
          </T>
        </View>
        <T size={24} weight="800">
          {profile.nickname}
        </T>
        <T color="textSecondary" size={14} style={{ textAlign: 'center' }}>
          {AGE_GROUP_LABEL[group]} (U{uClass(profile.birthYear)}) · {profile.position}
          {profile.club ? ` · ${profile.club}` : ''}
        </T>
        <T weight="700">
          Level {lvl.level} · {lvl.title} · {xp} XP
        </T>
      </Card>

      <SectionTitle>Deine Skills</SectionTitle>
      <Card>
        {CATEGORIES.map((c) => (
          <View key={c.id} style={{ gap: 4 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T size={14} weight="600">
                {c.emoji} {c.label}
              </T>
              <T size={14} weight="800">
                {scores[c.id]}
              </T>
            </Row>
            <Progress value={scores[c.id] / 99} />
          </View>
        ))}
        <T size={12} color="textSecondary">
          Skills steigen, wenn du Ziele auf Bronze, Silber und Gold schaffst. Trainer-Bestätigungen geben extra Punkte.
        </T>
      </Card>

      <SectionTitle right={<T color="textSecondary">{earned}/{list.length}</T>}>Abzeichen</SectionTitle>
      <Wrap>
        {list.map((b) => (
          <Card key={b.id} style={{ width: '31%', minWidth: 96, flexGrow: 1, alignItems: 'center', opacity: b.earned ? 1 : 0.35 }}>
            <T size={28}>{b.earned ? b.emoji : '🔒'}</T>
            <T size={13} weight="700" style={{ textAlign: 'center' }}>
              {b.title}
            </T>
            <T size={11} color="textSecondary" style={{ textAlign: 'center' }}>
              {b.description}
            </T>
          </Card>
        ))}
      </Wrap>

      <SectionTitle>Bestätigte Leistungen</SectionTitle>
      <Card>
        <T weight="700">
          {confirmations.length} bestätigt · {confirmedXp(state)} Ranglisten-Punkte
        </T>
        {confirmations.slice(0, 5).map((l) => (
          <T key={l.id} size={13} color="textSecondary">
            ✔ {l.confirmation!.trainerName} ({l.confirmation!.role}) – {new Date(l.confirmation!.date).toLocaleDateString('de-DE')}
          </T>
        ))}
      </Card>

      <SectionTitle>Einstellungen</SectionTitle>
      <Card>
        <T size={13} color="textSecondary">
          Deine Daten sind nur auf diesem Gerät gespeichert. Wenn du die App löschst, sind sie weg.
        </T>
        <Button title="Alles zurücksetzen" variant="danger" onPress={reset} />
      </Card>
    </Screen>
  );
}
