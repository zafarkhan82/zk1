import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Card, Label, Row, T } from '@/components/ui';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

interface TableData {
  staffel: { name: string; art: string; age_group: string; updated: string | null } | null;
  rows: { platz: number; team: string; spiele: number; tore: string; diff: number; punkte: number; mine: boolean }[];
}

/** Tabelle der Staffel (aus den offiziellen DFB-Daten) */
export function LeagueTable({ teamId }: { teamId: string }) {
  const theme = useTheme();
  const [data, setData] = useState<TableData | null>(null);
  useEffect(() => {
    supabase.rpc('team_table', { p_team: teamId }).then(({ data: d }) => setData((d as TableData) ?? null));
  }, [teamId]);
  if (!data?.staffel || data.rows.length === 0) return null;
  const head = { fontFamily: Font.label, fontSize: 10, letterSpacing: 1, color: theme.textSecondary } as const;
  return (
    <Card style={{ gap: 6 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Label>Tabelle</Label>
        <T size={11} color="textSecondary">
          {data.staffel.updated ? `Stand ${new Date(data.staffel.updated).toLocaleDateString('de-DE')}` : ''}
        </T>
      </Row>
      <T size={13} weight="700">
        {data.staffel.age_group}-Junioren {data.staffel.name}
      </T>
      <Row style={{ paddingVertical: 4 }}>
        <Text style={[head, { width: 26 }]}>#</Text>
        <Text style={[head, { flex: 1 }]}>TEAM</Text>
        <Text style={[head, { width: 28, textAlign: 'right' }]}>SP</Text>
        <Text style={[head, { width: 52, textAlign: 'right' }]}>TORE</Text>
        <Text style={[head, { width: 34, textAlign: 'right' }]}>PKT</Text>
      </Row>
      {data.rows.map((r) => (
        <View
          key={r.platz + r.team}
          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 4, marginHorizontal: -4, borderRadius: 8, backgroundColor: r.mine ? theme.primarySoft : 'transparent' }}>
          <Text style={{ width: 26, fontFamily: Font.number, fontSize: 15, color: r.mine ? theme.primary : theme.text }}>{r.platz}</Text>
          <Text numberOfLines={1} style={{ flex: 1, fontFamily: r.mine ? Font.black : Font.semibold, fontSize: 14, color: r.mine ? theme.primary : theme.text }}>
            {r.team}
          </Text>
          <Text style={{ width: 28, textAlign: 'right', fontFamily: Font.medium, fontSize: 13, color: theme.textSecondary }}>{r.spiele}</Text>
          <Text style={{ width: 52, textAlign: 'right', fontFamily: Font.medium, fontSize: 13, color: theme.textSecondary }}>{r.tore}</Text>
          <Text style={{ width: 34, textAlign: 'right', fontFamily: Font.number, fontSize: 16, color: theme.text }}>{r.punkte}</Text>
        </View>
      ))}
      <T size={11} color="textSecondary">
        Quelle: offizielle DFB-Daten
      </T>
    </Card>
  );
}
