import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icons';
import { Stars } from '@/components/stars';
import { Button, Card, Label, Row, T } from '@/components/ui';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ROLE, stars, timeAgo, usePoints, useRatingInbox, useReceivedRatings } from '@/lib/ratings';

/** Herzstück der Startseite: offene Bewertungen, wer mich zuletzt wie bewertet hat (live), Punkte */
export function RatingHero({ playerId }: { playerId: string }) {
  const theme = useTheme();
  const rec = useReceivedRatings(playerId);
  const inbox = useRatingInbox(playerId);
  const { info } = usePoints(playerId, rec.tick + inbox.open);
  const s = rec.summary;
  const latest = rec.items.slice(0, 3);

  return (
    <Card style={{ gap: 14, borderColor: theme.gold, borderWidth: 1 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row style={{ gap: 8 }}>
          <Label color="gold">Bewertungen</Label>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: theme.success }} />
          <T size={11} weight="700" color="textSecondary">
            LIVE
          </T>
        </Row>
        <Pressable accessibilityRole="button" onPress={() => router.push('/punkte')} hitSlop={6} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(245,200,75,0.14)' }}>
          <Text style={{ color: theme.gold, fontFamily: Font.black, fontSize: 13 }}>{info?.balance ?? 0} Punkte ›</Text>
        </Pressable>
      </Row>

      <Pressable accessibilityRole="button" onPress={() => router.push('/bewertungen')} style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Text style={{ color: theme.gold, fontFamily: Font.number, fontSize: 58, lineHeight: 62 }}>{stars(s?.avg)}</Text>
        <View style={{ flex: 1, gap: 4 }}>
          <Stars value={s?.avg} size={18} />
          <T size={13} color="textSecondary">
            {s?.count ? `${s.count} Bewertungen · ${s.week} diese Woche` : 'Noch keine Bewertungen – nach dem nächsten Training geht’s los.'}
          </T>
        </View>
        <Icon.Chevron color={theme.textSecondary} />
      </Pressable>

      {latest.length > 0 && (
        <View style={{ gap: 8 }}>
          {latest.map((it) => (
            <Pressable key={it.id} accessibilityRole="button" onPress={() => router.push('/bewertungen')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Avatar uri={it.rater_avatar} name={it.rater ?? ROLE[it.role]} size={34} ring={it.role === 'trainer' ? theme.primary : undefined} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T size={14} weight="700" numberOfLines={1}>
                  {it.rater ?? ROLE[it.role]}
                </T>
                <T size={11} color="textSecondary" numberOfLines={1}>
                  {ROLE[it.role]} · {it.encounter.title} · {timeAgo(it.at)}
                </T>
              </View>
              <Text style={{ color: theme.gold, fontFamily: Font.number, fontSize: 20 }}>{stars(it.avg)}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {inbox.open > 0 ? (
        <Button title={`${inbox.open} offene Bewertungen · +${Math.min(inbox.open, 30) * 10} Punkte`} onPress={() => router.push('/bewerten')} />
      ) : (
        <Button title="Bewerten" variant="secondary" onPress={() => router.push('/bewerten')} />
      )}
    </Card>
  );
}
