import { useId } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Circle, Defs, LinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';

import { Font } from '@/constants/theme';
import { CATEGORIES } from '@/data/exercises';
import { useTheme } from '@/hooks/use-theme';
import { nextTier, playerLink, tierFor, TIERS, type Tier } from '@/lib/rating';
import type { Category } from '@/lib/types';

export const ATTR_SHORT: Record<Category, string> = {
  ballkontrolle: 'BAL',
  dribbling: 'DRI',
  passen: 'PAS',
  schiessen: 'SCH',
  koordination: 'KOO',
  athletik: 'ATH',
  kopf: 'KOP',
  torwart: 'TOR',
};
const POS_SHORT: Record<string, string> = { Tor: 'TW', Abwehr: 'AB', Mittelfeld: 'MF', Sturm: 'ST', 'Noch offen': '—' };

export interface CardData {
  nickname: string;
  position: string | null;
  club: string | null;
  team: string | null;
  jersey: number | null;
  overall: number;
  tier?: Tier;
  attributes: Partial<Record<Category, number>>;
  go4proId: string;
  ageGroup?: string | null;
}

interface TierStyle {
  /** Verlauf von oben links nach unten rechts */
  stops: [string, string, string];
  edge: string;
  text: string;
  sub: string;
  line: string;
  /** Farbe für Abzeichen/Chips auf dunklem App-Hintergrund */
  chip: string;
  chipText: string;
  shine: number;
}

/** Farbwelt der sechs Kartenstufen */
export const TIER_STYLE: Record<Tier, TierStyle> = {
  weiss: { stops: ['#FFFFFF', '#E6EAEF', '#BFC7D1'], edge: '#FFFFFF', text: '#10151C', sub: '#4A5563', line: 'rgba(16,21,28,0.18)', chip: '#F2F4F7', chipText: '#10151C', shine: 0.5 },
  bronze: { stops: ['#E8A673', '#B4642C', '#4F260C'], edge: '#F3B987', text: '#FFF6EE', sub: '#F7D9C2', line: 'rgba(255,246,238,0.3)', chip: '#C77A3D', chipText: '#1A0E04', shine: 0.22 },
  silber: { stops: ['#FBFCFE', '#BCC6D1', '#66717E'], edge: '#FFFFFF', text: '#0F1620', sub: '#2C3846', line: 'rgba(15,22,32,0.22)', chip: '#D7DEE5', chipText: '#18202A', shine: 0.45 },
  gold: { stops: ['#FFF3B0', '#F2C744', '#9C700C'], edge: '#FFF7CF', text: '#251A00', sub: '#4A3705', line: 'rgba(37,26,0,0.25)', chip: '#F5C84B', chipText: '#2A1F00', shine: 0.4 },
  platin: { stops: ['#4A4E57', '#16171B', '#000000'], edge: '#E5E4E2', text: '#F4F4F2', sub: '#BDBEC2', line: 'rgba(229,228,226,0.35)', chip: '#1B1C20', chipText: '#E5E4E2', shine: 0.16 },
  diamant: { stops: ['#A8F4FF', '#2D8CFF', '#0A2380'], edge: '#D2F9FF', text: '#FFFFFF', sub: '#DDF6FF', line: 'rgba(255,255,255,0.35)', chip: '#2D8CFF', chipText: '#FFFFFF', shine: 0.3 },
};

/** Hintergrund der Karte (SVG – sieht in App und Browser gleich aus) */
function CardBackground({ tier }: { tier: Tier }) {
  const id = useId().replace(/:/g, '');
  const t = TIER_STYLE[tier];
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 140" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={t.stops[0]} />
          <Stop offset="0.5" stopColor={t.stops[1]} />
          <Stop offset="1" stopColor={t.stops[2]} />
        </LinearGradient>
        <LinearGradient id={`s${id}`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={t.shine} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100" height="140" fill={`url(#g${id})`} />
      {/* Glanzstreifen */}
      <Polygon points="30,0 52,0 12,140 -10,140" fill={`url(#s${id})`} />
      <Polygon points="62,0 70,0 30,140 22,140" fill={`url(#s${id})`} opacity={0.6} />
      {/* Muster je Stufe */}
      {tier === 'platin' &&
        [0, 1, 2, 3, 4, 5].map((i) => <Path key={i} d={`M${-20 + i * 24} 140 L${40 + i * 24} 0`} stroke="#E5E4E2" strokeOpacity={0.12} strokeWidth={0.6} />)}
      {tier === 'diamant' && (
        <>
          <Polygon points="78,8 84,16 78,24 72,16" fill="#FFFFFF" opacity={0.55} />
          <Polygon points="88,30 91,34 88,38 85,34" fill="#FFFFFF" opacity={0.45} />
          <Polygon points="12,112 16,118 12,124 8,118" fill="#FFFFFF" opacity={0.35} />
          <Circle cx="68" cy="34" r="1" fill="#FFFFFF" opacity={0.8} />
          <Circle cx="20" cy="96" r="0.8" fill="#FFFFFF" opacity={0.7} />
        </>
      )}
      {tier === 'gold' && <Circle cx="86" cy="12" r="22" fill="#FFFFFF" opacity={0.12} />}
    </Svg>
  );
}

