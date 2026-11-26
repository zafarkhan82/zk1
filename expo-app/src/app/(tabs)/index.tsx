import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { AdCard, NewsPreview, RankOverviewCard, TeamFeed } from '@/components/home-cards';
import { Icon } from '@/components/icons';
import {
  Anchors,
  MatchCenterCard,
  RatingsCard,
  SectionHeading,
  StatsCard,
  TeamWeekCard,
  TrainingStatusCard,
} from '@/components/overview';
import { TIER_STYLE } from '@/components/player-card';
import { Card, Chip, Columns, H, Label, Logo, Num, Progress, Row, Screen, T } from '@/components/ui';
import { Font } from '@/constants/theme';
import { DAILY_TIPS, exercisesFor, targetFor } from '@/data/exercises';
import { useTheme } from '@/hooks/use-theme';
import { groupIndex } from '@/lib/age';
import { activeDays, bestLevel, challengeProgress, dayKey, levelInfo, streak, totalXp, weeklyChallenges } from '@/lib/game';
import {
  useHomeAd,
  useMatchCenter,
  useNews,
  useRankOverview,
  useRatingHistory,
  useRatingOverview,
  useTeamFeed,
  useTeamWeek,
} from '@/lib/home';
import { nextTier, tierFor, usePlayerRating } from '@/lib/rating';
import { useStore } from '@/lib/store';
import type { Level } from '@/lib/types';

const NEXT: Record<string, Level> = { none: 'bronze', bronze: 'silber', silber: 'gold', gold: 'gold' };
const WELLBEING = [
  { emoji: '💧', text: 'Genug trinken – vor, während und nach dem Training.' },
  { emoji: '😴', text: '9 bis 10 Stunden Schlaf machen dich schneller und konzentrierter.' },
  { emoji: '🤝', text: 'Fair Play: Gib nach dem Spiel allen die Hand – auch wenn ihr verloren habt.' },
];

/** Längste Serie aktiver Tage */
function longestStreak(days: Set<string>) {
  const sorted = [...days].sort();
  let best = 0;
  let cur = 0;
  let prev: number | null = null;
  for (const d of sorted) {
    const t = new Date(d + 'T12:00:00').getTime();
    cur = prev != null && Math.round((t - prev) / 86400000) === 1 ? cur + 1 : 1;
    best = Math.max(best, cur);
    prev = t;
  }
  return best;
}

