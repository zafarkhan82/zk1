import '@/global.css';

import { Platform } from 'react-native';

/**
 * Go4Pro – „Electric Cyan“: dunkler Grund, eine Signalfarbe.
 * Die App ist bewusst immer dunkel (wie Flutlicht-Abende); hell und dunkel nutzen dieselben Werte.
 */
const cyan = {
  text: '#F2F6FA',
  background: '#0A0D12',
  backgroundElement: '#161D27',
  backgroundSelected: '#232D3A',
  textSecondary: '#A7B3C2',
  border: '#2A3442',
  primary: '#19E3FF',
  primaryText: '#04141B',
  primarySoft: '#0F2E38',
  accent: '#19E3FF',
  accentText: '#19E3FF',
  danger: '#FF6B6B',
  success: '#1E9E5A',
  bar: '#0E131A',
  bronze: '#C77A3D',
  silber: '#D7DEE5',
  gold: '#F5C84B',
  onBronze: '#1A0E04',
  onSilber: '#18202A',
  onGold: '#2A1F00',
  bronzeText: '#E0A06A',
  silberText: '#D7DEE5',
  goldText: '#F5C84B',
} as const;

export const Colors = { light: cyan, dark: cyan } as const;

export type ThemeColor = keyof typeof cyan;

/** Schriften: Barlow Condensed (kursiv) für Titel und Zahlen, Inter für Text. */
export const Font = {
  display: 'BarlowCondensed_900Black_Italic',
  displayBold: 'BarlowCondensed_800ExtraBold_Italic',
  number: 'BarlowCondensed_800ExtraBold',
  label: 'BarlowCondensed_700Bold',
  body: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  black: 'Inter_800ExtraBold',
} as const;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', serif: 'ui-serif', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', serif: 'serif', rounded: 'normal', mono: 'monospace' },
  web: { sans: 'var(--font-display)', serif: 'var(--font-serif)', rounded: 'var(--font-rounded)', mono: 'var(--font-mono)' },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const MaxContentWidth = 640;
