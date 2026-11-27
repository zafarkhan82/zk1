import { Text, View } from 'react-native';

import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { RankRow } from '@/lib/ranking';

/** Eine Zeile der Rangliste. Platz 1–3 in Gold, Silber, Bronze; die eigene Zeile hervorgehoben. */
export function RankLine({ row, showClub }: { row: RankRow; showClub: boolean }) {
  const theme = useTheme();
  const medal = row.rank === 1 ? theme.gold : row.rank === 2 ? theme.silber : row.rank === 3 ? theme.bronze : null;
  return (
    <View
      accessibilityLabel={`Platz ${row.rank}: ${row.nickname}, ${row.points} Punkte`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 58,
        paddingHorizontal: 14,
        borderRadius: 16,
        backgroundColor: row.isMe ? theme.primarySoft : theme.backgroundElement,
        borderWidth: row.isMe ? 1.5 : 0,
        borderColor: theme.primary,
      }}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: medal ?? theme.backgroundSelected,
        }}>
        <Text style={{ fontFamily: Font.number, fontSize: 18, color: medal ? '#14110A' : theme.text }}>{row.rank}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: Font.bold, fontSize: 16, color: theme.text }}>
          {row.isMe ? `${row.nickname} (du)` : row.nickname}
        </Text>
        {showClub && (
          <Text numberOfLines={1} style={{ fontFamily: Font.medium, fontSize: 12, color: theme.textSecondary }}>
            {row.clubName} · {row.teamName}
          </Text>
        )}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontFamily: Font.number, fontSize: 22, color: row.isMe ? theme.primary : theme.text }}>
          {row.points.toLocaleString('de-DE')}
        </Text>
        <Text style={{ fontFamily: Font.label, fontSize: 10, letterSpacing: 1.5, color: theme.textSecondary }}>PUNKTE</Text>
      </View>
    </View>
  );
}
