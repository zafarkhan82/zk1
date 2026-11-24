import { router } from 'expo-router';
import { Image, Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icons';
import { useParentGate } from '@/components/parent-gate';
import { Card, Label, Row, T } from '@/components/ui';
import { Font } from '@/constants/theme';
import { getExercise } from '@/data/exercises';
import { useTheme } from '@/hooks/use-theme';
import { NEWS_KIND, relativeTime, type FeedItem, type HomeAd, type NewsItem, type RankOverview } from '@/lib/home';
import { SCOPES } from '@/lib/ranking';
import { supabase } from '@/lib/supabase';

const SHORT: Record<string, string> = { team: 'Team', league: 'Liga', region: 'Region', national: 'DE' };

/** Ränge auf einen Blick: Platz, Trend zur Vorwoche, Abstand zum nächsten Platz */
export function RankOverviewCard({ rows }: { rows: RankOverview[] }) {
  const theme = useTheme();
  const team = rows.find((r) => r.scope === 'team');
  const focus = team ?? rows[0];
  if (!focus) return null;
  const bronzeSteps = focus.pointsToNext ? Math.ceil(focus.pointsToNext / 25) : 0;

  return (
    <Card style={{ gap: 14 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Label>Deine Ränge · Saison</Label>
        <Pressable accessibilityRole="button" onPress={() => router.push('/rangliste')} hitSlop={10}>
          <Text style={{ color: theme.primary, fontFamily: Font.bold, fontSize: 13 }}>Alle Ranglisten</Text>
        </Pressable>
      </Row>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {SCOPES.map((s) => {
          const r = rows.find((x) => x.scope === s.id);
          const delta = r ? r.rankWeekAgo - r.rank : 0;
          return (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              accessibilityLabel={r ? `${s.label}: Platz ${r.rank} von ${r.total}` : `${s.label}: keine Wertung`}
              onPress={() => router.push({ pathname: '/rangliste', params: { scope: s.id } })}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 96,
                borderRadius: 16,
                padding: 10,
                gap: 2,
                backgroundColor: s.id === 'team' ? theme.primarySoft : theme.backgroundSelected,
                borderWidth: s.id === 'team' ? 1.5 : 0,
                borderColor: theme.primary,
                opacity: pressed ? 0.85 : 1,
              })}>
              <Text style={{ fontFamily: Font.label, fontSize: 11, letterSpacing: 1.5, color: theme.textSecondary }}>
                {SHORT[s.id].toUpperCase()}
              </Text>
              {r ? (
                <>
                  <Text adjustsFontSizeToFit numberOfLines={1} style={{ fontFamily: Font.number, fontSize: 28, color: s.id === 'team' ? theme.primary : theme.text }}>
                    #{r.rank}
                  </Text>
                  <Text style={{ fontFamily: Font.medium, fontSize: 11, color: theme.textSecondary }}>von {r.total}</Text>
                  <Text
                    style={{
                      fontFamily: Font.bold,
                      fontSize: 11,
                      color: delta > 0 ? theme.success : delta < 0 ? theme.danger : theme.textSecondary,
                    }}>
                    {delta > 0 ? `▲ ${delta}` : delta < 0 ? `▼ ${-delta}` : '● gleich'}
                  </Text>
                </>
              ) : (
                <Text style={{ fontFamily: Font.medium, fontSize: 12, color: theme.textSecondary, marginTop: 8 }}>–</Text>
              )}
            </Pressable>
          );
        })}
      </View>
      {focus.pointsToNext ? (
        <Row style={{ gap: 10 }}>
          <Icon.Trophy size={20} color={theme.gold} />
          <T size={14} style={{ flex: 1 }}>
            Noch <T size={14} weight="800" color="primary">{focus.pointsToNext.toLocaleString('de-DE')} Punkte</T> bis Platz {focus.rank - 1}
            {focus.nextName ? ` (${focus.nextName})` : ''} – das sind etwa {bronzeSteps} bestätigte Bronze-Übungen.
          </T>
        </Row>
      ) : focus.rank === 1 && focus.total > 1 ? (
        <Row style={{ gap: 10 }}>
          <Icon.Trophy size={20} color={theme.gold} />
          <T size={14} weight="700">
            Du bist die Nummer 1 im Team. Halte den Platz!
          </T>
        </Row>
      ) : null}
      {rows.some((r) => r.locked) && (
        <T size={12} color="textSecondary">
          Liga, Region und DE zeigen mit Premium die ganze Liste – deinen Platz siehst du immer.
        </T>
      )}
    </Card>
  );
}

/** Nachrichten-Vorschau auf der Startseite */
export function NewsPreview({ items }: { items: NewsItem[] }) {
  const theme = useTheme();
  if (items.length === 0) return null;
  return (
    <View style={{ gap: 10 }}>
      <Pressable accessibilityRole="button" onPress={() => router.push('/nachrichten')}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: Font.display, fontSize: 26, color: theme.text, textTransform: 'uppercase' }}>Nachrichten</Text>
          <Row style={{ gap: 4 }}>
            <Text style={{ color: theme.primary, fontFamily: Font.bold, fontSize: 13 }}>Alle</Text>
            <Icon.Chevron size={16} color={theme.primary} />
          </Row>
        </Row>
      </Pressable>
      {items.slice(0, 3).map((n) => (
        <NewsCard key={n.id} item={n} compact />
      ))}
    </View>
  );
}

