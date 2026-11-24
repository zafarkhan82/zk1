import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AdCard, NewsPreview, RankOverviewCard, TeamFeed } from '@/components/home-cards';
import { Icon } from '@/components/icons';
import { Button, Card, H, Label, Logo, Num, Pill, Progress, Row, Screen, T, useLevelColors } from '@/components/ui';
import { Font } from '@/constants/theme';
import { DAILY_TIPS, exercisesFor, LEVELS, targetFor } from '@/data/exercises';
import { useTheme } from '@/hooks/use-theme';
import { AGE_GROUP_LABEL, groupIndex } from '@/lib/age';
import { activeDays, bestLevel, challengeProgress, dayKey, levelInfo, streak, totalXp, weekStart, weeklyChallenges } from '@/lib/game';
import { useHomeAd, useNews, useRankOverview, useTeamFeed } from '@/lib/home';
import { useStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import type { Level } from '@/lib/types';

const NEXT: Record<string, Level> = { none: 'bronze', bronze: 'silber', silber: 'gold', gold: 'gold' };
const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const WELLBEING = [
  { emoji: '💧', text: 'Genug trinken – vor, während und nach dem Training.' },
  { emoji: '😴', text: '9 bis 10 Stunden Schlaf machen dich schneller und konzentrierter.' },
  { emoji: '🤝', text: 'Fair Play: Gib nach dem Spiel allen die Hand – auch wenn ihr verloren habt.' },
];

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
  const ranks = useRankOverview(profile.id, state.logs.length);
  const { items: news } = useNews(profile.id, 5);
  const feed = useTeamFeed(team?.teamId);
  const ad = useHomeAd(profile.id);
  const freshNews = news.filter((n) => Date.now() - new Date(n.publishedAt).getTime() < 3 * 86400000).length;

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
        <Row style={{ gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Serie: ${s} Tage, zum Verlauf`}
            onPress={() => router.push('/verlauf')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 40, borderRadius: 999, backgroundColor: theme.backgroundElement }}>
            <Icon.Flame size={16} color={theme.primary} />
            <Text style={{ color: theme.text, fontFamily: Font.black, fontSize: 14 }}>{s}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={freshNews ? `${freshNews} neue Nachrichten` : 'Nachrichten'}
            onPress={() => router.push('/nachrichten')}
            style={{ width: 40, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.backgroundElement }}>
            <Icon.Bell size={20} color={theme.text} />
            {freshNews > 0 && (
              <View style={{ position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: theme.primaryText, fontFamily: Font.black, fontSize: 10 }}>{freshNews}</Text>
              </View>
            )}
          </Pressable>
        </Row>
      </Row>

      <View style={{ gap: 8 }}>
        <H size={52}>Hi, {profile.nickname}</H>
        <Pressable accessibilityRole="button" onPress={() => router.push('/profil')} style={{ gap: 6 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T size={14} weight="700">
              Level {lvl.level} · {lvl.title}
            </T>
            <T size={13} color="textSecondary">
              noch {lvl.needed - lvl.current} XP bis Level {lvl.level + 1}
            </T>
          </Row>
          <Progress value={lvl.progress} height={8} />
        </Pressable>
      </View>

      {toConfirm.length > 0 && (
        <Card style={{ borderColor: theme.primary }} onPress={() => router.push('/tagebuch')}>
          <Label color="primary">Vom Trainer eingetragen</Label>
          <T weight="700">{toConfirm.length === 1 ? '1 Ergebnis' : `${toConfirm.length} Ergebnisse`} warten auf deine Bestätigung</T>
        </Card>
      )}

      <Card style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14 }} onPress={() => router.push('/verlauf')}>
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
        <View style={{ paddingHorizontal: 18, paddingVertical: 10, backgroundColor: theme.primarySoft, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Label color="primary">{doneToday ? 'Weiter geht’s' : 'Deine Mission heute'}</Label>
          <Label color="primary">{doneToday ? 'heute ✓' : `+${LEVELS.find((l) => l.id === missionLevel)!.xp} XP`}</Label>
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

      {team ? (
        <RankOverviewCard rows={ranks} />
      ) : (
        <Card onPress={() => router.push('/team')} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, borderColor: theme.primary }}>
          <Icon.Shield color={theme.primary} />
          <View style={{ flex: 1 }}>
            <T weight="700">Tritt deinem Team bei</T>
            <T size={13} color="textSecondary">
              Mit dem Code deines Trainers siehst du Kader, Spielplan und Ranglisten.
            </T>
          </View>
          <Icon.Chevron color={theme.textSecondary} />
        </Card>
      )}

      <NewsPreview items={news} />

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

      {ad && <AdCard ad={ad} />}

      <TeamFeed items={feed} />

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

      <Card style={{ gap: 10 }}>
        <Label>Gut für dich</Label>
        {WELLBEING.map((w) => (
          <Row key={w.text} style={{ gap: 12 }}>
            <Text style={{ fontSize: 20 }}>{w.emoji}</Text>
            <T size={14} style={{ flex: 1 }}>
              {w.text}
            </T>
          </Row>
        ))}
        <T size={12} color="textSecondary">
          Pausen gehören zum Training. Wenn dir etwas weh tut: Sag es deinen Eltern oder deinem Trainer.
        </T>
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
