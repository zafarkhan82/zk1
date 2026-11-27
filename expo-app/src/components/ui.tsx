import type { ReactNode } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';

import { Font, MaxContentWidth, Spacing, type ThemeColor } from '@/constants/theme';
import { BOTTOM_BAR_SPACE, useLayout } from '@/hooks/use-layout';
import { useTheme } from '@/hooks/use-theme';

type Weight = '400' | '500' | '600' | '700' | '800';
const INTER: Record<Weight, string> = {
  '400': Font.body,
  '500': Font.medium,
  '600': Font.semibold,
  '700': Font.bold,
  '800': Font.black,
};

export function Screen({
  children,
  topInset = true,
  header,
  wide = false,
}: {
  children: ReactNode;
  /** Veraltet: das Menü ist jetzt auf allen Seiten sichtbar */
  bottomBar?: boolean;
  topInset?: boolean;
  /** Vollbreiter Kopfbereich oberhalb des Inhalts (z. B. StripeHeader) */
  header?: ReactNode;
  /** Breiter Inhalt für zweispaltige Seiten auf iPad/PC */
  wide?: boolean;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { device, sideNav, side } = useLayout();
  const maxWidth = device === 'phone' ? MaxContentWidth : wide ? 1180 : 780;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{
        paddingTop: header ? 0 : (topInset ? insets.top : 0) + (device === 'phone' ? Spacing.three : Spacing.five),
        paddingBottom: insets.bottom + (sideNav ? Spacing.six : BOTTOM_BAR_SPACE),
        alignItems: 'center',
      }}
      keyboardShouldPersistTaps="handled">
      {header}
      <View style={{ width: '100%', maxWidth, gap: Spacing.three, paddingHorizontal: side, paddingTop: header ? Spacing.three : 0 }}>
        {children}
      </View>
    </ScrollView>
  );
}

/** Zwei Spalten ab iPad quer / PC, sonst untereinander */
export function Columns({ left, right }: { left: ReactNode; right: ReactNode }) {
  const { twoColumns } = useLayout();
  if (!twoColumns)
    return (
      <>
        {left}
        {right}
      </>
    );
  return (
    <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
      <View style={{ flex: 1.15, minWidth: 0, gap: Spacing.three }}>{left}</View>
      <View style={{ flex: 1, minWidth: 0, gap: Spacing.three }}>{right}</View>
    </View>
  );
}

/** Raster: 1 Spalte (Handy), 2 (iPad), 3 (großer Bildschirm) */
export function Grid({ children, gap = 10 }: { children: ReactNode[]; gap?: number }) {
  const { gridColumns } = useLayout();
  if (gridColumns === 1) return <View style={{ gap }}>{children}</View>;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -gap / 2 }}>
      {children.map((c, i) => (
        <View key={i} style={{ width: `${100 / gridColumns}%`, padding: gap / 2, flexDirection: 'column' }}>
          {c}
        </View>
      ))}
    </View>
  );
}

/** Fließtext (Inter) */
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
  weight?: Weight;
  color?: ThemeColor;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const theme = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[{ color: theme[color], fontSize: size, fontFamily: INTER[weight], lineHeight: Math.round(size * 1.4) }, style]}>
      {children}
    </Text>
  );
}

/** Große Sport-Überschrift: kursiv, Großbuchstaben */
export function H({
  children,
  size = 44,
  color = 'text',
  style,
  numberOfLines,
}: {
  children: ReactNode;
  size?: number;
  color?: ThemeColor;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const theme = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        { color: theme[color], fontSize: size, fontFamily: size >= 32 ? Font.display : Font.displayBold, lineHeight: Math.round(size * 0.98), textTransform: 'uppercase' },
        style,
      ]}>
      {children}
    </Text>
  );
}

/** Kleines Etikett in Großbuchstaben mit Sperrung */
export function Label({ children, color = 'textSecondary', style }: { children: ReactNode; color?: ThemeColor; style?: StyleProp<TextStyle> }) {
  const theme = useTheme();
  return (
    <Text style={[{ color: theme[color], fontSize: 13, fontFamily: Font.label, letterSpacing: 2.5, textTransform: 'uppercase' }, style]}>
      {children}
    </Text>
  );
}

/** Große Zahl */
export function Num({ children, size = 40, color = 'text', style }: { children: ReactNode; size?: number; color?: ThemeColor; style?: StyleProp<TextStyle> }) {
  const theme = useTheme();
  return (
    <Text style={[{ color: theme[color], fontSize: size, fontFamily: Font.number, lineHeight: Math.round(size * 1.02) }, style]}>{children}</Text>
  );
}

