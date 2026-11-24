import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { RankLine } from '@/components/rank-list';
import { Button, Card, Chip, EmptyState, H, Label, Num, Row, Screen, StripeHeader, T } from '@/components/ui';
import { useLayout } from '@/hooks/use-layout';
import { useTheme } from '@/hooks/use-theme';
import { SCOPES, useRanking, type RankPeriod, type RankScope } from '@/lib/ranking';
import { useStore } from '@/lib/store';

export default function Rangliste() {
  const params = useLocalSearchParams<{ scope?: RankScope }>();
  const { state, teams } = useStore();
  const theme = useTheme();
  const { side } = useLayout();
  const [scope, setScope] = useState<RankScope>(SCOPES.some((s) => s.id === params.scope) ? params.scope! : 'team');
  const [period, setPeriod] = useState<RankPeriod>('season');
  const { data, loading, error } = useRanking(state.profile?.id, scope, period);
  const team = teams.find((t) => t.status === 'approved');

  const empty = () => {
    if (!team && (scope === 'team' || scope === 'league'))
      return (
        <EmptyState
          emoji="🛡️"
          title="Noch kein Team"
          text="Tritt mit dem Code deines Trainers einem Team bei. Dann siehst du, wo du im Team und in deiner Spielklasse stehst."
          action={<Button title="Team beitreten" onPress={() => router.push('/team')} />}
        />
      );
    if (scope === 'league')
      return <EmptyState emoji="🏟️" title="Keine Spielklasse" text="Für dein Team ist noch keine Spielklasse hinterlegt. Dein Verein kann sie im Vereinsbereich eintragen." />;
    return <EmptyState emoji="📊" title="Noch keine Wertung" text="Sobald bestätigte Übungen da sind, erscheint hier die Rangliste." />;
  };

  return (
    <Screen
      bottomBar={false}
      topInset={false}
      header={
        <StripeHeader height={150}>
          <H size={48}>Rangliste</H>
          <T size={14} color="textSecondary">
            {data?.label || 'Nur vom Trainer bestätigte Übungen zählen'}
          </T>
        </StripeHeader>
      }>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -side, flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: side }}>
        {SCOPES.map((s) => (
          <Chip key={s.id} label={s.label} selected={scope === s.id} onPress={() => setScope(s.id)} />
        ))}
      </ScrollView>
      <Row style={{ gap: 8 }}>
        <Chip label="Saison" selected={period === 'season'} onPress={() => setPeriod('season')} />
        <Chip label="Letzte 30 Tage" selected={period === 'month'} onPress={() => setPeriod('month')} />
      </Row>

      {loading && !data ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 24 }} />
      ) : error ? (
        <Card>
          <T style={{ color: theme.danger }}>{error}</T>
        </Card>
      ) : !data || data.rows.length === 0 ? (
        empty()
      ) : (
        <>
          {data.me && (
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 16, borderColor: theme.primary, borderWidth: 1.5 }}>
              <View>
                <Label>Dein Platz</Label>
                <Num size={56} color="primary">
                  #{data.me.rank}
                </Num>
              </View>
              <View style={{ flex: 1 }}>
                <T weight="700">von {data.total.toLocaleString('de-DE')} Spieler*innen</T>
                <T size={13} color="textSecondary">
                  {data.me.points.toLocaleString('de-DE')} Punkte aus {data.me.entries} bestätigten Übungen
                </T>
              </View>
            </Card>
          )}

          {data.locked ? (
            <Card style={{ gap: 12 }}>
              <H size={24}>Ganze Liste mit Premium</H>
              <T size={14} color="textSecondary">
                Im Team ist die Rangliste kostenlos. Für Spielklasse, Region und Deutschland brauchst du Premium (oder eine
                Vereinslizenz deines Vereins).
              </T>
              <Button title="Premium ansehen" onPress={() => router.push('/premium')} />
            </Card>
          ) : (
            <View style={{ gap: 8 }}>
              {data.rows.map((r) => (
                <RankLine key={r.playerId} row={r} showClub={scope !== 'team'} />
              ))}
            </View>
          )}

          <T size={12} color="textSecondary">
            Punkte: nur vom Trainer bestätigte Übungen. Außerhalb des Teams erscheinen nur Spieler*innen, deren Eltern der
            Veröffentlichung zugestimmt haben – unter der C-Jugend nur mit Initiale.
          </T>
        </>
      )}
    </Screen>
  );
}
