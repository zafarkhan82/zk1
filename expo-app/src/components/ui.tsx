import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Screen({
  children,
  bottomBar = true,
  topInset = true,
}: {
  children: ReactNode;
  bottomBar?: boolean;
  topInset?: boolean;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{
        paddingTop: (topInset ? insets.top : 0) + Spacing.three,
        paddingBottom: insets.bottom + (bottomBar ? 96 : Spacing.five),
        paddingHorizontal: Spacing.three,
        alignItems: 'center',
      }}
      keyboardShouldPersistTaps="handled">
      <View style={{ width: '100%', maxWidth: MaxContentWidth, gap: Spacing.three }}>{children}</View>
    </ScrollView>
  );
}

export function T({
  children,
  size = 16,
  weight = '500',
  color = 'text',
  style,
  numberOfLines,
}: {
  children: ReactNode;
  size?: number;
  weight?: '400' | '500' | '600' | '700' | '800';
  color?: ThemeColor;
  style?: StyleProp<any>;
  numberOfLines?: number;
}) {
  const theme = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[{ color: theme[color], fontSize: size, fontWeight: weight, lineHeight: Math.round(size * 1.35) }, style]}>
      {children}
    </Text>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const theme = useTheme();
  const base = [styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }, style];
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.75 }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={base}>{children}</View>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const bg = variant === 'primary' ? theme.primary : variant === 'danger' ? 'transparent' : theme.backgroundSelected;
  const fg = variant === 'primary' ? theme.primaryText : variant === 'danger' ? theme.danger : theme.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
        variant === 'danger' && { borderWidth: 1, borderColor: theme.danger },
        style,
      ]}>
      <Text style={{ color: fg, fontSize: 16, fontWeight: '700' }}>{title}</Text>
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  color,
  textColor,
  accessibilityLabel,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
  /** Schriftfarbe im ausgewählten Zustand (z. B. dunkel auf Gold) */
  textColor?: string;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const active = color ?? theme.primary;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: !!selected, checked: !!selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={4}
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: selected ? active : theme.border,
          backgroundColor: selected ? active : theme.backgroundElement,
        },
      ]}>
      <Text style={{ color: selected ? (textColor ?? theme.primaryText) : theme.text, fontWeight: '600', fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }, style]}>{children}</View>;
}

export function Wrap({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>{children}</View>;
}

export function Progress({ value, color, height = 10 }: { value: number; color?: string; height?: number }) {
  const theme = useTheme();
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={{ height, borderRadius: height, backgroundColor: theme.backgroundSelected, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height: '100%', borderRadius: height, backgroundColor: color ?? theme.primary }} />
    </View>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: Spacing.one }}>
      <T size={14} weight="600" color="textSecondary">
        {label}
      </T>
      <TextInput
        placeholderTextColor={theme.textSecondary}
        {...props}
        style={[
          styles.input,
          { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement },
          props.multiline && { minHeight: 80, textAlignVertical: 'top' },
        ]}
      />
    </View>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: Spacing.two }}>
      <T size={18} weight="700">
        {children}
      </T>
      {right}
    </Row>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={() => onChange(!checked)}
      style={{ flexDirection: 'row', gap: Spacing.three, alignItems: 'center', minHeight: 44, paddingVertical: 4 }}>
      <View
        style={[
          styles.checkbox,
          { borderColor: checked ? theme.primary : theme.border, backgroundColor: checked ? theme.primary : 'transparent' },
        ]}>
        {checked && <Text style={{ color: theme.primaryText, fontWeight: '800' }}>✓</Text>}
      </View>
      <T size={14} style={{ flex: 1 }}>
        {label}
      </T>
    </Pressable>
  );
}

export function Pill({ text, color, textColor = '#fff' }: { text: string; color: string; textColor?: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: color }]}>
      <Text style={{ color: textColor, fontWeight: '800', fontSize: 13 }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  button: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
});

/** Farben für Stufen-Plaketten mit ausreichendem Kontrast */
export function useLevelColors() {
  const theme = useTheme();
  return {
    bronze: { bg: theme.bronze, fg: theme.onBronze, text: theme.bronzeText },
    silber: { bg: theme.silber, fg: theme.onSilber, text: theme.silberText },
    gold: { bg: theme.gold, fg: theme.onGold, text: theme.goldText },
  } as const;
}

/** Hinweis-/Leerzustand mit Symbol, Text und optionaler Aktion */
export function EmptyState({ emoji, title, text, action }: { emoji: string; title: string; text: string; action?: ReactNode }) {
  return (
    <Card style={{ alignItems: 'center', paddingVertical: Spacing.four }}>
      <T size={40}>{emoji}</T>
      <T weight="800" size={18} style={{ textAlign: 'center' }}>
        {title}
      </T>
      <T size={14} color="textSecondary" style={{ textAlign: 'center' }}>
        {text}
      </T>
      {action}
    </Card>
  );
}