/** Kopfbereich mit diagonalen Streifen (Web: Muster, App: ruhige Fläche) */
export function StripeHeader({ children, height = 190 }: { children: ReactNode; height?: number }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const stripes =
    Platform.OS === 'web'
      ? ({ backgroundImage: 'repeating-linear-gradient(115deg, rgba(25,227,255,0.10) 0 16px, transparent 16px 40px)' } as unknown as ViewStyle)
      : { backgroundColor: theme.primarySoft };
  return (
    <View style={[{ width: '100%', minHeight: height + insets.top, justifyContent: 'flex-end', paddingTop: insets.top }, stripes]}>
      <View style={{ width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 18, gap: 8 }}>
        {children}
      </View>
    </View>
  );
}

/** Go4Pro-Logo: Raute mit zwei Pfeilen nach oben */
export function Logo({ size = 40 }: { size?: number }) {
  const theme = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 76 76" accessibilityLabel="Go4Pro">
      <Rect x={6} y={6} width={64} height={64} rx={18} fill="none" stroke={theme.primary} strokeWidth={6} transform="rotate(45 38 38)" />
      <Path d="M27 46 L38 30 L49 46" fill="none" stroke={theme.text} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M31 53 L38 43 L45 53" fill="none" stroke={theme.primary} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const theme = useTheme();
  const base = [styles.card, { backgroundColor: theme.backgroundElement, borderColor: 'transparent' }, style];
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.8 }]}>
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
  const bg = variant === 'primary' ? theme.primary : 'transparent';
  const fg = variant === 'primary' ? theme.primaryText : variant === 'danger' ? theme.danger : theme.text;
  const border = variant === 'primary' ? theme.primary : variant === 'danger' ? theme.danger : theme.border;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.4 : pressed ? 0.85 : 1 },
        style,
      ]}>
      <Text style={{ color: fg, fontSize: 16, fontFamily: variant === 'primary' ? Font.black : Font.bold, textAlign: 'center' }}>{title}</Text>
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
      style={[styles.chip, { borderColor: selected ? active : theme.border, backgroundColor: selected ? active : 'transparent' }]}>
      <Text style={{ color: selected ? (textColor ?? theme.primaryText) : theme.text, fontFamily: Font.bold, fontSize: 14, textAlign: 'center' }}>
        {label}
      </Text>
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
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      <TextInput
        placeholderTextColor={theme.textSecondary}
        accessibilityLabel={label}
        {...props}
        style={[
          styles.input,
          { color: theme.text, borderColor: theme.border, backgroundColor: theme.background, fontFamily: Font.medium },
          props.multiline && { minHeight: 88, textAlignVertical: 'top' },
        ]}
      />
    </View>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: Spacing.two }}>
      <H size={26}>{children}</H>
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
      <View style={[styles.checkbox, { borderColor: checked ? theme.primary : theme.border, backgroundColor: checked ? theme.primary : 'transparent' }]}>
        {checked && <Text style={{ color: theme.primaryText, fontFamily: Font.black }}>✓</Text>}
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
      <Text style={{ color: textColor, fontFamily: Font.black, fontSize: 13 }}>{text}</Text>
    </View>
  );
}

/** Kleine Kennzahl-Kachel */
export function Stat({ label, value, accent, onPress }: { label: string; value: string; accent?: boolean; onPress?: () => void }) {
  return (
    <Card style={{ flex: 1, padding: 14, gap: 2 }} onPress={onPress}>
      <T size={12} weight="600" color="textSecondary">
        {label}
      </T>
      <Num size={34} color={accent ? 'primary' : 'text'}>
        {value}
      </Num>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  button: {
    minHeight: 54,
    borderRadius: 999,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    borderWidth: 1.5,
    borderRadius: 999,
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 12,
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
      <H size={24} style={{ textAlign: 'center' }}>
        {title}
      </H>
      <T size={14} color="textSecondary" style={{ textAlign: 'center' }}>
        {text}
      </T>
      {action}
    </Card>
  );
}

/** Sicherheitsabfrage vor folgenreichen Aktionen (Web: confirm, App: Alert) */
export function confirmAction(title: string, message: string, onYes: () => void, yesLabel = 'Ja') {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Abbrechen', style: 'cancel' },
    { text: yesLabel, style: 'destructive', onPress: onYes },
  ]);
}
