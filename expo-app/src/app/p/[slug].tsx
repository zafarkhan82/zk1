import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { TIER_STYLE } from '@/components/player-card';
import { Stars } from '@/components/stars';
import { Button, Card, H, Label, Logo, Row, Screen, T, Wrap } from '@/components/ui';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tierFor } from '@/lib/rating';
import { stars } from '@/lib/ratings';
import { supabase } from '@/lib/supabase';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Öffentliche Landingpage einer Spielerin/eines Spielers oder einer Trainerin/eines Trainers */
export default function PublicPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const theme = useTheme();
  const [d, setD] = useState<any>(null);
  useEffect(() => {
    supabase.rpc('landing_public', { p_slug: String(slug ?? '') }).then(({ data }) => setD(data ?? { found: false }));
  }, [slug]);

  if (!d) return <ActivityIndicator color={theme.primary} style={{ marginTop: 80 }} />;
  if (!d.found)
    return (
      <Screen>
        <H size={32}>Seite nicht gefunden</H>
        <T color="textSecondary">Diese Seite gibt es nicht oder sie ist nicht öffentlich.</T>
        <Button title="Zu Go4Pro" onPress={() => router.replace('/')} />
      </Screen>
    );

  const tier = d.overall != null ? tierFor(Number(d.overall)) : null;
  const ts = tier ? TIER_STYLE[tier.id] : null;

  return (
    <Screen>
      <Row style={{ gap: 8 }}>
        <Logo size={28} />
        <Text style={{ color: theme.text, fontFamily: Font.display, fontSize: 22 }}>
          GO<Text style={{ color: theme.primary }}>4</Text>PRO
        </Text>
      </Row>
      <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 28, borderColor: ts?.edge ?? theme.primary, borderWidth: 1.5 }}>
        <Avatar uri={d.avatar} name={d.name} size={120} ring={ts?.edge ?? theme.primary} />
        <H size={40} style={{ textAlign: 'center' }}>
          {d.name}
        </H>
        <Label color="primary">{d.kind === 'trainer' ? 'Trainer*in' : [d.position, d.club].filter(Boolean).join(' · ')}</Label>
        {!!d.headline && (
          <T size={17} weight="700" style={{ textAlign: 'center' }}>
            {d.headline}
          </T>
        )}
        {d.kind === 'spieler' && d.overall != null && (
          <Row style={{ gap: 18, marginTop: 6 }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: ts?.edge ?? theme.gold, fontFamily: Font.number, fontSize: 54 }}>{d.overall}</Text>
              <T size={11} color="textSecondary">
                GESAMT · {tier?.label}
              </T>
            </View>
            {d.ratings?.count > 0 && (
              <View style={{ alignItems: 'center', gap: 4 }}>
                <Text style={{ color: theme.gold, fontFamily: Font.number, fontSize: 40 }}>{stars(Number(d.ratings.avg))}</Text>
                <Stars value={Number(d.ratings.avg)} size={12} />
                <T size={11} color="textSecondary">
                  {d.ratings.count} Bewertungen
                </T>
              </View>
            )}
          </Row>
        )}
        {d.go4pro_id && (
          <T size={11} color="textSecondary">
            {d.go4pro_id}
          </T>
        )}
      </Card>

      {d.kind === 'spieler' && d.attributes && (
        <Card style={{ gap: 8 }}>
          <Label>Werte</Label>
          <Wrap>
            {Object.entries(d.attributes as Record<string, number>).map(([k, v]) => (
              <View key={k} style={{ width: 92, padding: 10, borderRadius: 12, backgroundColor: theme.backgroundSelected, alignItems: 'center' }}>
                <Text style={{ color: theme.text, fontFamily: Font.number, fontSize: 26 }}>{v}</Text>
                <T size={11} color="textSecondary">
                  {k.toUpperCase()}
                </T>
              </View>
            ))}
          </Wrap>
        </Card>
      )}
      {d.kind === 'trainer' && (d.teams?.length > 0 || d.clubs?.length > 0) && (
        <Card style={{ gap: 6 }}>
          <Label>Teams</Label>
          {(d.teams?.length ? d.teams : d.clubs).map((t: string) => (
            <T key={t}>{t}</T>
          ))}
        </Card>
      )}
      {!!d.bio && (
        <Card style={{ gap: 6 }}>
          <Label>Über mich</Label>
          <T>{d.bio}</T>
        </Card>
      )}
      {!!d.highlights && (
        <Card style={{ gap: 6 }}>
          <Label>Erfolge & Highlights</Label>
          <T>{d.highlights}</T>
        </Card>
      )}
      {!!d.video && <Button title="▶ Video ansehen" variant="secondary" onPress={() => Linking.openURL(d.video)} />}
      <T size={11} color="textSecondary" style={{ textAlign: 'center' }}>
        Werte und Bewertungen aus Go4Pro – der Fußball-App für E- bis A-Jugend.
      </T>
    </Screen>
  );
}
