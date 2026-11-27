import { router } from 'expo-router';
import { Platform, Share, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { PlayerCard, TierLadder } from '@/components/player-card';
import { Button, Card, Columns, H, Label, Progress, Row, Screen, StripeHeader, T } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { playerLink, usePlayerRating } from '@/lib/rating';
import { useStore } from '@/lib/store';

const PARTS: { key: 'skill' | 'activity' | 'volume' | 'rating' | 'match'; label: string; weight: string; hint: string }[] = [
  { key: 'skill', label: 'Können', weight: '40 %', hint: 'Deine besten Übungen je Bereich – Gold zählt mehr als Bronze, bestätigt mehr als unbestätigt.' },
  { key: 'activity', label: 'Aktivität', weight: '10 %', hint: 'In wie vielen der letzten 8 Wochen du trainiert hast.' },
  { key: 'volume', label: 'Umfang', weight: '10 %', hint: 'Bestätigte Übungen der letzten 90 Tage (40 = voll).' },
  { key: 'rating', label: 'Bewertungen', weight: '30 %', hint: '1–6 Sterne pro Begegnung von Trainer*innen (zählen doppelt), Mitspieler*innen und Gegnern. Ohne Bewertungen zählt das Können mehr.' },
  { key: 'match', label: 'Spiele', weight: '10 %', hint: 'Einsatzminuten und Torbeteiligungen aus bestätigten Spielen.' },
];

export default function Karte() {
  const { state, teams } = useStore();
  const theme = useTheme();
  const profile = state.profile!;
  const rating = usePlayerRating(profile.id, state.logs.length);
  const team = teams.find((t) => t.status === 'approved');

  if (!rating) return <Screen topInset={false}><T color="textSecondary">Lade deine Wertung …</T></Screen>;

  const link = playerLink(rating.go4proId);
  const delta = rating.overallWeekAgo != null ? rating.overall - rating.overallWeekAgo : 0;
  const share = async () => {
    const text = `Meine Go4Pro-Karte: ${rating.go4proId} – ${link}`;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((navigator as any).share) await (navigator as any).share({ title: 'Go4Pro', text, url: link }).catch(() => {});
      else await navigator.clipboard.writeText(link);
      return;
    }
    await Share.share({ message: text });
  };

  return (
    <Screen
      wide
      topInset={false}
      header={
        <StripeHeader height={140}>
          <H size={48}>Deine Karte</H>
          <T size={14} color="textSecondary">
            Gesamtwertung 35–79 aus allem, was zu dir zählt
          </T>
        </StripeHeader>
      }>
      <Columns
        left={
          <>
            <PlayerCard
              data={{
                nickname: profile.nickname,
                position: profile.position,
                club: team?.clubName ?? null,
                team: team?.teamName ?? null,
                jersey: team?.jerseyNumber ?? null,
                overall: rating.overall,
                attributes: rating.attributes,
                go4proId: rating.go4proId,
              }}
            />
            <Card style={{ alignItems: 'center', gap: 12 }}>
              <Label>Dein QR-Code</Label>
              <View style={{ padding: 14, borderRadius: 18, backgroundColor: '#FFFFFF' }}>
                <QRCode value={link} size={200} backgroundColor="#FFFFFF" color="#0A0D12" />
              </View>
              <T size={13} color="textSecondary" style={{ textAlign: 'center' }}>
                Trainer*innen oder Scouts scannen ihn und sehen deine Karte. Was sichtbar ist, bestimmen deine Eltern (Einstellungen →
                Veröffentlichung).
              </T>
              <Button title="Link teilen" variant="secondary" onPress={share} style={{ alignSelf: 'stretch' }} />
            </Card>
          </>
        }
        right={
          <>
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <Label>Gesamtwertung</Label>
                <T size={13} weight="700" style={{ color: delta > 0 ? theme.success : delta < 0 ? theme.danger : theme.textSecondary }}>
                  {delta > 0 ? `▲ ${delta}` : delta < 0 ? `▼ ${-delta}` : '● gleich'} zur Vorwoche
                </T>
              </Row>
              <H size={56} color="primary">
                {rating.overall}
              </H>
              <TierLadder overall={rating.overall} />
            </Card>

            <Card style={{ gap: 14 }}>
              <Label>So entsteht deine Wertung</Label>
              {PARTS.map((p) => {
                const v = rating.components[p.key];
                return (
                  <View key={p.key} style={{ gap: 6 }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <T weight="700">
                        {p.label} <T size={12} color="textSecondary">{p.weight}</T>
                      </T>
                      <T weight="700" color={v == null ? 'textSecondary' : 'text'}>
                        {v == null ? 'noch keine' : `${v} %`}
                      </T>
                    </Row>
                    <Progress value={(v ?? 0) / 100} height={6} />
                    <T size={12} color="textSecondary">
                      {p.hint}
                      {v == null ? ' Bis dahin zählt dein Können mehr.' : ''}
                    </T>
                  </View>
                );
              })}
            </Card>

            <Card style={{ backgroundColor: theme.primarySoft }}>
              <Label color="primary">So steigst du auf</Label>
              <T size={14}>
                Probier die nächste Stufe deiner besten Übungen, trainiere jede Woche ein bisschen und lass deine Ergebnisse vom Trainer
                bestätigen. Die Ziele passen zu deiner Altersklasse – so ist die Wertung für alle Jahrgänge fair.
              </T>
              <Button title="Zum Training" onPress={() => router.navigate('/training')} />
            </Card>
          </>
        }
      />
    </Screen>
  );
}
