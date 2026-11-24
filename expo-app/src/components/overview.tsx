import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, Share, Text, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { Icon } from '@/components/icons';
import { MiniCard, TIER_STYLE, type CardData } from '@/components/player-card';
import { Button, Card, Chip, Label, Progress, Row, T } from '@/components/ui';
import { Font } from '@/constants/theme';
import { getExercise, LEVELS } from '@/data/exercises';
import { useTheme } from '@/hooks/use-theme';
import { DIARY_XP, logXp } from '@/lib/game';
import type { MatchCenter, MatchInfo, RankOverview, RatingOverview, TeamWeek } from '@/lib/home';
import { playerLink, tierFor } from '@/lib/rating';
import type { AppState, Level } from '@/lib/types';

/** Überschrift eines Startseiten-Abschnitts */
export function SectionHeading({ kicker, title }: { kicker: string; title: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 2, marginTop: 10 }}>
      <Text style={{ fontFamily: Font.label, fontSize: 12, letterSpacing: 2.5, color: theme.primary }}>{kicker.toUpperCase()}</Text>
      <Text style={{ fontFamily: Font.display, fontSize: 30, color: theme.text, textTransform: 'uppercase' }}>{title}</Text>
    </View>
  );
}

// ───────────── Die 3 Anker: Karte, Platz, Serie ─────────────

export function Anchors({
  card,
  teamRank,
  streak,
  bestStreak,
}: {
  card: CardData | null;
  teamRank: RankOverview | null;
  streak: number;
  bestStreak: number;
}) {
  const theme = useTheme();
  const tier = card ? tierFor(card.overall) : null;
  const rankDelta = teamRank ? teamRank.rankWeekAgo - teamRank.rank : 0;
  return (
    <View style={{ flexDirection: 'row', gap: 12 }} accessibilityLabel="Deine drei Anker: Karte, Platz und Serie">
      {card ? (
        <MiniCard data={card} onPress={() => router.push('/karte')} width={150} />
      ) : (
        <View style={{ width: 150, aspectRatio: 0.72, borderRadius: 20, backgroundColor: theme.backgroundSelected }} />
      )}
      <View style={{ flex: 1, gap: 12 }}>
        <AnchorTile
          label="Platz im Team"
          onPress={() => router.push({ pathname: '/rangliste', params: { scope: 'team' } })}
          value={teamRank ? `#${teamRank.rank}` : '–'}
          sub={teamRank ? `von ${teamRank.total}` : 'noch kein Team'}
          trend={teamRank ? rankDelta : null}
        />
        <AnchorTile
          label="Serie"
          onPress={() => router.push('/verlauf')}
          value={`${streak}`}
          sub={streak === 1 ? 'Tag am Stück' : 'Tage am Stück'}
          extra={bestStreak > streak ? `Rekord ${bestStreak}` : streak > 0 ? 'Rekord!' : 'Heute starten'}
          icon={<Icon.Flame size={18} color={theme.primary} />}
        />
        {tier && (
          <Text style={{ fontFamily: Font.semibold, fontSize: 12, color: theme.textSecondary }}>
            Karte: <Text style={{ color: TIER_STYLE[tier.id].chip, fontFamily: Font.black }}>{tier.label}</Text>
          </Text>
        )}
      </View>
    </View>
  );
}

