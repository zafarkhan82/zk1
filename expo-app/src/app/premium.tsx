import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Row, Screen, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useStore } from '@/lib/store';
import { errorText, supabase } from '@/lib/supabase';

const FREE = [
  'Trainingstagebuch',
  'Alle Übungen selbst eintragen (Bronze bis Gold)',
  'Punkte, Level, Skills und Abzeichen',
  'Team beitreten, Team-Challenges auf Bronze',
  'Spielberichte des eigenen Teams',
];

const PREMIUM = [
  'Leistungen vom Trainer bestätigen lassen',
  'Bewertungen durch Trainer',
  'Bewertungen durch Mitspieler und Gegner',
  'Challenges ab Silber',
  'Challenges mit Spielern anderer Vereine',
  'Öffentliche Ranglisten: lokal, regional, national, international',
];

export default function Premium() {
  const { state, premium } = useStore();
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const name = state.profile?.nickname ?? 'deinen Spieler';

  const buy = async () => {
    setBusy(true);
    setMsg('');
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { player_id: state.profile?.id },
      });
      if (error) throw error;
      if (data?.url && typeof window !== 'undefined') window.location.href = data.url;
    } catch (e) {
      const t = errorText(e);
      setMsg(
        /not found|404|Failed to send/i.test(t)
          ? 'Die Bezahlung wird gerade eingerichtet und ist in Kürze verfügbar.'
          : t,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen bottomBar={false} topInset={false}>
      <View style={{ alignItems: 'center', gap: Spacing.one }}>
        <T size={44}>⭐</T>
        <T size={26} weight="800">
          Kick-Tagebuch Premium
        </T>
        <T color="textSecondary" style={{ textAlign: 'center' }}>
          Für {name}: zeig deine Leistung über das Team hinaus.
        </T>
      </View>

      {premium ? (
        <Card style={{ borderColor: theme.primary, borderWidth: 2 }}>
          <T weight="800">✅ Premium ist aktiv</T>
          <T size={14} color="textSecondary">
            Alle Funktionen sind für {name} freigeschaltet.
          </T>
        </Card>
      ) : (
        <Card style={{ borderColor: theme.accent, borderWidth: 2, alignItems: 'center' }}>
          <T size={36} weight="800">
            20 €
          </T>
          <T color="textSecondary">pro Kind und Jahr</T>
          <Button title={busy ? 'Einen Moment …' : `Premium für ${name} holen`} onPress={buy} disabled={busy} style={{ alignSelf: 'stretch' }} />
          {!!msg && (
            <T size={13} color="textSecondary" style={{ textAlign: 'center' }}>
              {msg}
            </T>
          )}
        </Card>
      )}

      <Card>
        <T weight="700">⭐ Premium</T>
        {PREMIUM.map((f) => (
          <Row key={f} style={{ alignItems: 'flex-start' }}>
            <T size={14}>⭐</T>
            <T size={14} style={{ flex: 1 }}>
              {f}
            </T>
          </Row>
        ))}
      </Card>

      <Card>
        <T weight="700">Immer kostenlos (team-intern)</T>
        {FREE.map((f) => (
          <Row key={f} style={{ alignItems: 'flex-start' }}>
            <T size={14}>✓</T>
            <T size={14} style={{ flex: 1 }}>
              {f}
            </T>
          </Row>
        ))}
      </Card>

      <T size={12} color="textSecondary">
        Das Abo läuft ein Jahr und kann jederzeit zum Ende der Laufzeit gekündigt werden.
      </T>
    </Screen>
  );
}
