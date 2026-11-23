import Svg, { Circle, Path, Rect } from 'react-native-svg';

type P = { size?: number; color: string; strokeWidth?: number };

/** Einheitliche Linien-Icons (statt Emojis) */
export const Icon = {
  Home: ({ size = 24, color, strokeWidth = 2 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 11l8-7 8 7v9H4z" />
      <Path d="M10 20v-5h4v5" />
    </Svg>
  ),
  Ball: ({ size = 24, color, strokeWidth = 2 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 7l4 3-1.5 4.5h-5L8 10z" />
    </Svg>
  ),
  Plus: ({ size = 24, color, strokeWidth = 3 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  Shield: ({ size = 24, color, strokeWidth = 2 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round">
      <Path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
    </Svg>
  ),
  User: ({ size = 24, color, strokeWidth = 2 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Circle cx={12} cy={8} r={4} />
      <Path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </Svg>
  ),
  Diary: ({ size = 24, color, strokeWidth = 2 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 4h11l3 3v13H5z" />
      <Path d="M9 10h6M9 14h6" />
    </Svg>
  ),
  Pitch: ({ size = 24, color, strokeWidth = 2 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Rect x={3} y={5} width={18} height={14} rx={2} />
      <Path d="M12 5v14M3 12h3M18 12h3" />
    </Svg>
  ),
  Trophy: ({ size = 24, color, strokeWidth = 2 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <Path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8" />
    </Svg>
  ),
  Flame: ({ size = 18, color }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 2c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-6 2 1 3 3 3 3 0-3 0-5 0-7z" fill={color} />
    </Svg>
  ),
  Chevron: ({ size = 20, color, strokeWidth = 2.2 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 5l7 7-7 7" />
    </Svg>
  ),
  Whistle: ({ size = 24, color, strokeWidth = 2 }: P) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={9} cy={14} r={5} />
      <Path d="M13 11l8-4M12 9h9" />
    </Svg>
  ),
};
