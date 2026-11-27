import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Stars } from '@/components/stars';
import { Button, Card, Chip, EmptyState, H, Label, Num, Progress, Row, Screen, T, Wrap } from '@/components/ui';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  CATEGORY,
  CATEGORY_ORDER,
  KIND,
  ROLE,
  stars,
  timeAgo,
  useGivenRatings,
  useReceivedRatings,
  type ReceivedItem,
} from '@/lib/ratings';
import { useStore } from '@/lib/store';
import { errorText, supabase } from '@/lib/supabase';

/** Meine Bewertungen: wer mich wie bewertet hat (live) – und was ich selbst vergeben habe */
export default function Bewertungen() {
  const { spieler } = useLocalSearchParams<{ spieler?: string }>();
  const { state } = useStore();
  const theme = useTheme();
  const playerId = spieler ?? state.profile?.id;
  const [tab, setTab] = useState<'erhalten' | 'vergeben'>('erhalten');
  const [flash, setFlash] = useState(false);
  const rec = useReceivedRatings(playerId, () => setFlash(true));
  const given = useGivenRatings(spieler ? null : (state.profile?.id ?? null), rec.tick);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(false), 3000);
    return () => clearTimeout(t);
  }, [flash]);

  const s = rec.summary;

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <H size={40}>Bewertungen</H>
        <Row style={{ gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.success }} />
          <T size={12} weight="700" color="textSecondary">
            LIVE
          </T>
        </Row>
      </Row>
      {flash && (
        <Card style={{ borderColor: theme.gold, borderWidth: 1.5 }}>
          <T weight="800">⭐ Neue Bewertung eingegangen!</T>
        </Card>
      )}

      <Wrap>
        <Chip label={`Erhalten${s?.count ? ` (${s.count})` : ''}`} selected={tab === 'erhalten'} onPress={() => setTab('erhalten')} />
        {!spieler && <Chip label={`Vergeben${given.length ? ` (${given.length})` : ''}`} selected={tab === 'vergeben'} onPress={() => setTab('vergeben')} />}
      </Wrap>

      {rec.loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 30 }} />
      ) : tab === 'erhalten' ? (
        <>
          {s && s.count > 0 && <SummaryCard s={s} />}
          {rec.items.length === 0 ? (
            <EmptyState
              emoji="⭐"
              title="Noch keine Bewertungen"
              text="Nach Training, Spiel oder Turnier bewerten dich Trainer*innen, Mitspieler*innen und Gegner. Du siehst hier sofort, wer dich wie bewertet hat."
              action={<Button title="Selbst bewerten" onPress={() => router.push('/bewerten')} />}
            />
          ) : (
            rec.items.map((it) => <RatingItem key={it.id} it={it} canReport={!spieler} onReported={rec.reload} />)
          )}
        </>
      ) : given.length === 0 ? (
        <EmptyState emoji="📝" title="Noch nichts vergeben" text="Bewerte deine Mitspieler*innen – für jede Bewertung gibt es 10 Punkte." action={<Button title="Jetzt bewerten" onPress={() => router.push('/bewerten')} />} />
      ) : (
        given.map((g, i) => (
          <Card key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
            <Avatar uri={g.rated_avatar} name={g.rated} size={40} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <T weight="700" numberOfLines={1}>
                {g.rated}
              </T>
              <T size={12} color="textSecondary" numberOfLines={1}>
                {KIND[g.kind].emoji} {g.encounter} · {timeAgo(g.at)}
              </T>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Stars value={g.avg} size={12} />
              <T size={12} weight="700">
                {stars(g.avg)}
              </T>
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

function SummaryCard({ s }: { s: NonNullable<ReturnType<typeof useReceivedRatings>['summary']> }) {
  const theme = useTheme();
  return (
    <Card style={{ gap: 14 }}>
      <Row style={{ gap: 16 }}>
        <View style={{ alignItems: 'center' }}>
          <Num size={56} color="gold">
            {stars(s.avg)}
          </Num>
          <T size={11} color="textSecondary">
            von 6
          </T>
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Stars value={s.avg} size={20} />
          <T size={13} color="textSecondary">
            {s.count} Bewertungen in 180 Tagen · {s.week} diese Woche
          </T>
          <Row style={{ gap: 6, flexWrap: 'wrap' }}>
            {(['trainer', 'mitspieler', 'gegner'] as const)
              .filter((r) => s[r] != null)
              .map((r) => (
                <View key={r} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: theme.backgroundSelected }}>
                  <T size={11} weight="700">
                    {ROLE[r]} {stars(s[r])}
                  </T>
                </View>
              ))}
          </Row>
        </View>
      </Row>
      <View style={{ gap: 8 }}>
        {CATEGORY_ORDER.filter((c) => s[c] != null).map((c) => (
          <View key={c} style={{ gap: 4 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T size={13} weight="600">
                {CATEGORY[c].label}
              </T>
              <T size={13} weight="800">
                {stars(s[c])}
              </T>
            </Row>
            <Progress value={((s[c] ?? 1) - 1) / 5} color={theme.gold} height={7} />
          </View>
        ))}
      </View>
      <T size={11} color="textSecondary">
        Bewertungen zählen 30 % deiner Gesamtwertung – Trainer*innen doppelt.
      </T>
    </Card>
  );
}

function RatingItem({ it, canReport, onReported }: { it: ReceivedItem; canReport: boolean; onReported: () => void }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const report = async () => {
    const { error } = await supabase.rpc('report_rating', { p_rating: it.id });
    setMsg(error ? errorText(error) : 'Gemeldet. Die Trainer*innen schauen sich das an.');
    onReported();
  };
  return (
    <Card style={{ gap: 10, paddingVertical: 14 }} onPress={() => setOpen((o) => !o)}>
      <Row style={{ gap: 12 }}>
        <Avatar uri={it.rater_avatar} name={it.rater ?? ROLE[it.role]} size={44} ring={it.role === 'trainer' ? theme.primary : undefined} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T weight="800" numberOfLines={1}>
            {it.rater ?? ROLE[it.role]}
          </T>
          <T size={12} color="textSecondary" numberOfLines={1}>
            {ROLE[it.role]} · {KIND[it.encounter.kind].emoji} {it.encounter.title} · {timeAgo(it.at)}
          </T>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Text style={{ color: theme.gold, fontFamily: Font.number, fontSize: 24 }}>{stars(it.avg)}</Text>
          <Stars value={it.avg} size={10} />
        </View>
      </Row>
      {open && (
        <View style={{ gap: 6 }}>
          {CATEGORY_ORDER.filter((c) => it.scores[c] != null).map((c) => (
            <Row key={c} style={{ justifyContent: 'space-between' }}>
              <T size={13}>{CATEGORY[c].label}</T>
              <Stars value={it.scores[c]} size={14} />
            </Row>
          ))}
          {canReport &&
            (it.reported ? (
              <T size={12} color="textSecondary">
                Gemeldet – wird geprüft.
              </T>
            ) : (
              <Pressable accessibilityRole="button" onPress={report} hitSlop={6} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
                <T size={12} weight="700" color="textSecondary">
                  Unfair? Melden
                </T>
              </Pressable>
            ))}
          {!!msg && <T size={12}>{msg}</T>}
        </View>
      )}
      {!open && (
        <Label style={{ fontSize: 11 }}>
          Details antippen
        </Label>
      )}
    </Card>
  );
}
