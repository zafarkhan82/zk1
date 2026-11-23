import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icons';
import { Button, Card, H, Label, Logo, Num, Pill, Progress, Row, Screen, T, useLevelColors } from '@/components/ui';
import { Font } from '@/constants/theme';
import { DAILY_TIPS, exercisesFor, LEVELS, targetFor } from '@/data/exercises';
import { useTheme } from '@/hooks/use-theme';
import { AGE_GROUP_LABEL, groupIndex } from '@/lib/age';
import { activeDays, bestLevel, challengeProgress, dayKey, levelInfo, streak, totalXp, weekStart, weeklyChallenges } from '@/lib/game';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import type { Level } from '@/lib/types';

const NEXT: Record<string, Level> = { none: 'bronze', bronze: 'silber', silber: 'gold', gold: 'gold' };
const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

interface NextMatch {
  kickoff: string;
  opponent: string;
  is_home: boolean;
  competition: string | null;
}

export default function Heute() {
  const { state, group, premium, teams } = useStore();
  const theme = useTheme();
  const levelColors = useLevelColors();
  const profile = state.profile!;
  const xp = totalXp(state);
  const lvl = levelInfo(xp);
  const s = streak(state);
  const [match, setMatch] = useState<NextMatch | null>(null);
  const team = teams.find((t) => t.status === 'approved');

  useEffect(() => {
    if (!team) return setMatch(null);
    supabase.rpc('team_schedule', { p_team: team.teamId }).then(({ data }) => {
      const next = ((data as NextMatch[]) ?? []).find((m) => new Date(m.kickoff).getTime() >= Date.now()) ?? null;
      setMatch(next);
    });
  }, [team]);

  // Wochenleiste Mo–So
  const days = activeDays(state);
  const start = weekStart();
  const todayKey = dayKey(new Date());
  const week = DAYS.map((label, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const k = dayKey(d);
    return { label, done: days.has(k), today: k === todayKey, future: k > todayKey };
  });

  // Mission: wechselt täglich, ohne bereits Gemeistertes
  const all = exercisesFor(group);
  const seed = Number(todayKey.replace(/-/g, '')) % all.length;
  const rotated = [...all.slice(seed), ...all.slice(0, seed)];
  const mission = rotated.find((e) => (premium ? bestLevel(state.logs, e.id) !== 'gold' : !bestLevel(state.logs, e.id))) ?? rotated[0];
  const missionLevel: Level = premium ? NEXT[bestLevel(state.logs, mission.id) ?? 'none'] : 'bronze';
  const missionTarget = targetFor(mission, missionLevel, group);
  const doneToday = state.logs.some((l) => dayKey(l.date) === todayKey) || state.diary.some((d) => dayKey(d.date) === todayKey);

  const toConfirm = state.logs.filter((l) => !l.playerConfirmed && l.status === 'pending');
  const challenges = weeklyChallenges();
  const tips = DAILY_TIPS.filter(
    (t) => (!t.minGroup || groupIndex(t.minGroup) <= groupIndex(group)) && (!t.maxGroup || groupIndex(group) <= groupIndex(t.maxGroup)),
  );
  const tip = tips[Number(todayKey.replace(/-/g, '')) % tips.length];

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Logo size={40} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: theme.backgroundElement }}>
          <Icon.Flame size={16} color={theme.primary} />
          <Text style={{ color: theme.text, fontFamily: Font.black, fontSize: 14 }}>{s}</Text>
        </View>
      </Row>

      <H size={52}>Hi, {profile.nickname}</H>

      {toConfirm.length > 0 && (
        <Card style={{ borderColor: theme.primary }} onPress={() => router.push('/tagebuch')}>
          <Label color="primary">Vom Trainer eingetragen</Label>
          <T weight="700">{toConfirm.length === 1 ? '1 Ergebnis' : `${toConfirm.length} Ergebnisse`} warten auf deine Bestätigung</T>
        </Card>
      )}

      <Card style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14 }}>
        {week.map((d) => (
          <View key={d.label} style={{ alignItems: 'center', gap: 6 }}>
            <Text style={{ color: d.today ? theme.text : theme.textSecondary, fontFamily: Font.semibold, fontSize: 11 }}>{d.label}</Text>
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: d.done ? theme.primary : d.future ? 'transparent' : theme.backgroundSelected,
                borderWidth: d.today && !d.done ? 1.5 : 0,
                borderColor: theme.primary,
              }}>
              {d.done && <Text style={{ color: theme.primaryText, fontFamily: Font.black, fontSize: 13 }}>✓</Text>}
            </View>
          </View>
        ))}
      </Card>

      <Card style={{ borderColor: theme.primary, padding: 0, overflow: 'hidden', gap: 0 }}>
        <View style={{ height: 84, justifyContent: 'flex-end', paddingHorizontal: 18, paddingBottom: 10, backgroundColor: theme.primarySoft }}>
          <Label color="primary">{doneToday ? 'Weiter geht’s' : 'Deine Mission heute'}</Label>
        </View>
        <View style={{ padding: 18, gap: 10 }}>
          <H size={38}>{mission.title}</H>
          <Row style={{ flexWrap: 'wrap' }}>
            <Pill text={LEVELS.find((l) => l.id === missionLevel)!.label} color={levelColors[missionLevel].bg} textColor={levelColors[missionLevel].fg} />
            <T size={15} color="textSecondary">
              {mission.measure === 'check' ? `ca. ${mission.minutes} Min.` : `Ziel: ${String(missionTarget).replace('.', ',')} ${mission.unit}`}
            </T>
          </Row>
          <Button title={doneToday ? 'Noch eine Übung' : 'Los geht’s'} onPress={() => router.push({ pathname: '/uebung/[id]', params: { id: mission.id } })} />
        </View>
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <H size={22}>
            Level {lvl.level} · {lvl.title}
          </H>
          <Num size={22}>
            {xp.toLocaleString('de-DE')} <Text style={{ fontSize: 14, color: theme.textSecondary }}>XP</Text>
          </Num>
        </Row>
        <Progress value={lvl.progress} />
        <T size={13} color="textSecondary">
          Noch {lvl.needed - lvl.current} XP bis Level {lvl.level + 1} · {AGE_GROUP_LABEL[group]}
        </T>
      </Card>

      {match && team && (
        <Card onPress={() => router.push('/team')}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Label>Nächstes Spiel</Label>
            <T size={12} color="textSecondary">
              {match.competition ?? ''}
            </T>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
              <Crest text={team.teamName} primary />
              <T size={13} weight="600" style={{ textAlign: 'center' }}>
                {match.is_home ? team.teamName : match.opponent}
              </T>
            </View>
            <View style={{ alignItems: 'center' }}>
              <T size={12} color="textSecondary">
                {new Date(match.kickoff).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}
              </T>
              <Num size={32}>{new Date(match.kickoff).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</Num>
            </View>
            <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
              <Crest text={match.is_home ? match.opponent : team.teamName} primary={!match.is_home} />
              <T size={13} weight="600" style={{ textAlign: 'center' }}>
                {match.is_home ? match.opponent : team.teamName}
              </T>
            </View>
          </Row>
        </Card>
      )}

      <Pressable onPress={() => router.push('/challenges')} accessibilityRole="button">
        <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
          <H size={26}>Challenges der Woche</H>
          <Icon.Chevron color={theme.textSecondary} />
        </Row>
      </Pressable>
      {challenges.map((c) => {
        const p = challengeProgress(state, c);
        const claimed = state.claimed.some((k) => k.endsWith(`:${c.id}`));
        return (
          <Card key={c.id} onPress={() => router.push('/challenges')} style={{ gap: 10 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T weight="700" style={{ flex: 1 }}>
                {c.title}
              </T>
              <Num size={18} color={claimed ? 'textSecondary' : 'primary'}>
                {claimed ? '✓' : `+${c.xp}`}
              </Num>
            </Row>
            <Progress value={p / c.target} height={8} />
          </Card>
        );
      })}

      <Card style={{ backgroundColor: theme.primarySoft }}>
        <Label color="primary">Tipp des Tages</Label>
        <T size={15}>{tip.text}</T>
      </Card>
    </Screen>
  );
}

function Crest({ text, primary }: { text: string; primary?: boolean }) {
  const theme = useTheme();
  const initials = text
    .replace(/[^A-Za-zÄÖÜäöüß0-9 ]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <View
      style={{
        width: 48,
        height: 48,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: primary ? theme.primary : theme.backgroundSelected,
      }}>
      <Text style={{ color: primary ? theme.primaryText : theme.text, fontFamily: Font.black, fontSize: 14 }}>{initials}</Text>
    </View>
  );
}
