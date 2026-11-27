import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ROLE, stars, type RaterRole } from '@/lib/ratings';
import { supabase } from '@/lib/supabase';

/** Globaler Live-Hinweis: Sobald jemand die aktive Spielerin/den aktiven Spieler bewertet, erscheint oben ein Banner. */
export function LiveRatingToast({ playerId }: { playerId: string | null }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [info, setInfo] = useState<{ role: RaterRole; avg: number } | null>(null);
  const y = useRef(new Animated.Value(-140)).current;

  useEffect(() => {
    if (!playerId) return;
    const ch = supabase
      .channel(`live-toast-${playerId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ratings', filter: `rated_player_id=eq.${playerId}` }, (p) => {
        const r = p.new as { rater_role: RaterRole; avg_stars: number };
        setInfo({ role: r.rater_role, avg: Number(r.avg_stars) });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [playerId]);

  useEffect(() => {
    if (!info) return;
    Animated.spring(y, { toValue: 0, useNativeDriver: true, friction: 7 }).start();
    const t = setTimeout(() => Animated.timing(y, { toValue: -140, duration: 250, useNativeDriver: true }).start(() => setInfo(null)), 4500);
    return () => clearTimeout(t);
  }, [info, y]);

  if (!info) return null;
  return (
    <Animated.View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12, alignItems: 'center', transform: [{ translateY: y }], zIndex: 50 }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/bewertungen')}
        style={{ maxWidth: 520, width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: theme.backgroundSelected, borderWidth: 1.5, borderColor: theme.gold }}>
        <Text style={{ fontSize: 26 }}>⭐</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontFamily: Font.black, fontSize: 15 }}>Neue Bewertung!</Text>
          <Text style={{ color: theme.textSecondary, fontFamily: Font.medium, fontSize: 13 }}>
            {ROLE[info.role]} · {stars(info.avg)} von 6 Sternen – antippen
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}
