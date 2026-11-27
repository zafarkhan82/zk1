import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { StatusTag } from '@/components/org-ui';
import { Button, Card, Label, Row, T } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { ROLE, stars, type RaterRole } from '@/lib/ratings';
import { supabase } from '@/lib/supabase';

/** Gemeldete Bewertungen: Trainer*innen und Admins blenden unfaire Bewertungen aus */
export function ReportedRatings() {
  const theme = useTheme();
  const [list, setList] = useState<{ id: string; rated: string; avg: number; role: RaterRole; rater: string | null; at: string }[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabase.rpc('reported_ratings');
    setList((data as typeof list) ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  if (!list.length) return null;
  return (
    <Card style={{ gap: 10, borderColor: theme.danger, borderWidth: 1 }}>
      <Label style={{ color: theme.danger }}>Gemeldete Bewertungen ({list.length})</Label>
      {list.map((r) => (
        <Row key={r.id} style={{ gap: 8 }}>
          <View style={{ flex: 1 }}>
            <T size={14} weight="700">
              {r.rater ?? ROLE[r.role]} → {r.rated}
            </T>
            <T size={12} color="textSecondary">
              {ROLE[r.role]} · {stars(r.avg)} Sterne
            </T>
          </View>
          <Button title="Ausblenden" variant="danger" style={{ minHeight: 34, paddingHorizontal: 12 }} onPress={async () => (await supabase.rpc('hide_rating', { p_rating: r.id }), load())} />
        </Row>
      ))}
    </Card>
  );
}

/** Partner-Anmeldungen freigeben (Super-Admin) */
export function PartnerReview() {
  const theme = useTheme();
  const [list, setList] = useState<{ id: string; name: string; category: string; description: string; website: string | null; email: string; owner: string; status: string; vouchers: number }[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabase.rpc('admin_partners');
    setList((data as typeof list) ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <Card style={{ gap: 10 }}>
      <Label>Partner ({list.filter((p) => p.status === 'pending').length} warten)</Label>
      {list.length === 0 && <T size={13} color="textSecondary">Noch keine Partner-Anmeldungen.</T>}
      {list.map((p) => (
        <View key={p.id} style={{ gap: 6, padding: 10, borderRadius: 12, backgroundColor: theme.backgroundSelected }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T weight="700" style={{ flex: 1 }}>
              {p.name}
            </T>
            <StatusTag text={p.status === 'approved' ? 'frei' : p.status === 'pending' ? 'wartet' : 'abgelehnt'} tone={p.status === 'approved' ? 'ok' : p.status === 'pending' ? 'warn' : 'off'} />
          </Row>
          <T size={12} color="textSecondary">
            {p.category} · {p.email} · Konto {p.owner} · {p.vouchers} Gutscheine
          </T>
          {!!p.description && <T size={13}>{p.description}</T>}
          {!!p.website && <T size={12} color="primary">{p.website}</T>}
          {p.status !== 'approved' && (
            <Row style={{ gap: 8 }}>
              <Button title="Freigeben" style={{ flex: 1, minHeight: 36 }} onPress={async () => (await supabase.rpc('review_partner', { p_partner: p.id, p_accept: true }), load())} />
              {p.status === 'pending' && (
                <Button title="Ablehnen" variant="danger" style={{ flex: 1, minHeight: 36 }} onPress={async () => (await supabase.rpc('review_partner', { p_partner: p.id, p_accept: false }), load())} />
              )}
            </Row>
          )}
          {p.status === 'approved' && (
            <Button title="Sperren" variant="secondary" style={{ minHeight: 34 }} onPress={async () => (await supabase.rpc('review_partner', { p_partner: p.id, p_accept: false }), load())} />
          )}
        </View>
      ))}
    </Card>
  );
}
