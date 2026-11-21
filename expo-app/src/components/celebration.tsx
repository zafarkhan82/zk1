import { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

const CONFETTI = ['🎉', '⭐', '⚽', '✨', '🏆', '🎊', '💪', '🔥'];

export interface CelebrationInfo {
  xp: number;
  achieved: boolean;
  personalBest: boolean;
  levelUp: { level: number; title: string } | null;
  waitingForTrainer: boolean;
  isCheck: boolean;
}

/** Vollbild-Belohnung nach einem Eintrag: hochzählende Punkte, Konfetti, Level-up. */
export function Celebration({ info, onClose }: { info: CelebrationInfo | null; onClose: () => void }) {
  const theme = useTheme();
  const scale = useRef(new Animated.Value(0.6)).current;
  const fall = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!info) return;
    scale.setValue(0.6);
    fall.setValue(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }),
      Animated.timing(fall, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [info, scale, fall]);

  if (!info) return null;

  const headline = info.levelUp
    ? `Level ${info.levelUp.level}!`
    : info.personalBest
      ? 'Neuer Rekord!'
      : info.achieved
        ? 'Ziel geschafft!'
        : 'Gut gemacht!';
  const emoji = info.levelUp ? '🚀' : info.personalBest ? '🏅' : info.achieved ? '🎉' : '💪';

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={[styles.backdrop]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Schließen">
        {CONFETTI.concat(CONFETTI).map((c, i) => (
          <Animated.Text
            key={i}
            style={[
              styles.confetti,
              {
                left: `${(i * 37) % 95}%`,
                transform: [
                  { translateY: fall.interpolate({ inputRange: [0, 1], outputRange: [-60, 500 + (i % 4) * 80] }) },
                  { rotate: fall.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${(i % 2 ? 1 : -1) * 220}deg`] }) },
                ],
                opacity: fall.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
              },
            ]}>
            {c}
          </Animated.Text>
        ))}
        <Animated.View
          style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.primary, transform: [{ scale }] }]}>
          <Text style={{ fontSize: 64 }}>{emoji}</Text>
          <Text style={[styles.headline, { color: theme.text }]}>{headline}</Text>
          <Text style={[styles.xp, { color: theme.primary }]}>+{info.xp} XP</Text>
          {info.levelUp && <Text style={[styles.sub, { color: theme.text }]}>Du bist jetzt „{info.levelUp.title}“.</Text>}
          {!info.achieved && !info.isCheck && (
            <Text style={[styles.sub, { color: theme.textSecondary }]}>Das Ziel schaffst du beim nächsten Mal – dranbleiben!</Text>
          )}
          {info.waitingForTrainer && (
            <Text style={[styles.sub, { color: theme.textSecondary }]}>
              📨 Dein Trainer gibt den Eintrag beim nächsten Mal gesammelt frei.
            </Text>
          )}
          <View style={[styles.button, { backgroundColor: theme.primary }]}>
            <Text style={{ color: theme.primaryText, fontWeight: '800', fontSize: 16 }}>Weiter</Text>
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    overflow: 'hidden',
  },
  confetti: { position: 'absolute', top: 0, fontSize: 28 },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 2,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  headline: { fontSize: 28, fontWeight: '800', textAlign: 'center' },
  xp: { fontSize: 40, fontWeight: '900' },
  sub: { fontSize: 15, textAlign: 'center', lineHeight: 21 },
  button: { marginTop: 12, minHeight: 48, borderRadius: 14, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
});
