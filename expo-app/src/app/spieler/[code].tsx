import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { PlayerCard } from '@/components/player-card';
import { Button, Card, H, Label, Logo, Row, Screen, T } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Scan = any;

/** Öffnet sich beim Scannen des QR-Codes – auch ohne Anmeldung. Zeigt nur, was die Eltern freigegeben haben. */
export default function SpielerScan() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { session } = useAuth();
  const theme = useTheme();
  const [data, setData] = useState<Scan | null>(null);

  useEffect(() => {
    supabase.rpc('scan_player', { p_code: code }).then(({ data: d }) => setData(d ?? { found: false }));
  }, [code, session]);

  return (
    <Screen topInset>
      <Row style={{ gap: 10 }}>
        <Logo size={36} />
        <H size={28}>
          Go<H size={28} color="primary">4</H>Pro
        </H>
      </Row>

      {!data ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
      ) : !data.found ? (
        <Card>
          <H size={26}>Unbekannte ID</H>
          <T color="textSecondary">Zu „{code}“ gibt es keine Spielerkarte. Prüfe die Go4Pro-ID (Format G4P-XXXXXX).</T>
        </Card>
      ) : data.private ? (
        <Card style={{ gap: 10 }}>
          <Label>{data.go4pro_id}</Label>
          <H size={30}>Privates Profil</H>
          <T color="textSecondary">
            Diese Spielerin bzw. dieser Spieler ({data.age_group}-Jugend) ist bei Go4Pro, aber die Karte ist nicht öffentlich. Eltern
            können die Veröffentlichung in der App unter „Ich → Einstellungen“ erlauben.
          </T>
        </Card>
      ) : (
        <View style={{ gap: 16 }}>
          <PlayerCard
            showQr
            data={{
              nickname: data.nickname,
              position: data.position,
              club: data.club,
              team: data.team,
              jersey: data.jersey,
              overall: data.overall,
              tier: data.tier,
              attributes: data.attributes ?? {},
              go4proId: data.go4pro_id,
            }}
          />
          {!!data.league && (
            <T size={13} color="textSecondary">
              {data.league}
            </T>
          )}
          <T size={12} color="textSecondary">
            Die Gesamtwertung (35–79) berechnet Go4Pro aus Übungen, Aktivität, Bewertungen und Spielen – passend zur Altersklasse.
            Nur vom Trainer bestätigte Leistungen zählen voll.
          </T>
        </View>
      )}

      {!session && (
        <Card style={{ gap: 10 }}>
          <T weight="700">Neu bei Go4Pro?</T>
          <T size={14} color="textSecondary">
            Trainieren, Fortschritt festhalten und vom Trainer bestätigen lassen – für die E- bis A-Jugend.
          </T>
          <Button title="Kostenlos starten" onPress={() => router.replace('/login')} />
        </Card>
      )}
    </Screen>
  );
}
