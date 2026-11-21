import { router } from 'expo-router';
import { Share, View } from 'react-native';

import { Button, Card, Progress, Row, Screen, SectionTitle, T } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { challengeProgress, confirmedXp, levelInfo, totalXp, weeklyChallenges, weekKey, weekStart } from '@/lib/game';
import { useStore } from '@/lib/store';

const TIERS = [
  { emoji: '🏘️', title: 'Lokal', text: 'Dein Verein und Vereine in deiner Stadt' },
  { emoji: '🗺️', title: 'Regional', text: 'Dein Kreis und Landesverband' },
  { emoji: '🇩🇪', title: 'National', text: 'Alle Spieler deines Jahrgangs in Deutschland' },
  { emoji: '🌍', title: 'International', text: 'Vergleich mit Talenten aus anderen Ländern' },
];

export default function Challenges() {
  const { state, claim, premium } = useStore();
  const theme = useTheme();
  const week = weekKey();
  const list = weeklyChallenges();
  const end = new Date(weekStart().getTime() + 6 * 86400000);
  const lvl = levelInfo(totalXp(state));
  const ranked = confirmedXp(state);

  const shareDuel = async () => {
    try {
      await Share.share({
        message: `⚽ Kick-Tagebuch: Ich bin Level ${lvl.level} (${lvl.title}) mit ${totalXp(state)} XP. Wer von uns schafft diese Woche mehr Challenges?`,
      });
    } catch {
      // abgebrochen
    }
  };

  return (
    <Screen>
      <View>
        <T size={28} weight="800">
          Challenges
        </T>
        <T size={14} color="textSecondary">
          Neue Wochen-Challenges jeden Montag · gültig bis {end.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
        </T>
      </View>

      {list.map((c) => {
        const p = challengeProgress(state, c);
        const done = p >= c.target;
        const key = `${week}:${c.id}`;
        const claimed = state.claimed.includes(key);
        return (
          <Card key={c.id} style={done ? { borderColor: theme.primary, borderWidth: 2 } : undefined}>
            <Row>
              <T size={30}>{c.emoji}</T>
              <View style={{ flex: 1 }}>
                <T weight="700">{c.title}</T>
                <T size={13} color="textSecondary">
                  {c.description}
                </T>
              </View>
              <T weight="800" style={{ color: theme.accent }}>
                +{c.xp}
              </T>
            </Row>
            <Progress value={p / c.target} />
            <Row style={{ justifyContent: 'space-between' }}>
              <T size={13} color="textSecondary">
                {p} / {c.target}
              </T>
              {claimed ? (
                <T size={13} weight="700" style={{ color: theme.primary }}>
                  ✔ Eingelöst
                </T>
              ) : (
                <Button title="Punkte holen" disabled={!done} onPress={() => claim(key)} style={{ minHeight: 36, paddingHorizontal: 16 }} />
              )}
            </Row>
          </Card>
        );
      })}

      <SectionTitle>Duell</SectionTitle>
      <Card>
        <T size={14}>
          Fordere Freunde aus deinem Team heraus! Bei jeder Übung kannst du nach dem Eintragen dein Ergebnis teilen – oder du
          schickst hier deinen Level-Stand.
        </T>
        <Button title="Freunde herausfordern" variant="secondary" onPress={shareDuel} />
      </Card>

      <SectionTitle>Ranglisten</SectionTitle>
      <Card style={{ backgroundColor: theme.primarySoft, borderColor: theme.primarySoft }}>
        <T weight="700">Deine Ranglisten-Punkte: {ranked}</T>
        <T size={14}>
          In die Ranglisten zählen nur Leistungen, die ein Trainer bestätigt hat. So ist es fair für alle.
        </T>
      </Card>
      {TIERS.map((t) => (
        <Card key={t.title} style={{ opacity: 0.7 }}>
          <Row>
            <T size={28}>{t.emoji}</T>
            <View style={{ flex: 1 }}>
              <T weight="700">{t.title}</T>
              <T size={13} color="textSecondary">
                {t.text}
              </T>
            </View>
            <T size={18}>🔒</T>
          </Row>
        </Card>
      ))}
      {!premium && <Button title="⭐ Mit Premium freischalten" onPress={() => router.push('/premium')} />}
      <T size={12} color="textSecondary">
        Die Ranglisten werden gerade aufgebaut. Teilnahme nur mit Premium und Zustimmung der Eltern, mit Spitznamen und ohne
        Fotos oder Kontaktdaten.
      </T>
    </Screen>
  );
}
