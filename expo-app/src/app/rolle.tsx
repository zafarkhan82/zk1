import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icons';
import { Card, H, Logo, Row, Screen, T } from '@/components/ui';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useStore, type AppMode } from '@/lib/store';
import { errorText } from '@/lib/supabase';

const ROLES: { id: AppMode; title: string; text: string; icon: 'User' | 'Ball' | 'Whistle' | 'Shield' }[] = [
  { id: 'eltern', title: 'Elternteil', text: 'Du legst ein oder mehrere Kinder an und begleitest ihr Training.', icon: 'User' },
  { id: 'spieler', title: 'Spieler*in', text: 'Du trackst dich selbst und bewertest andere. Unter 16 richten deine Eltern den Zugang ein.', icon: 'Ball' },
  { id: 'trainer', title: 'Trainer*in', text: 'Du betreust Teams – auch in mehreren Vereinen, sobald sie dich freigeben.', icon: 'Whistle' },
  { id: 'admin', title: 'Vereins- oder Verbands-Admin', text: 'Du verwaltest einen Verein, Kreis, Verband oder ein Bundesland.', icon: 'Shield' },
];

/** Einstieg: Rolle wählen. Bestimmt Startseite und Menü. Später unter Konto bzw. Ich änderbar. */
export default function Rolle() {
  const { setAppMode, appMode, players, isOrgAdmin } = useStore();
  const theme = useTheme();
  const [busy, setBusy] = useState<AppMode | null>(null);
  const [error, setError] = useState('');

  const choose = async (m: AppMode) => {
    setBusy(m);
    setError('');
    try {
      await setAppMode(m);
      if (m === 'eltern' || m === 'spieler') router.replace(players.length ? '/' : { pathname: '/onboarding', params: { rolle: m } });
      else if (m === 'trainer') router.replace('/trainer');
      else router.replace(isOrgAdmin ? '/verwaltung' : '/trainer');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen bottomBar={false}>
      <Row style={{ gap: 10 }}>
        <Logo size={36} />
        <H size={28}>
          Go<H size={28} color="primary">4</H>Pro
        </H>
      </Row>
      <H size={44}>Wer bist du?</H>
      <T color="textSecondary">Wähle deine Rolle. Du kannst sie später jederzeit ändern – und weitere Rollen kommen per Einladung dazu.</T>

      <View style={{ gap: 12 }}>
        {ROLES.map((r) => {
          const I = Icon[r.icon];
          const active = appMode === r.id;
          return (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              accessibilityLabel={r.title}
              disabled={!!busy}
              onPress={() => choose(r.id)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 16,
                padding: 18,
                borderRadius: 22,
                backgroundColor: active ? theme.primarySoft : theme.backgroundElement,
                borderWidth: 1.5,
                borderColor: active ? theme.primary : 'transparent',
                opacity: pressed || (busy && busy !== r.id) ? 0.7 : 1,
              })}>
              <View style={{ width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.backgroundSelected }}>
                <I size={28} color={theme.primary} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontFamily: Font.bold, fontSize: 17, color: theme.text }}>{busy === r.id ? 'Einen Moment …' : r.title}</Text>
                <Text style={{ fontFamily: Font.medium, fontSize: 13, lineHeight: 18, color: theme.textSecondary }}>{r.text}</Text>
              </View>
              <Icon.Chevron color={theme.textSecondary} />
            </Pressable>
          );
        })}
      </View>
      {!!error && (
        <Card style={{ borderColor: theme.danger }}>
          <T style={{ color: theme.danger }}>{error}</T>
        </Card>
      )}
      <T size={12} color="textSecondary">
        Unter 16 brauchst du die Zustimmung deiner Eltern – du kannst sie direkt aus der App per Mail darum bitten. Admin-Rechte vergibt immer die Ebene darüber per Einladung.
      </T>
    </Screen>
  );
}
