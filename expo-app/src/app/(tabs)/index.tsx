import { router } from 'expo-router';
import { View } from 'react-native';

import { Button, Card, Pill, Progress, Row, Screen, SectionTitle, T, useLevelColors } from '@/components/ui';
import { DAILY_TIPS, exercisesFor, LEVELS, targetFor } from '@/data/exercises';
import { useTheme } from '@/hooks/use-theme';
import { AGE_GROUP_LABEL, groupIndex } from '@/lib/age';
import { bestLevel, challengeProgress, dayKey, levelInfo, overall, skillScores, streak, totalXp, weeklyChallenges } from '@/lib/game';
import { useStore } from '@/lib/store';
import type { Level } from '@/lib/types';

const NEXT: Record<string, Level> = { none: 'bronze', bronze: 'silber', silber: 'gold', gold: 'gold' };

function Stat({ emoji, value, label, onPress }: { emoji: string; value: string; label: string; onPress?: () => void }) {
  return (
    <Card style={{ flex: 1, alignItems: 'center', minHeight: 112, justifyContent: 'center' }} onPress={onPress}>
      <T size={24}>{emoji}</T>
      <T size={22} weight="800">
        {value}
      </T>
      <T size={12} color="textSecondary" numberOfLines={1}>
        {label}
      </T>
    </Card>
  );
}

export default function Home() {
  const { state, group, premium } = useStore();
  const theme = useTheme();
  const levelColors = useLevelColors();
  const profile = state.profile!;
  const xp = totalXp(state);
  const lvl = levelInfo(xp);
  const s = streak(state);
  const skill = overall(skillScores(state, group), profile.position === 'Tor');

  const today = dayKey(new Date());
  const doneToday =
    state.logs.filter((l) => dayKey(l.date) === today).length + state.diary.filter((d) => dayKey(d.date) === today).length;
  const toConfirm = state.logs.filter((l) => !l.playerConfirmed && l.status === 'pending');

  // Tagesvorschläge: wechseln täglich, ohne bereits Gemeistertes
  const all = exercisesFor(group);
  const seed = Number(today.replace(/-/g, '')) % all.length;
  const rotated = [...all.slice(seed), ...all.slice(0, seed)];
  const suggestions = rotated
    .filter((e) => (premium ? bestLevel(state.logs, e.id) !== 'gold' : !bestLevel(state.logs, e.id)))
    .slice(0, 3);
  const main = suggestions[0];

  const tips = DAILY_TIPS.filter(
    (t) =>
      (!t.minGroup || groupIndex(t.minGroup) <= groupIndex(group)) &&
      (!t.maxGroup || groupIndex(group) <= groupIndex(t.maxGroup)),
  );
  const tip = tips[Number(today.replace(/-/g, '')) % tips.length];

  const challenges = weeklyChallenges();
  const doneChallenges = challenges.filter((c) => challengeProgress(state, c) >= c.target).length;

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <T color="textSecondary">Hallo,</T>
          <T size={28} weight="800" numberOfLines={1}>
            {profile.nickname} 👋
          </T>
        </View>
        <View style={{ alignItems: 'center' }} accessibilityLabel={`${s} Tage in Folge aktiv`}>
          <T size={26}>🔥</T>
          <T weight="800">{s} Tage</T>
        </View>
      </Row>

      {toConfirm.length > 0 && (
        <Card style={{ borderColor: theme.accent, borderWidth: 2 }} onPress={() => router.push('/tagebuch')}>
          <T weight="800">📝 {toConfirm.length === 1 ? '1 Eintrag' : `${toConfirm.length} Einträge`} vom Trainer</T>
          <T size={14}>Dein Trainer hat Ergebnisse für dich eingetragen. Bitte im Tagebuch kurz bestätigen.</T>
        </Card>
      )}

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
          <View style={{ alignItems: 'flex-end' }}>
            <T color="primaryText" size={12} weight="700">
              SKILL (0–99)
            </T>
            <T color="primaryText" size={30} weight="800">
              {skill}
            </T>
          </View>
        </Row>
        <Progress value={lvl.progress} color={theme.accent} />
        <T color="primaryText" size={13}>
          Noch {lvl.needed - lvl.current} XP bis Level {lvl.level + 1} · {AGE_GROUP_LABEL[group]}
        </T>
      </Card>

      {main && (
        <Card style={{ borderColor: theme.primary, borderWidth: 2 }}>
          <T size={13} weight="700" color="textSecondary">
            {doneToday === 0 ? 'DEINE ÜBUNG FÜR HEUTE' : 'WEITER GEHT’S'}
          </T>
          <Row>
            <T size={36}>{main.emoji}</T>
            <View style={{ flex: 1 }}>
              <T size={18} weight="800">
                {main.title}
              </T>
              <T size={14} color="textSecondary">
                ca. {main.minutes} Min. · {main.equipment}
              </T>
            </View>
          </Row>
          <Button
            title={doneToday === 0 ? '▶ Jetzt trainieren – Serie halten' : '▶ Jetzt trainieren'}
            onPress={() => router.push({ pathname: '/uebung/[id]', params: { id: main.id } })}
          />
        </Card>
      )}

      <Row>
        <Stat emoji="✅" value={String(doneToday)} label="heute" />
        <Stat emoji="🏆" value={`${doneChallenges}/${challenges.length}`} label="Wochenziele" onPress={() => router.push('/challenges')} />
        <Stat emoji="📓" value={String(state.diary.length)} label="Tagebuch" onPress={() => router.push('/tagebuch')} />
      </Row>

      {suggestions.length > 1 && <SectionTitle>Auch gut für heute</SectionTitle>}
      {suggestions.slice(1).map((e) => {
        const best = bestLevel(state.logs, e.id);
        const next = premium ? NEXT[best ?? 'none'] : 'bronze';
        const lv = LEVELS.find((l) => l.id === next)!;
        const target = targetFor(e, next, group);
        return (
          <Card key={e.id} onPress={() => router.push({ pathname: '/uebung/[id]', params: { id: e.id } })}>
            <Row>
              <T size={30}>{e.emoji}</T>
              <View style={{ flex: 1 }}>
                <T weight="700">{e.title}</T>
                <T size={13} color="textSecondary">
                  {e.measure === 'check' ? e.variant[next] : `Ziel: ${String(target).replace('.', ',')} ${e.unit}`}
                </T>
              </View>
              <Pill text={lv.label} color={levelColors[next].bg} textColor={levelColors[next].fg} />
            </Row>
          </Card>
        );
      })}

      <Card style={{ backgroundColor: theme.primarySoft, borderColor: theme.primarySoft }}>
        <T weight="700">💡 Tipp des Tages</T>
        <T size={14}>{tip.text}</T>
      </Card>

      <Row style={{ gap: 8 }}>
        <Button title="+ Tagebuch" variant="secondary" style={{ flex: 1 }} onPress={() => router.push('/eintrag')} />
        <Button title="Alle Übungen" variant="secondary" style={{ flex: 1 }} onPress={() => router.push('/training')} />
      </Row>
    </Screen>
  );
}
