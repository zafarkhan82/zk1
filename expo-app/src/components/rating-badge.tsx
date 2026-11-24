import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { useTierColors } from '@/components/player-card';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Tier } from '@/lib/rating';

/** Kleines Wertungs-Abzeichen (z. B. auf der Startseite), öffnet die Spielerkarte */
export function RatingBadge({ overall, tier, delta = 0 }: { overall: number; tier: Tier; delta?: number }) {
  const theme = useTheme();
  const tc = useTierColors(tier);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Gesamtwertung ${overall}, Karte öffnen`}
      onPress={() => router.push('/karte')}
      style={({ pressed }) => ({ alignItems: 'center', opacity: pressed ? 0.85 : 1 })}>
      <View
        style={{
          width: 64,
          height: 72,
          borderRadius: 16,
          borderWidth: 2,
          borderColor: tc.edge,
          backgroundColor: theme.backgroundElement,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Text style={{ fontFamily: Font.number, fontSize: 32, lineHeight: 34, color: tc.text }}>{overall}</Text>
        <Text style={{ fontFamily: Font.label, fontSize: 9, letterSpacing: 1.5, color: theme.textSecondary }}>RATING</Text>
      </View>
      {delta !== 0 && (
        <Text style={{ fontFamily: Font.bold, fontSize: 11, marginTop: 3, color: delta > 0 ? theme.success : theme.danger }}>
          {delta > 0 ? `▲ ${delta}` : `▼ ${-delta}`}
        </Text>
      )}
    </Pressable>
  );
}
