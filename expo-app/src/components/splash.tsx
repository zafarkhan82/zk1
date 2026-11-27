import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';

import { Logo } from '@/components/ui';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Startanimation: Logo fliegt ein, Schriftzug blitzt auf, Flutlicht-Streifen – dann ausblenden (ca. 1,8 s) */
export function StartAnimation({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const logo = useRef(new Animated.Value(0)).current;
  const word = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const [w, setW] = useState(400);

  useEffect(() => {
    Animated.sequence([
      Animated.spring(logo, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(word, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(sweep, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
      Animated.delay(420),
      Animated.timing(fade, { toValue: 0, duration: 320, useNativeDriver: true }),
    ]).start(() => onDone());
  }, [logo, word, sweep, fade, onDone]);

  const scale = logo.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  const rotate = logo.interpolate({ inputRange: [0, 1], outputRange: ['-200deg', '0deg'] });
  return (
    <Animated.View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center', opacity: fade, overflow: 'hidden' }}>
      <Animated.View
        style={{
          position: 'absolute',
          top: -200,
          bottom: -200,
          width: 90,
          backgroundColor: theme.primary,
          opacity: 0.12,
          transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-w, w] }) }, { rotate: '18deg' }],
        }}
      />
      <Animated.View style={{ opacity: logo, transform: [{ scale }, { rotate }] }}>
        <Logo size={96} />
      </Animated.View>
      <Animated.View style={{ marginTop: 18, opacity: word, transform: [{ translateY: word.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }}>
        <Text style={{ color: theme.text, fontFamily: Font.display, fontSize: 52, letterSpacing: 1 }}>
          GO<Text style={{ color: theme.primary }}>4</Text>PRO
        </Text>
      </Animated.View>
      <Animated.View style={{ marginTop: 6, opacity: word }}>
        <Text style={{ color: theme.textSecondary, fontFamily: Font.label, fontSize: 15, letterSpacing: 3 }}>BEWERTEN · BESSER WERDEN · GESEHEN WERDEN</Text>
      </Animated.View>
      <View style={{ position: 'absolute', bottom: 40 }} />
    </Animated.View>
  );
}
