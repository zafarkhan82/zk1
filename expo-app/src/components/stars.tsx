import { Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const STAR = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z';

/** Anzeige 1–6 Sterne (auch Durchschnitt mit Nachkommastelle) */
export function Stars({ value, size = 16, color }: { value: number | null | undefined; size?: number; color?: string }) {
  const theme = useTheme();
  const v = value ?? 0;
  return (
    <View style={{ flexDirection: 'row', gap: 2 }} accessibilityLabel={`${v.toFixed(1)} von 6 Sternen`}>
      {[1, 2, 3, 4, 5, 6].map((i) => {
        const f = Math.max(0, Math.min(1, v - (i - 1)));
        return (
          <View key={i} style={{ width: size, height: size, overflow: 'hidden' }}>
            <Svg width={size} height={size} viewBox="0 0 24 24" style={{ position: 'absolute' }}>
              <Path d={STAR} fill={theme.backgroundSelected} />
            </Svg>
            {f > 0 && (
              <View style={{ position: 'absolute', left: 0, top: 0, width: size * f, height: size, overflow: 'hidden' }}>
                <Svg width={size} height={size} viewBox="0 0 24 24">
                  <Path d={STAR} fill={color ?? theme.gold} />
                </Svg>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const WORDS = ['', 'Ausbaufähig', 'Okay', 'Gut', 'Stark', 'Super', 'Überragend'];

/** Eingabe 1–6 Sterne, große Tippflächen */
export function StarInput({ value, onChange, label, hint }: { value: number; onChange: (v: number) => void; label: string; hint?: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={{ color: theme.text, fontFamily: Font.bold, fontSize: 15 }}>{label}</Text>
        <Text style={{ color: value ? theme.gold : theme.textSecondary, fontFamily: Font.semibold, fontSize: 13 }}>
          {value ? `${value}/6 · ${WORDS[value]}` : 'tippen'}
        </Text>
      </View>
      {!!hint && <Text style={{ color: theme.textSecondary, fontFamily: Font.medium, fontSize: 12, marginTop: -4 }}>{hint}</Text>}
      <View style={{ flexDirection: 'row', gap: 4 }} accessibilityRole="adjustable" accessibilityLabel={label}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Pressable
            key={i}
            accessibilityRole="button"
            accessibilityLabel={`${i} Sterne`}
            hitSlop={2}
            onPress={() => onChange(i)}
            style={({ pressed }) => ({ flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 10, opacity: pressed ? 0.7 : 1,
              backgroundColor: i <= value ? 'rgba(245,200,75,0.12)' : theme.backgroundSelected })}>
            <Svg width={30} height={30} viewBox="0 0 24 24">
              <Path d={STAR} fill={i <= value ? theme.gold : theme.border} />
            </Svg>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