/** Spielerkarte im Stil eines Sammelkarten-Spiels, gefärbt nach Kartenstufe */
export function PlayerCard({ data, showQr = false, compact = false }: { data: CardData; showQr?: boolean; compact?: boolean }) {
  const tier = tierFor(data.overall);
  const t = TIER_STYLE[tier.id];
  const isGk = data.position === 'Tor';
  const attrs = CATEGORIES.filter((c) => (isGk ? c.id !== 'kopf' : c.id !== 'torwart')).slice(0, 6);

  return (
    <View
      accessibilityLabel={`Spielerkarte ${data.nickname}, ${tier.label}, Gesamtwertung ${data.overall}`}
      style={{ borderRadius: 28, padding: compact ? 18 : 22, gap: 14, borderWidth: 2, borderColor: t.edge, overflow: 'hidden' }}>
      <CardBackground tier={tier.id} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <Text style={{ fontFamily: Font.number, fontSize: compact ? 64 : 84, lineHeight: compact ? 64 : 84, color: t.text }}>{data.overall}</Text>
          <Text style={{ fontFamily: Font.label, fontSize: 16, letterSpacing: 2, color: t.text }}>{POS_SHORT[data.position ?? ''] ?? '—'}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4, flexShrink: 1 }}>
          <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: t.line, backgroundColor: 'rgba(255,255,255,0.12)' }}>
            <Text style={{ fontFamily: Font.label, fontSize: 11, letterSpacing: 1.5, color: t.text }}>{tier.label.toUpperCase()}</Text>
          </View>
          {data.jersey != null && <Text style={{ fontFamily: Font.number, fontSize: 32, color: t.text }}>#{data.jersey}</Text>}
          {!!data.club && (
            <Text numberOfLines={2} style={{ fontFamily: Font.semibold, fontSize: 12, color: t.sub, textAlign: 'right' }}>
              {data.club}
              {data.team ? ` · ${data.team}` : ''}
            </Text>
          )}
        </View>
      </View>

      <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: Font.display, fontSize: compact ? 34 : 44, color: t.text, textTransform: 'uppercase' }}>
        {data.nickname}
      </Text>
      <View style={{ height: 1, backgroundColor: t.line }} />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 }}>
        {attrs.map((c) => (
          <View key={c.id} style={{ width: '33.33%', flexDirection: 'row', alignItems: 'baseline', gap: 6 }} accessibilityLabel={`${c.label} ${data.attributes[c.id] ?? 35}`}>
            <Text style={{ fontFamily: Font.number, fontSize: 26, color: t.text }}>{data.attributes[c.id] ?? 35}</Text>
            <Text style={{ fontFamily: Font.label, fontSize: 12, letterSpacing: 1.5, color: t.sub }}>{ATTR_SHORT[c.id]}</Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View>
          <Text style={{ fontFamily: Font.label, fontSize: 10, letterSpacing: 1.5, color: t.sub }}>GO4PRO-ID</Text>
          <Text selectable style={{ fontFamily: Font.number, fontSize: 20, letterSpacing: 1, color: t.text }}>
            {data.go4proId}
          </Text>
        </View>
        {showQr && (
          <View style={{ padding: 8, borderRadius: 12, backgroundColor: '#FFFFFF' }} accessibilityLabel="QR-Code zur Spielerkarte">
            <QRCode value={playerLink(data.go4proId)} size={compact ? 72 : 96} backgroundColor="#FFFFFF" color="#0A0D12" />
          </View>
        )}
      </View>
    </View>
  );
}

/** Kleine Hochkant-Karte für die Startseite */
export function MiniCard({ data, onPress, width = 132 }: { data: CardData; onPress?: () => void; width?: number }) {
  const tier = tierFor(data.overall);
  const t = TIER_STYLE[tier.id];
  const isGk = data.position === 'Tor';
  const attrs = CATEGORIES.filter((c) => (isGk ? c.id !== 'kopf' : c.id !== 'torwart')).slice(0, 6);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Deine Karte: ${tier.label}, Gesamtwertung ${data.overall}. Öffnen`}
      onPress={onPress}
      style={({ pressed }) => ({
        width,
        aspectRatio: 0.72,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: t.edge,
        overflow: 'hidden',
        padding: 12,
        justifyContent: 'space-between',
        opacity: pressed ? 0.9 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}>
      <CardBackground tier={tier.id} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <Text style={{ fontFamily: Font.number, fontSize: 44, lineHeight: 44, color: t.text }}>{data.overall}</Text>
          <Text style={{ fontFamily: Font.label, fontSize: 12, letterSpacing: 1.5, color: t.text }}>{POS_SHORT[data.position ?? ''] ?? '—'}</Text>
        </View>
        {data.jersey != null && <Text style={{ fontFamily: Font.number, fontSize: 18, color: t.text }}>#{data.jersey}</Text>}
      </View>
      <View style={{ gap: 4 }}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: Font.display, fontSize: 20, color: t.text, textTransform: 'uppercase' }}>
          {data.nickname}
        </Text>
        <View style={{ height: 1, backgroundColor: t.line }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {attrs.map((c) => (
            <Text key={c.id} style={{ width: '50%', fontFamily: Font.number, fontSize: 12, color: t.text }}>
              {data.attributes[c.id] ?? 35} <Text style={{ fontFamily: Font.label, fontSize: 9, color: t.sub }}>{ATTR_SHORT[c.id]}</Text>
            </Text>
          ))}
        </View>
        <Text style={{ fontFamily: Font.label, fontSize: 9, letterSpacing: 1.5, color: t.sub }}>{tier.label.toUpperCase()}</Text>
      </View>
    </Pressable>
  );
}

/** Alle sechs Stufen mit festen Grenzen; die eigene ist hervorgehoben */
export function TierLadder({ overall }: { overall: number }) {
  const theme = useTheme();
  const current = tierFor(overall);
  const next = nextTier(overall);
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {TIERS.map((tr) => {
          const st = TIER_STYLE[tr.id];
          const active = tr.id === current.id;
          const reached = overall >= tr.min;
          return (
            <View key={tr.id} style={{ flex: 1, alignItems: 'center', gap: 4 }} accessibilityLabel={`${tr.label} ${tr.min} bis ${tr.max}${active ? ', deine Stufe' : ''}`}>
              <View
                style={{
                  width: '100%',
                  height: active ? 34 : 24,
                  borderRadius: 8,
                  overflow: 'hidden',
                  borderWidth: active ? 2 : 1,
                  borderColor: active ? theme.primary : st.edge,
                  opacity: reached ? 1 : 0.35,
                }}>
                <CardBackground tier={tr.id} />
              </View>
              <Text numberOfLines={1} style={{ fontFamily: active ? Font.black : Font.semibold, fontSize: 10, color: active ? theme.text : theme.textSecondary }}>
                {tr.id === 'platin' ? 'Platin' : tr.id === 'diamant' ? 'Diamond' : tr.label}
              </Text>
              <Text style={{ fontFamily: Font.medium, fontSize: 9, color: theme.textSecondary }}>
                {tr.min}–{tr.max}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={{ fontFamily: Font.medium, fontSize: 13, color: theme.textSecondary }}>
        {next ? (
          <>
            Du bist <Text style={{ fontFamily: Font.black, color: theme.text }}>{current.label}</Text>. Noch{' '}
            <Text style={{ fontFamily: Font.black, color: theme.primary }}>{next.missing}</Text> {next.missing === 1 ? 'Punkt' : 'Punkte'} bis{' '}
            {next.tier.label}.
          </>
        ) : (
          <>
            <Text style={{ fontFamily: Font.black, color: theme.text }}>Diamond-Blue</Text> – die höchste Stufe!
          </>
        )}
      </Text>
    </View>
  );
}

/** Farben einer Stufe für kleine Elemente (Chips, Zahlen im Kader) */
export function useTierColors(tier: Tier) {
  const t = TIER_STYLE[tier] ?? TIER_STYLE.weiss;
  return { edge: t.edge, text: t.chip, on: t.chipText, from: t.stops[1] };
}
