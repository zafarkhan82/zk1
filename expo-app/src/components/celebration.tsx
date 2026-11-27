import { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface CelebrationInfo {
  xp: number;
  achieved: boolean;
  personalBest: boolean;
  levelUp: { level: number; title: string } | null;
  waitingForTrainer: boolean;
  isCheck: boolean;
  /** Erreichter Wert, groß angezeigt */
  value?: string | null;
  unit?: string;
}

const SPARKS = Array.from({ length: 14 }, (_, i) => i);

/** Vollbild-Belohnung nach einem Eintrag */
export function Celebration({ info, onClose }: { info: CelebrationInfo | null; onClose: () => void }) {
  const theme = useTheme();
  const scale = useRef(new Animated.Value(0.7)).current;
  const burst = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!info) return;
    scale.setValue(0.7);
    burst.setValue(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(burst, { toValue: 1, duration: 1400, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [info, scale, burst]);

  if (!info) return null;

  const kicker = info.levelUp ? `Level ${info.levelUp.level} erreicht` : info.personalBest ? 'Neuer Rekord' : info.achieved ? 'Ziel geschafft' : 'Gut gemacht';
  const big = info.levelUp ? String(info.levelUp.level) : info.value ?? (info.achieved ? '✓' : '+');
  const stripes =
    Platform.OS === 'web'
      ? ({ backgroundImage: 'repeating-linear-gradient(115deg, rgba(25,227,255,0.10) 0 18px, transparent 18px 46px)' } as unknown as ViewStyle)
      : null;

  return (
    <Modal transparent={false} animationType="fade" visible onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: theme.background }, stripes]}>
        {SPARKS.map((i) => {
          const angle = (i / SPARKS.length) * Math.PI * 2;
          return (
            <Animated.View
              key={i}
              style={[
                styles.spark,
                {
                  backgroundColor: i % 3 === 0 ? theme.gold : theme.primary,
                  opacity: burst.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
                  transform: [
                    { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * 170] }) },
                    { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * 220] }) },
                    { rotate: `${i * 25}deg` },
                  ],
                },
              ]}
            />
          );
        })}
        <Animated.View style={{ alignItems: 'center', gap: 10, transform: [{ scale }] }}>
          <Text style={[styles.kicker, { color: theme.primary }]}>{kicker.toUpperCase()}</Text>
          <Text style={[styles.big, { color: theme.text }]}>{big}</Text>
          {info.levelUp ? (
            <Text style={[styles.sub, { color: theme.textSecondary }]}>Du bist jetzt „{info.levelUp.title}“</Text>
          ) : (
            !!info.unit && !!info.value && <Text style={[styles.sub, { color: theme.textSecondary }]}>{info.unit}</Text>
          )}
          <View style={[styles.xp, { backgroundColor: theme.primary }]}>
            <Text style={{ color: theme.primaryText, fontFamily: Font.display, fontSize: 34 }}>+{info.xp} XP</Text>
          </View>
          {!info.achieved && !info.isCheck && !info.personalBest && (
            <Text style={[styles.sub, { color: theme.textSecondary }]}>Das Ziel schaffst du beim nächsten Mal – dranbleiben!</Text>
          )}
          {info.waitingForTrainer && (
            <Text style={[styles.sub, { color: theme.textSecondary }]}>Dein Trainer gibt das beim nächsten Training frei.</Text>
          )}
        </Animated.View>
        <Pressable accessibilityRole="button" onPress={onClose} style={[styles.button, { backgroundColor: theme.text }]}>
          <Text style={{ color: theme.background, fontFamily: Font.black, fontSize: 17 }}>Weiter</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 28, overflow: 'hidden' },
  spark: { position: 'absolute', top: '42%', left: '50%', width: 10, height: 18, borderRadius: 3 },
  kicker: { fontFamily: Font.label, fontSize: 15, letterSpacing: 4 },
  big: { fontFamily: Font.display, fontSize: 132, lineHeight: 128 },
  sub: { fontFamily: Font.medium, fontSize: 15, textAlign: 'center', maxWidth: 280, lineHeight: 21 },
  xp: { marginTop: 8, paddingHorizontal: 22, paddingVertical: 6, borderRadius: 999 },
  button: { minHeight: 56, alignSelf: 'stretch', maxWidth: 420, width: '100%', borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