export default function Heute() {
  const { state, group, premium, teams, players, selectPlayer } = useStore();
  const theme = useTheme();
  const profile = state.profile!;
  const xp = totalXp(state);
  const lvl = levelInfo(xp);
  const s = streak(state);
  const team = teams.find((t) => t.status === 'approved');

  const rating = usePlayerRating(profile.id, state.logs.length);
  const ranks = useRankOverview(profile.id, state.logs.length);
  const matches = useMatchCenter(profile.id);
  const teamWeek = useTeamWeek(team?.teamId);
  const ratings = useRatingOverview(profile.id);
  const history = useRatingHistory(profile.id, 12);
  const { items: news } = useNews(profile.id, 5);
  const feed = useTeamFeed(team?.teamId);
  const ad = useHomeAd(profile.id);
  const freshNews = news.filter((n) => Date.now() - new Date(n.publishedAt).getTime() < 3 * 86400000).length;

  const todayKey = dayKey(new Date());
  // Vorschlag: wechselt täglich, ohne bereits Gemeistertes
  const all = exercisesFor(group);
  const seed = Number(todayKey.replace(/-/g, '')) % all.length;
  const rotated = [...all.slice(seed), ...all.slice(0, seed)];
  const mission = rotated.find((e) => (premium ? bestLevel(state.logs, e.id) !== 'gold' : !bestLevel(state.logs, e.id))) ?? rotated[0];
  const missionLevel: Level = premium ? NEXT[bestLevel(state.logs, mission.id) ?? 'none'] : 'bronze';
  const missionTarget =
    mission.measure === 'check' ? `ca. ${mission.minutes} Min.` : `Ziel: ${String(targetFor(mission, missionLevel, group)).replace('.', ',')} ${mission.unit}`;

  const toConfirm = state.logs.filter((l) => !l.playerConfirmed && l.status === 'pending');
  const challenges = weeklyChallenges();
  const tips = DAILY_TIPS.filter(
    (t) => (!t.minGroup || groupIndex(t.minGroup) <= groupIndex(group)) && (!t.maxGroup || groupIndex(group) <= groupIndex(t.maxGroup)),
  );
  const tip = tips[Number(todayKey.replace(/-/g, '')) % tips.length];
  const tier = rating ? tierFor(rating.overall) : null;
  const nt = rating ? nextTier(rating.overall) : null;

  const card = rating
    ? {
        nickname: profile.nickname,
        position: profile.position,
        club: team?.clubName ?? null,
        team: team?.teamName ?? null,
        jersey: team?.jerseyNumber ?? null,
        overall: rating.overall,
        attributes: rating.attributes,
        go4proId: rating.go4proId,
      }
    : null;

  return (
    <Screen wide>
      <Row style={{ justifyContent: 'space-between' }}>
        <Logo size={40} />
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

      {players.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {players.map((p) => (
            <Chip key={p.id} label={p.nickname} selected={p.id === profile.id} onPress={() => selectPlayer(p.id)} />
          ))}
        </ScrollView>
      )}

      {/* ───────── Wo du stehst ───────── */}
      <View style={{ gap: 6 }}>
        <H size={44} numberOfLines={1}>
          Hi, {profile.nickname}
        </H>
        {rating && tier && (
          <Row style={{ gap: 8, flexWrap: 'wrap' }}>
            <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: TIER_STYLE[tier.id].chip }}>
              <Text style={{ fontFamily: Font.label, fontSize: 12, letterSpacing: 1, color: TIER_STYLE[tier.id].chipText }}>
                {tier.label.toUpperCase()} · {rating.overall}
              </Text>
            </View>
            <T size={13} color="textSecondary">
              {nt ? `noch ${nt.missing} bis ${nt.tier.label}` : 'höchste Stufe'} · Level {lvl.level} {lvl.title}
            </T>
          </Row>
        )}
      </View>

      {toConfirm.length > 0 && (
        <Card style={{ borderColor: theme.primary }} onPress={() => router.push('/tagebuch')}>
          <Label color="primary">Vom Trainer eingetragen</Label>
          <T weight="700">{toConfirm.length === 1 ? '1 Ergebnis' : `${toConfirm.length} Ergebnisse`} warten auf deine Bestätigung</T>
        </Card>
      )}

      <Columns
        left={
          <>
            <Anchors card={card} teamRank={ranks.find((r) => r.scope === 'team') ?? null} streak={s} bestStreak={longestStreak(activeDays(state))} />
            <MatchCenterCard data={matches} teamName={team?.teamName ?? matches?.team ?? 'Dein Team'} />
            {team ? (
              <RankOverviewCard rows={ranks} />
            ) : (
              <Card onPress={() => router.navigate('/team')} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, borderColor: theme.primary }}>
                <Icon.Shield color={theme.primary} />
                <View style={{ flex: 1 }}>
                  <T weight="700">Tritt deinem Team bei</T>
                  <T size={13} color="textSecondary">
                    Mit dem Code deines Trainers siehst du Spiele, Kader und Ranglisten.
                  </T>
                </View>
                <Icon.Chevron color={theme.textSecondary} />
              </Card>
            )}
          </>
        }
        right={
          <>
            <TeamWeekCard data={teamWeek} />
            <NewsPreview items={news} />
          </>
        }
      />

      {/* ───────── So wirst du besser ───────── */}
      <SectionHeading kicker="Dein Weg nach oben" title="So wirst du besser" />
      <Columns
        left={
          <>
            <TrainingStatusCard state={state} mission={{ id: mission.id, title: mission.title, level: missionLevel, target: missionTarget }} />
            <RatingsCard data={ratings} go4proId={rating?.go4proId ?? null} />
          </>
        }
        right={
          <>
            <StatsCard state={state} history={history} />
            <Pressable onPress={() => router.push('/challenges')} accessibilityRole="button">
              <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
                <H size={24}>Challenges der Woche</H>
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
            <TeamFeed items={feed} />
            {ad && <AdCard ad={ad} />}
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
          </>
        }
      />
    </Screen>
  );
}
