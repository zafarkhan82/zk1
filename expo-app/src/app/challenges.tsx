import { router } from 'expo-router';
import { useState } from 'react';
import { Share, View } from 'react-native';

import { Celebration, type CelebrationInfo } from '@/components/celebration';
import { Button, Card, Progress, Row, Screen, SectionTitle, T } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { uClass } from '@/lib/age';
import { challengeProgress, confirmedXp, levelInfo, totalXp, weeklyChallenges, weekKey, weekStart } from '@/lib/game';
import { useStore } from '@/lib/store';
import { errorText } from '@/lib/supabase';

const TIERS = [
  { emoji: '🏘️', title: 'Lokal', text: 'Dein Verein und Vereine in deiner Stadt' },
  { emoji: '🗺️', title: 'Regional', text: 'Dein Kreis und Landesverband' },
  { emoji: '🇩🇪', title: 'National', text: 'Alle deines Jahrgangs in Deutschland' },
  { emoji: '🌍', title: 'International', text: 'Vergleich mit Talenten aus anderen Ländern' },
];

export default function Challenges() {
  const { state, claim, premium } = useStore();
  const theme = useTheme();
  const [celebration, setCelebration] = useState<CelebrationInfo | null>(null);
  const [error, setError] = useState('');
  const week = weekKey();
  const list = weeklyChallenges();
  const end = new Date(weekStart());
  end.setDate(end.getDate() + 6);
  const xp = totalXp(state);
  const lvl = levelInfo(xp);
  const ranked = confirmedXp(state);
  const rankingAge = state.profile ? uClass(state.profile.birthYear) >= 14 : false;

  const collect = async (id: string, points: number) => {
    setError('');
    try {
      const before = levelInfo(xp);
      await claim(week, id, points);
      const after = levelInfo(xp + points);
      setCelebration({
        xp: points,
        achieved: true,
        personalBest: false,
        levelUp: after.level > before.level ? { level: after.level, title: after.title } : null,
        waitingForTrainer: false,
        isCheck: false,
      });
    } catch (e) {
      setError(errorText(e));
    }
  };

  const shareDuel = async () => {
    try {
      await Share.share({
        message: `⚽ Go4Pro: Ich bin Level ${lvl.level} (${lvl.title}) mit ${xp} XP. Wer von uns schafft diese Woche mehr Challenges?`,
      });
    } catch {
      // abgebrochen
    }
  };

  return (
    <Screen bottomBar={false} topInset={false}>
      <Celebration info={celebration} onClose={() => setCelebration(null)} />
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
        const claimed = state.claimed.includes(`${week}:${c.id}`);
        const rest = c.target - p;
        return (
          <Card key={c.id} style={done && !claimed ? { borderColor: theme.primary, borderWidth: 2 } : undefined}>
            <Row>
              <T size={30}>{c.emoji}</T>
              <View style={{ flex: 1 }}>
                <T weight="700">{c.title}</T>
                <T size={13} color="textSecondary">
                  {c.description}
                </T>
              </View>
              <T weight="800" style={{ color: theme.accentText }}>
                +{c.xp} XP
              </T>
            </Row>
            <Progress value={p / c.target} />
            {claimed ? (
              <T size={14} weight="700" style={{ color: theme.primary }}>
                ✔ Eingelöst
              </T>
            ) : done ? (
              <Button title={`🎁 ${c.xp} Punkte einlösen`} onPress={() => collect(c.id, c.xp)} />
            ) : (
              <T size={14} color="textSecondary">
                {p} / {c.target} · noch {rest} {c.id === 'minuten' ? 'Minuten' : rest === 1 ? 'Schritt' : 'Schritte'}
              </T>
            )}
          </Card>
        );
      })}
      {!!error && (
        <T size={14} style={{ color: theme.danger }}>
          {error}
        </T>
      )}

      <SectionTitle>Duell</SectionTitle>
      <Card>
        <T size={14}>
          Fordere Freunde aus deinem Team heraus! Nach jeder Übung kannst du dein Ergebnis teilen – oder hier deinen Level-Stand.
        </T>
        <Button title="🤝 Freunde herausfordern" variant="secondary" onPress={shareDuel} />
      </Card>

      <SectionTitle>Ranglisten</SectionTitle>
      {!rankingAge ? (
        <Card style={{ backgroundColor: theme.primarySoft, borderColor: theme.primarySoft }}>
          <T weight="700">Ranglisten gibt es ab der C-Jugend</T>
          <T size={14}>
            Bis dahin zählt dein eigener Fortschritt: Schlag deine Bestwerte und sammle Abzeichen. So macht es auch der DFB im
            Kinderfußball – ohne Tabellen.
          </T>
        </Card>
      ) : (
        <>
          <Card style={{ backgroundColor: theme.primarySoft, borderColor: theme.primarySoft }}>
            <T weight="700">Deine Ranglisten-Punkte: {ranked}</T>
            <T size={14}>Es zählen nur Leistungen, die dein Trainer freigegeben hat. So ist es fair für alle.</T>
          </Card>
          {TIERS.map((t) => (
            <Card key={t.title}>
              <Row>
                <T size={28}>{t.emoji}</T>
                <View style={{ flex: 1 }}>
                  <T weight="700">{t.title}</T>
                  <T size={13} color="textSecondary">
                    {t.text}
                  </T>
                </View>
                <T size={12} weight="700" color="textSecondary">
                  bald
                </T>
              </Row>
            </Card>
          ))}
          {!premium && <Button title="🔒 Premium ansehen" variant="secondary" onPress={() => router.push('/premium')} />}
          <T size={12} color="textSecondary">
            Teilnahme nur mit Premium und Zustimmung der Eltern, mit Spitznamen und ohne Fotos oder Kontaktdaten.
          </T>
        </>
      )}
    </Screen>
  );
}