function AnchorTile({
  label,
  value,
  sub,
  trend,
  extra,
  icon,
  onPress,
}: {
  label: string;
  value: string;
  sub: string;
  trend?: number | null;
  extra?: string;
  icon?: React.ReactNode;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value} ${sub}`}
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, borderRadius: 18, padding: 12, gap: 2, backgroundColor: theme.backgroundElement, opacity: pressed ? 0.85 : 1 })}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: Font.label, fontSize: 11, letterSpacing: 1.5, color: theme.textSecondary }}>{label.toUpperCase()}</Text>
        {icon}
      </Row>
      <Row style={{ alignItems: 'baseline', gap: 8 }}>
        <Text style={{ fontFamily: Font.number, fontSize: 36, lineHeight: 38, color: theme.text }}>{value}</Text>
        <Text style={{ fontFamily: Font.medium, fontSize: 12, color: theme.textSecondary }}>{sub}</Text>
      </Row>
      {trend != null ? (
        <Text style={{ fontFamily: Font.bold, fontSize: 12, color: trend > 0 ? theme.success : trend < 0 ? theme.danger : theme.textSecondary }}>
          {trend > 0 ? `▲ ${trend} seit letzter Woche` : trend < 0 ? `▼ ${-trend} seit letzter Woche` : '● wie letzte Woche'}
        </Text>
      ) : extra ? (
        <Text style={{ fontFamily: Font.bold, fontSize: 12, color: theme.primary }}>{extra}</Text>
      ) : null}
    </Pressable>
  );
}

// ───────────── Spielzentrale ─────────────

function when(iso: string) {
  const d = new Date(iso);
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  if (days === 0) return `Heute, ${time}`;
  if (days === 1) return `Morgen, ${time}`;
  if (days === -1) return `Gestern, ${time}`;
  return `${d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}, ${time}`;
}

export function MatchCenterCard({ data, teamName }: { data: MatchCenter | null; teamName: string }) {
  const theme = useTheme();
  if (!data || (!data.last && !data.next)) return null;
  return (
    <Card style={{ gap: 14 }} onPress={() => router.push('/team')}>
      <Label>Deine Spiele</Label>
      {data.last && <LastMatch m={data.last} teamName={teamName} />}
      {data.last && data.next && <View style={{ height: 1, backgroundColor: theme.border }} />}
      {data.next && <NextMatch m={data.next} teamName={teamName} />}
    </Card>
  );
}

function LastMatch({ m, teamName }: { m: MatchInfo; teamName: string }) {
  const theme = useTheme();
  const hasResult = m.goalsFor != null && m.goalsAgainst != null;
  const res = !hasResult ? null : m.goalsFor! > m.goalsAgainst! ? 'S' : m.goalsFor! < m.goalsAgainst! ? 'N' : 'U';
  const color = res === 'S' ? theme.success : res === 'N' ? theme.danger : theme.textSecondary;
  const home = m.isHome ? teamName : m.opponent;
  const away = m.isHome ? m.opponent : teamName;
  const hg = m.isHome ? m.goalsFor : m.goalsAgainst;
  const ag = m.isHome ? m.goalsAgainst : m.goalsFor;
  return (
    <View style={{ gap: 10 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T size={12} weight="700" color="textSecondary">
          LETZTES SPIEL · {when(m.kickoff)}
        </T>
        {res && (
          <View style={{ borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: color }}>
            <Text style={{ fontFamily: Font.black, fontSize: 11, color: '#fff' }}>{res === 'S' ? 'SIEG' : res === 'N' ? 'NIEDERLAGE' : 'UNENTSCHIEDEN'}</Text>
          </View>
        )}
      </Row>
      <Row style={{ justifyContent: 'space-between', gap: 10 }}>
        <T weight="700" numberOfLines={2} style={{ flex: 1 }}>
          {home}
        </T>
        <Text style={{ fontFamily: Font.number, fontSize: 34, color: theme.text }}>{hasResult ? `${hg} : ${ag}` : '– : –'}</Text>
        <T weight="700" numberOfLines={2} style={{ flex: 1, textAlign: 'right' }}>
          {away}
        </T>
      </Row>
      {m.me ? (
        <Row style={{ gap: 8 }}>
          <StatPill label="Minuten" value={m.me.minutes} />
          <StatPill label="Tore" value={m.me.goals} />
          <StatPill label="Vorlagen" value={m.me.assists} />
          <StatPill label={m.me.started ? 'Startelf' : 'Eingewechselt'} value={null} />
        </Row>
      ) : (
        <T size={12} color="textSecondary">
          Dein Einsatz ist noch nicht eingetragen – dein Trainer kann das im Trainer-Bereich nachholen.
        </T>
      )}
    </View>
  );
}

function NextMatch({ m, teamName }: { m: MatchInfo; teamName: string }) {
  const theme = useTheme();
  const days = Math.max(0, Math.ceil((new Date(m.kickoff).getTime() - Date.now()) / 86400000));
  return (
    <View style={{ gap: 6 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T size={12} weight="700" color="primary">
          NÄCHSTES SPIEL
        </T>
        <T size={12} weight="700" color="primary">
          {days === 0 ? 'HEUTE' : days === 1 ? 'MORGEN' : `IN ${days} TAGEN`}
        </T>
      </Row>
      <T weight="700">{m.isHome ? `${teamName} – ${m.opponent}` : `${m.opponent} – ${teamName}`}</T>
      <T size={13} color="textSecondary">
        {when(m.kickoff)} · {m.isHome ? 'Heimspiel' : 'Auswärts'}
        {m.venue ? ` · ${m.venue}` : ''}
      </T>
      {!!m.competition && (
        <Text numberOfLines={1} style={{ fontFamily: Font.medium, fontSize: 12, color: theme.textSecondary }}>
          {m.competition}
        </Text>
      )}
    </View>
  );
}

function StatPill({ label, value }: { label: string; value: number | null }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, borderRadius: 12, paddingVertical: 6, alignItems: 'center', backgroundColor: theme.backgroundSelected }}>
      {value != null && <Text style={{ fontFamily: Font.number, fontSize: 20, color: theme.text }}>{value}</Text>}
      <Text style={{ fontFamily: Font.semibold, fontSize: 10, color: theme.textSecondary, paddingVertical: value == null ? 7 : 0 }}>{label}</Text>
    </View>
  );
}

// ───────────── Woche im Team ─────────────

export function TeamWeekCard({ data }: { data: TeamWeek | null }) {
  const theme = useTheme();
  if (!data || (!data.climber && !data.busiest && !data.best)) return null;
  const items = [
    { key: 'climber', label: 'Aufsteiger*in', hero: data.climber, fmt: (v: number) => `▲ ${v} Rating`, color: theme.success },
    { key: 'busiest', label: 'Fleißigste*r', hero: data.busiest, fmt: (v: number) => `${v} Übungen`, color: theme.primary },
    { key: 'best', label: 'Punktbeste*r', hero: data.best, fmt: (v: number) => `${v} Punkte`, color: theme.gold },
  ];
  return (
    <Card style={{ gap: 10 }}>
      <Label>Woche im Team</Label>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {items.map((it) => (
          <View key={it.key} style={{ flex: 1, borderRadius: 14, padding: 10, gap: 4, backgroundColor: it.hero?.mine ? theme.primarySoft : theme.backgroundSelected }}>
            <Text style={{ fontFamily: Font.label, fontSize: 10, letterSpacing: 1.2, color: theme.textSecondary }}>{it.label.toUpperCase()}</Text>
            <Text numberOfLines={1} style={{ fontFamily: Font.bold, fontSize: 14, color: it.hero?.mine ? theme.primary : theme.text }}>
              {it.hero ? (it.hero.mine ? 'Du!' : it.hero.nickname) : '–'}
            </Text>
            <Text style={{ fontFamily: Font.bold, fontSize: 12, color: it.color }}>{it.hero ? it.fmt(it.hero.value) : ''}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

// ───────────── Eigenes Training ─────────────

export function TrainingStatusCard({
  state,
  mission,
}: {
  state: AppState;
  mission: { id: string; title: string; level: Level; target: string };
}) {
  const theme = useTheme();
  const since = Date.now() - 30 * 86400000;
  const recent = state.logs.filter((l) => new Date(l.date).getTime() > since);
  const confirmed = recent.filter((l) => l.status === 'confirmed').length;
  const waitTrainer = state.logs.filter((l) => l.status === 'pending' && l.requested).length;
  const waitMe = state.logs.filter((l) => l.status === 'pending' && !l.playerConfirmed).length;
  const lvl = LEVELS.find((l) => l.id === mission.level)!;
  return (
    <Card style={{ gap: 12 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Label>Eigenes Training · 30 Tage</Label>
        <Pressable onPress={() => router.navigate('/training')} hitSlop={10}>
          <Text style={{ color: theme.primary, fontFamily: Font.bold, fontSize: 13 }}>Alle Übungen</Text>
        </Pressable>
      </Row>
      <Row style={{ gap: 8 }}>
        <Kpi value={confirmed} label="vom Trainer bestätigt" color={theme.success} />
        <Kpi value={waitTrainer} label="warten auf Trainer" color={theme.gold} />
        <Kpi value={waitMe} label="warten auf dich" color={waitMe ? theme.primary : theme.textSecondary} onPress={waitMe ? () => router.push('/tagebuch') : undefined} />
      </Row>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/uebung/[id]', params: { id: mission.id } })}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 12,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: theme.border,
          opacity: pressed ? 0.85 : 1,
        })}>
        <Icon.Ball size={22} color={theme.primary} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: Font.label, fontSize: 10, letterSpacing: 1.5, color: theme.textSecondary }}>VORSCHLAG HEUTE · {lvl.label.toUpperCase()}</Text>
          <Text numberOfLines={1} style={{ fontFamily: Font.bold, fontSize: 15, color: theme.text }}>
            {mission.title}
          </Text>
          <Text numberOfLines={1} style={{ fontFamily: Font.medium, fontSize: 12, color: theme.textSecondary }}>
            {mission.target}
          </Text>
        </View>
        <Icon.Chevron color={theme.primary} />
      </Pressable>
      <T size={12} color="textSecondary">
        Bestätigte Übungen zählen voll für Wertung und Ranglisten. Silber und Gold gibt dein Trainer frei.
      </T>
    </Card>
  );
}

function Kpi({ value, label, color, onPress }: { value: number; label: string; color: string; onPress?: () => void }) {
  const theme = useTheme();
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={{ flex: 1, borderRadius: 14, padding: 10, backgroundColor: theme.backgroundSelected, gap: 2 }}>
      <Text style={{ fontFamily: Font.number, fontSize: 28, color }}>{value}</Text>
      <Text style={{ fontFamily: Font.semibold, fontSize: 11, color: theme.textSecondary }}>{label}</Text>
    </Pressable>
  );
}

// ───────────── Bewertungen ─────────────

const DIMS: { key: 'technik' | 'taktik' | 'athletik' | 'einsatz' | 'fairplay'; label: string }[] = [
  { key: 'technik', label: 'Technik' },
  { key: 'taktik', label: 'Taktik' },
  { key: 'athletik', label: 'Athletik' },
  { key: 'einsatz', label: 'Einsatz' },
  { key: 'fairplay', label: 'Fairplay' },
];
const CONTEXT: Record<string, string> = { training: 'Training', spiel: 'Spiel', turnier: 'Turnier', sichtung: 'Sichtung' };

export function RatingsCard({ data, go4proId }: { data: RatingOverview | null; go4proId: string | null }) {
  const theme = useTheme();
  const ask = async () => {
    if (!go4proId) return;
    const link = playerLink(go4proId);
    const text = `Bewerte mich bei Go4Pro (${go4proId}): ${link}`;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nav = navigator as any;
      if (nav.share) await nav.share({ title: 'Go4Pro', text, url: link }).catch(() => {});
      else await nav.clipboard?.writeText(link);
      return;
    }
    await Share.share({ message: text });
  };
  const tr = data?.trainer;
  const peer = data?.peer;
  const last = data?.recent?.find((r) => r.comment);
  return (
    <Card style={{ gap: 12 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Label>Bewertungen · 6 Monate</Label>
        <T size={12} color="textSecondary">
          {tr?.count ?? 0} Trainer · {peer?.count ?? 0} Spieler
        </T>
      </Row>
      {tr && tr.count > 0 ? (
        <View style={{ gap: 8 }}>
          {DIMS.map((d) => {
            const v = tr[d.key];
            return (
              <Row key={d.key} style={{ gap: 10 }}>
                <T size={13} weight="600" style={{ width: 70 }}>
                  {d.label}
                </T>
                <View style={{ flex: 1 }}>
                  <Progress value={v ? (v - 1) / 4 : 0} height={8} color={theme.primary} />
                </View>
                <T size={13} weight="700" style={{ width: 30, textAlign: 'right' }}>
                  {v != null ? String(v).replace('.', ',') : '–'}
                </T>
              </Row>
            );
          })}
          <T size={12} color="textSecondary">
            {tr.own} von deinen Trainer*innen · {tr.foreign} von fremden Trainer*innen (Skala 1–5)
          </T>
        </View>
      ) : (
        <T size={14} color="textSecondary">
          Noch keine Trainer-Bewertung. Zeig deinen QR-Code nach dem Training oder Spiel – auch Trainer*innen anderer Vereine können
          dich bewerten.
        </T>
      )}

      {peer && peer.count >= 3 && peer.technik != null ? (
        <View style={{ borderRadius: 14, padding: 12, backgroundColor: theme.backgroundSelected, gap: 4 }}>
          <Text style={{ fontFamily: Font.label, fontSize: 11, letterSpacing: 1.5, color: theme.textSecondary }}>
            VON MITSPIELER*INNEN & GEGNER*INNEN ({peer.count})
          </Text>
          <Row style={{ justifyContent: 'space-between' }}>
            <Stars label="Technik" v={peer.technik} />
            <Stars label="Einsatz" v={peer.einsatz ?? 0} />
            <Stars label="Fairplay" v={peer.fairplay ?? 0} />
          </Row>
        </View>
      ) : (
        <T size={12} color="textSecondary">
          Bewertungen von Mitspieler*innen erscheinen ab 3 Stimmen – anonym als Durchschnitt.
        </T>
      )}

      {last && (
        <View style={{ borderLeftWidth: 3, borderLeftColor: theme.primary, paddingLeft: 10, gap: 2 }}>
          <T size={14}>„{last.comment}“</T>
          <T size={12} color="textSecondary">
            {last.relation === 'fremder' ? 'Fremde*r Trainer*in' : 'Dein*e Trainer*in'}
            {last.club ? ` · ${last.club}` : ''} · {CONTEXT[last.context] ?? last.context} · {new Date(last.at).toLocaleDateString('de-DE')}
          </T>
        </View>
      )}
      <Button title="Bewertung anfragen" variant="secondary" onPress={ask} disabled={!go4proId} />
    </Card>
  );
}

function Stars({ label, v }: { label: string; v: number }) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <Text style={{ fontSize: 14, color: theme.gold }}>{'★'.repeat(Math.round(v))}{'☆'.repeat(5 - Math.round(v))}</Text>
      <Text style={{ fontFamily: Font.semibold, fontSize: 11, color: theme.textSecondary }}>
        {label} {String(v).replace('.', ',')}
      </Text>
    </View>
  );
}

// ───────────── Statistiken: Tage, Wochen, Monate ─────────────

type Range = 'tage' | 'wochen' | 'monate';

export function StatsCard({ state, history }: { state: AppState; history: { at: string; overall: number }[] | null }) {
  const theme = useTheme();
  const [range, setRange] = useState<Range>('wochen');

  const buckets = useMemo(() => {
    const now = new Date();
    const list: { label: string; start: number; end: number }[] = [];
    if (range === 'tage') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - i);
        const e = new Date(d);
        e.setDate(e.getDate() + 1);
        list.push({ label: d.toLocaleDateString('de-DE', { weekday: 'short' }).slice(0, 2), start: d.getTime(), end: e.getTime() });
      }
    } else if (range === 'wochen') {
      for (let i = 7; i >= 0; i--) {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - i * 7);
        const e = new Date(d);
        e.setDate(e.getDate() + 7);
        list.push({ label: `${d.getDate()}.${d.getMonth() + 1}.`, start: d.getTime(), end: e.getTime() });
      }
    } else {
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const e = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        list.push({ label: d.toLocaleDateString('de-DE', { month: 'short' }).replace('.', ''), start: d.getTime(), end: e.getTime() });
      }
    }
    return list.map((b) => {
      const logs = state.logs.filter((l) => {
        const t = new Date(l.date).getTime();
        return t >= b.start && t < b.end;
      });
      const diary = state.diary.filter((d) => {
        const t = new Date(d.date).getTime();
        return t >= b.start && t < b.end;
      });
      return {
        ...b,
        xp: logs.reduce((s, l) => s + logXp(l), 0) + diary.length * DIARY_XP,
        entries: logs.length,
        confirmed: logs.filter((l) => l.status === 'confirmed').length,
        minutes: diary.reduce((s, d) => s + d.minutes, 0),
      };
    });
  }, [state.logs, state.diary, range]);

  const total = (k: 'xp' | 'entries' | 'confirmed' | 'minutes') => buckets.reduce((s, b) => s + b[k], 0);
  const max = Math.max(1, ...buckets.map((b) => b.xp));
  const half = Math.floor(buckets.length / 2);
  const prev = buckets.slice(0, half).reduce((s, b) => s + b.xp, 0);
  const curr = buckets.slice(half).reduce((s, b) => s + b.xp, 0);
  const trend = prev === 0 ? null : Math.round(((curr - prev) / prev) * 100);
  const cats = useMemo(() => {
    const start = buckets[0].start;
    const map = new Map<string, number>();
    state.logs
      .filter((l) => new Date(l.date).getTime() >= start)
      .forEach((l) => {
        const c = getExercise(l.exerciseId)?.category;
        if (c) map.set(c, (map.get(c) ?? 0) + 1);
      });
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [state.logs, buckets]);

  return (
    <Card style={{ gap: 12 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Label>Statistik</Label>
        <Pressable onPress={() => router.push('/verlauf')} hitSlop={10}>
          <Text style={{ color: theme.primary, fontFamily: Font.bold, fontSize: 13 }}>Verlauf</Text>
        </Pressable>
      </Row>
      <Row style={{ gap: 6 }}>
        <Chip label="7 Tage" selected={range === 'tage'} onPress={() => setRange('tage')} />
        <Chip label="8 Wochen" selected={range === 'wochen'} onPress={() => setRange('wochen')} />
        <Chip label="6 Monate" selected={range === 'monate'} onPress={() => setRange('monate')} />
      </Row>
      <Row style={{ gap: 8 }}>
        <MiniKpi value={total('xp')} label="Punkte" />
        <MiniKpi value={total('entries')} label="Übungen" />
        <MiniKpi value={total('confirmed')} label="bestätigt" />
        <MiniKpi value={total('minutes')} label="Minuten" />
      </Row>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 100, gap: 6 }}>
        {buckets.map((b, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }} accessibilityLabel={`${b.label}: ${b.xp} Punkte`}>
            <View
              style={{
                width: '100%',
                height: Math.max(4, (b.xp / max) * 76),
                borderRadius: 6,
                backgroundColor: i === buckets.length - 1 ? theme.primary : b.xp ? theme.primarySoft : theme.backgroundSelected,
              }}
            />
            <Text style={{ fontFamily: Font.label, fontSize: 10, color: theme.textSecondary }}>{b.label}</Text>
          </View>
        ))}
      </View>
      {trend != null && (
        <T size={13} weight="700" style={{ color: trend >= 0 ? theme.success : theme.danger }}>
          {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)} % Punkte gegenüber dem Zeitraum davor
        </T>
      )}
      {cats.length > 0 && (
        <T size={12} color="textSecondary">
          Am meisten geübt: {cats.map(([c, n]) => `${c.charAt(0).toUpperCase() + c.slice(1)} (${n})`).join(' · ')}
        </T>
      )}
      {history && history.length > 1 && <RatingTrend history={history} />}
    </Card>
  );
}

function MiniKpi({ value, label }: { value: number; label: string }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, borderRadius: 12, padding: 8, backgroundColor: theme.backgroundSelected }}>
      <Text style={{ fontFamily: Font.number, fontSize: 22, color: theme.text }}>{value.toLocaleString('de-DE')}</Text>
      <Text style={{ fontFamily: Font.semibold, fontSize: 10, color: theme.textSecondary }}>{label}</Text>
    </View>
  );
}

/** Verlauf der Gesamtwertung der letzten Wochen als Linie */
function RatingTrend({ history }: { history: { at: string; overall: number }[] }) {
  const theme = useTheme();
  const vals = history.map((h) => h.overall);
  const min = Math.min(...vals) - 2;
  const max = Math.max(...vals) + 2;
  const W = 300;
  const H = 70;
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * W, H - ((v - min) / (max - min)) * H] as const);
  const first = vals[0];
  const lastV = vals[vals.length - 1];
  return (
    <View style={{ gap: 6 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T size={12} weight="700" color="textSecondary">
          WERTUNG · {history.length} WOCHEN
        </T>
        <T size={12} weight="700" style={{ color: lastV >= first ? theme.success : theme.danger }}>
          {first} → {lastV}
        </T>
      </Row>
      <Svg width="100%" height={H + 8} viewBox={`-4 -4 ${W + 8} ${H + 8}`} preserveAspectRatio="none">
        <Polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={theme.primary} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={5} fill={theme.primary} />
      </Svg>
    </View>
  );
}