export function NewsCard({ item, compact, onLink }: { item: NewsItem; compact?: boolean; onLink?: (url: string) => void }) {
  const theme = useTheme();
  const k = NEWS_KIND[item.kind] ?? NEWS_KIND.info;
  const accent = item.scope === 'team' ? theme.primary : item.scope === 'club' ? theme.gold : theme.textSecondary;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => (compact ? router.push('/nachrichten') : item.linkUrl && onLink?.(item.linkUrl))}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: 12,
        padding: 14,
        borderRadius: 18,
        backgroundColor: theme.backgroundElement,
        borderLeftWidth: 4,
        borderLeftColor: accent,
        opacity: pressed ? 0.9 : 1,
      })}>
      <Text style={{ fontSize: 24 }}>{k.emoji}</Text>
      <View style={{ flex: 1, gap: 3 }}>
        <Row style={{ justifyContent: 'space-between', gap: 8 }}>
          <Text numberOfLines={1} style={{ flex: 1, fontFamily: Font.label, fontSize: 11, letterSpacing: 1.2, color: accent }}>
            {item.author.toUpperCase()}
            {item.pinned ? ' · WICHTIG' : ''}
          </Text>
          <Text style={{ fontFamily: Font.medium, fontSize: 11, color: theme.textSecondary }}>{relativeTime(item.publishedAt)}</Text>
        </Row>
        <Text style={{ fontFamily: Font.bold, fontSize: 16, color: theme.text }}>{item.title}</Text>
        {!!item.body && (
          <Text numberOfLines={compact ? 2 : undefined} style={{ fontFamily: Font.body, fontSize: 14, lineHeight: 20, color: theme.textSecondary }}>
            {item.body}
          </Text>
        )}
        {!compact && !!item.linkUrl && (
          <Text style={{ fontFamily: Font.bold, fontSize: 13, color: theme.primary, marginTop: 4 }}>Link öffnen (mit Eltern) →</Text>
        )}
      </View>
    </Pressable>
  );
}

/** Kindgerechte Anzeige: klar gekennzeichnet, Klick nur über die Eltern-Abfrage */
export function AdCard({ ad }: { ad: HomeAd }) {
  const theme = useTheme();
  const { open, gate } = useParentGate();
  return (
    <View
      accessibilityLabel={`Anzeige von ${ad.sponsor}: ${ad.title}`}
      style={{ borderRadius: 18, borderWidth: 1, borderColor: theme.border, padding: 14, gap: 8 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: theme.backgroundSelected }}>
          <Text style={{ fontFamily: Font.label, fontSize: 10, letterSpacing: 1.5, color: theme.textSecondary }}>
            {ad.isClubSponsor ? 'ANZEIGE · VEREINSPARTNER' : 'ANZEIGE'}
          </Text>
        </View>
        <Text style={{ fontFamily: Font.medium, fontSize: 12, color: theme.textSecondary }}>{ad.sponsor}</Text>
      </Row>
      <Row style={{ gap: 12, alignItems: 'flex-start' }}>
        {!!ad.imageUrl && <Image source={{ uri: ad.imageUrl }} style={{ width: 64, height: 64, borderRadius: 12 }} accessibilityIgnoresInvertColors />}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: Font.bold, fontSize: 16, color: theme.text }}>{ad.title}</Text>
          {!!ad.body && <Text style={{ fontFamily: Font.body, fontSize: 13, lineHeight: 18, color: theme.textSecondary }}>{ad.body}</Text>}
        </View>
      </Row>
      {!!ad.linkUrl && (
        <Pressable
          accessibilityRole="button"
          onPress={() => open(ad.linkUrl!, () => supabase.rpc('ad_click', { p_ad: ad.id }))}
          style={({ pressed }) => ({ alignSelf: 'flex-start', opacity: pressed ? 0.8 : 1 })}>
          <Text style={{ fontFamily: Font.bold, fontSize: 13, color: theme.primary }}>{ad.ctaLabel} (mit Eltern) →</Text>
        </Pressable>
      )}
      {gate}
    </View>
  );
}

/** Erfolge der Teamkolleg*innen (nur Team-intern) */
export function TeamFeed({ items }: { items: FeedItem[] }) {
  const theme = useTheme();
  if (items.length === 0) return null;
  const color = (l: string) => (l === 'gold' ? theme.gold : l === 'silber' ? theme.silber : theme.bronze);
  return (
    <Card style={{ gap: 4 }}>
      <Label>Im Team ist was los</Label>
      {items.slice(0, 5).map((f, i) => {
        const ex = getExercise(f.exerciseId);
        return (
          <Row key={`${f.playerId}-${i}`} style={{ gap: 12, paddingVertical: 7, borderTopWidth: i ? 1 : 0, borderTopColor: theme.border }}>
            <View style={{ width: 10, height: 10, borderRadius: 3, transform: [{ rotate: '45deg' }], backgroundColor: color(f.level) }} />
            <Text style={{ flex: 1, fontFamily: Font.medium, fontSize: 14, color: theme.text }}>
              <Text style={{ fontFamily: Font.bold, color: f.isMine ? theme.primary : theme.text }}>{f.isMine ? 'Du' : f.nickname}</Text>
              {' '}
              {f.isMine ? 'hast' : 'hat'} {f.level === 'gold' ? 'Gold' : f.level === 'silber' ? 'Silber' : 'Bronze'} in „{ex?.title ?? f.exerciseId}“ geschafft
            </Text>
            <Text style={{ fontFamily: Font.medium, fontSize: 11, color: theme.textSecondary }}>{relativeTime(f.at)}</Text>
          </Row>
        );
      })}
    </Card>
  );
}
