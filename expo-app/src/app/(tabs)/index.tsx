import { router } from 'expo-router';
import { View } from 'react-native';

import { Button, Card, Pill, Progress, Row, Screen, SectionTitle, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { DAILY_TIPS, exercisesFor, LEVELS, targetFor } from '@/data/exercises';
import { useTheme } from '@/hooks/use-theme';
import { AGE_GROUP_LABEL, groupIndex } from '@/lib/age';
import { bestLevel, challengeProgress, dayKey, levelInfo, overall, skillScores, streak, totalXp, weeklyChallenges } from '@/lib/game';
import { useStore } from '@/lib/store';
import type { Level } from '@/lib/types';

const NEXT: Record<string, Level> = { none: 'bronze', bronze: 'silber', silber: 'gold', gold: 'gold' };

export default function Home() {
  const { state, group } = useStore();
  const theme = useTheme();
  const profile = state.profile!;
  const xp = totalXp(state);
  const lvl = levelInfo(xp);
  const s = streak(state);
  const ovr = overall(skillScores(state, group));

  const today = dayKey(new Date());
  const doneToday = state.logs.filter((l) => dayKey(l.date) === today).length;

  // Tagesvorschläge: drei Übungen, die du noch nicht auf Gold hast – wechseln täglich.
  const all = exercisesFor(group);
  const seed = Number(today.replace(/-/g, '')) % all.length;
  const rotated = [...all.slice(seed), ...all.slice(0, seed)];
  const suggestions = rotated.filter((e) => bestLevel(state.logs, e.id) !== 'gold').slice(0, 3);

  const tips = DAILY_TIPS.filter((t) => !t.minGroup || groupIndex(t.minGroup) <= groupIndex(group));
  const tip = tips[Number(today.replace(/-/g, '')) % tips.length];

  const challenges = weeklyChallenges();
  const doneChallenges = challenges.filter((c) => challengeProgress(state, c) >= c.target).length;

  return (
    <Screen>
      <View>
        <T color="textSecondary">Hallo,</T>
        <T size={28} weight="800">
          {profile.nickname} 👋
        </T>
      </View>

      <Card style={{ backgroundColor: theme.primary, borderColor: theme.primary }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <T color="primaryText" size={14} weight="600">
              Level {lvl.level} · {lvl.title}
            </T>
            <T color="primaryText" size={34} weight="800">
              {xp} XP
            </T>
          </View>
          <View style={{ alignItems: 'center' }}>
            <T color="primaryText" size={12} weight="600">
              STÄRKE
            </T>
            <T color="primaryText" size={34} weight="800">
              {ovr}
            </T>
          </View>
        </Row>
        <Progress value={lvl.progress} color={theme.accent} />
        <T color="primaryText" size={12}>
          Noch {lvl.needed - lvl.current} XP bis Level {lvl.level + 1} · {AGE_GROUP_LABEL[group]}
        </T>
      </Card>

      <Row>
        <Card style={{ flex: 1, alignItems: 'center' }}>
          <T size={26}>🔥</T>
          <T size={22} weight="800">
            {s}
          </T>
          <T size={12} color="textSecondary">
            Tage in Folge
          </T>
        </Card>
        <Card style={{ flex: 1, alignItems: 'center' }}>
          <T size={26}>✅</T>
          <T size={22} weight="800">
            {doneToday}
          </T>
          <T size={12} color="textSecondary">
            Übungen heute
          </T>
        </Card>
        <Card style={{ flex: 1, alignItems: 'center' }} onPress={() => router.push('/challenges')}>
          <T size={26}>🏆</T>
          <T size={22} weight="800">
            {doneChallenges}/{challenges.length}
          </T>
          <T size={12} color="textSecondary">
            Wochen-Ziele
          </T>
        </Card>
      </Row>

      <SectionTitle>Heute für dich</SectionTitle>
      {suggestions.map((e) => {
        const best = bestLevel(state.logs, e.id);
        const next = NEXT[best ?? 'none'];
        const lv = LEVELS.find((l) => l.id === next)!;
        const target = targetFor(e, next, group);
        return (
          <Card key={e.id} onPress={() => router.push({ pathname: '/uebung/[id]', params: { id: e.id } })}>
            <Row>
              <T size={30}>{e.emoji}</T>
              <View style={{ flex: 1 }}>
                <T weight="700">{e.title}</T>
                <T size={13} color="textSecondary">
                  {e.measure === 'check' ? e.variant[next] : `Ziel: ${target} ${e.unit}`}
                </T>
              </View>
              <Pill text={lv.label} color={theme[next]} />
            </Row>
          </Card>
        );
      })}

      <Card style={{ backgroundColor: theme.primarySoft, borderColor: theme.primarySoft }}>
        <T weight="700">💡 Tipp des Tages</T>
        <T size={14}>{tip.text}</T>
      </Card>

      <Row style={{ gap: Spacing.two }}>
        <Button title="+ Tagebuch" variant="secondary" style={{ flex: 1 }} onPress={() => router.push('/eintrag')} />
        <Button title="Alle Übungen" style={{ flex: 1 }} onPress={() => router.push('/training')} />
      </Row>
    </Screen>
  );
}
