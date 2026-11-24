import { Platform, Text, View, type ViewStyle } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Font } from '@/constants/theme';
import { CATEGORIES } from '@/data/exercises';
import { useTheme } from '@/hooks/use-theme';
import { playerLink, type Tier } from '@/lib/rating';
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
  tier: Tier;
  attributes: Partial<Record<Category, number>>;
  go4proId: string;
  ageGroup?: string | null;
}

/** Farben je Kartenstufe: Bronze 35–49, Silber 50–64, Gold 65–79 */
export function useTierColors(tier: Tier) {
  const theme = useTheme();
  if (tier === 'gold') return { edge: theme.gold, from: '#4A3A0B', text: theme.gold, on: theme.onGold };
  if (tier === 'silber') return { edge: theme.silber, from: '#3A4450', text: theme.silber, on: theme.onSilber };
  return { edge: theme.bronze, from: '#4A2A12', text: theme.bronzeText, on: theme.onBronze };
}

/** Spielerkarte im Stil eines Sammelkarten-Spiels */
export function PlayerCard({ data, showQr = false, compact = false }: { data: CardData; showQr?: boolean; compact?: boolean }) {
  const theme = useTheme();
  const tc = useTierColors(data.tier);
  const isGk = data.position === 'Tor';
  const attrs = CATEGORIES.filter((c) => (isGk ? c.id !== 'kopf' : c.id !== 'torwart')).slice(0, 6);
  const bg =
    Platform.OS === 'web'
      ? ({
          backgroundImage: `linear-gradient(160deg, ${tc.from} 0%, ${theme.backgroundElement} 62%), repeating-linear-gradient(115deg, rgba(255,255,255,0.03) 0 14px, transparent 14px 34px)`,
        } as unknown as ViewStyle)
      : { backgroundColor: theme.backgroundElement };

  return (
    <View
      accessibilityLabel={`Spielerkarte ${data.nickname}, Gesamtwertung ${data.overall}`}
      style={[{ borderRadius: 28, padding: compact ? 18 : 22, gap: 14, borderWidth: 2, borderColor: tc.edge, overflow: 'hidden' }, bg]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <Text style={{ fontFamily: Font.number, fontSize: compact ? 64 : 80, lineHeight: compact ? 64 : 80, color: tc.text }}>{data.overall}</Text>
          <Text style={{ fontFamily: Font.label, fontSize: 16, letterSpacing: 2, color: theme.text }}>{POS_SHORT[data.position ?? ''] ?? '—'}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4, flexShrink: 1 }}>
          <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: tc.edge }}>
            <Text style={{ fontFamily: Font.label, fontSize: 11, letterSpacing: 1.5, color: tc.on }}>{data.tier.toUpperCase()}</Text>
          </View>
          {data.jersey != null && <Text style={{ fontFamily: Font.number, fontSize: 32, color: theme.text }}>#{data.jersey}</Text>}
          {!!data.club && (
            <Text numberOfLines={2} style={{ fontFamily: Font.medium, fontSize: 12, color: theme.textSecondary, textAlign: 'right' }}>
              {data.club}
              {data.team ? ` · ${data.team}` : ''}
            </Text>
          )}
        </View>
      </View>

      <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: Font.display, fontSize: compact ? 34 : 42, color: theme.text, textTransform: 'uppercase' }}>
        {data.nickname}
      </Text>
      <View style={{ height: 1, backgroundColor: tc.edge, opacity: 0.5 }} />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 }}>
        {attrs.map((c) => (
          <View key={c.id} style={{ width: '33.33%', flexDirection: 'row', alignItems: 'baseline', gap: 6 }} accessibilityLabel={`${c.label} ${data.attributes[c.id] ?? 35}`}>
            <Text style={{ fontFamily: Font.number, fontSize: 26, color: theme.text }}>{data.attributes[c.id] ?? 35}</Text>
            <Text style={{ fontFamily: Font.label, fontSize: 12, letterSpacing: 1.5, color: theme.textSecondary }}>{ATTR_SHORT[c.id]}</Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View>
          <Text style={{ fontFamily: Font.label, fontSize: 10, letterSpacing: 1.5, color: theme.textSecondary }}>GO4PRO-ID</Text>
          <Text selectable style={{ fontFamily: Font.number, fontSize: 20, letterSpacing: 1, color: theme.text }}>
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
