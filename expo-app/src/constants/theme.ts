import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0E1A12',
    background: '#F4F7F5',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E3EEE7',
    textSecondary: '#5B6B61',
    border: '#DCE5DF',
    primary: '#118C4F',
    primaryText: '#FFFFFF',
    primarySoft: '#DDF3E6',
    accent: '#F2A900',
    /** Akzent als Textfarbe (Kontrast ≥ 4,5:1 auf Weiß) */
    accentText: '#8A5A00',
    danger: '#B42318',
    bronze: '#8C5524',
    silber: '#C9D0D6',
    gold: '#F2C94C',
    /** Schrift auf Stufen-Plaketten */
    onBronze: '#FFFFFF',
    onSilber: '#1F2933',
    onGold: '#3D2E00',
    bronzeText: '#8C5524',
    silberText: '#56616B',
    goldText: '#8A5A00',
  },
  dark: {
    text: '#EEF4F0',
    background: '#0B110D',
    backgroundElement: '#16201A',
    backgroundSelected: '#1F2E25',
    textSecondary: '#9DB0A4',
    border: '#26352C',
    primary: '#2FBF71',
    primaryText: '#04140A',
    primarySoft: '#143323',
    accent: '#F5B82E',
    accentText: '#F5B82E',
    danger: '#FF8A80',
    bronze: '#D08A50',
    silber: '#AEB8C0',
    gold: '#E8B830',
    onBronze: '#1F1206',
    onSilber: '#11161A',
    onGold: '#1F1700',
    bronzeText: '#E0A06A',
    silberText: '#C3CBD2',
    goldText: '#F5C94C',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
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
