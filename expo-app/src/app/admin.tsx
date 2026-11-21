import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Field, Row, Screen, SectionTitle, T } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useStore } from '@/lib/store';
import { errorText, supabase } from '@/lib/supabase';

interface OpenPayment {
  reference: string;
  nickname: string;
  amount_cents: number;
  payer_email: string;
  created_at: string;
}

const SETTINGS: { key: string; label: string; placeholder: string }[] = [
  { key: 'bank_holder', label: 'Kontoinhaber', placeholder: 'Vor- und Nachname bzw. Firma' },
  { key: 'bank_iban', label: 'IBAN', placeholder: 'DE00 0000 0000 0000 0000 00' },
  { key: 'bank_bic', label: 'BIC (optional)', placeholder: '' },
  { key: 'bank_name', label: 'Bank (optional)', placeholder: '' },
  { key: 'support_email', label: 'Kontakt-E-Mail', placeholder: 'kontakt@…' },
  { key: 'premium_price_cents', label: 'Preis in Cent', placeholder: '2000' },
];

export default function Admin() {
  const { isAdmin } = useStore();
  const theme = useTheme();
  const [payments, setPayments] = useState<OpenPayment[]>([]);
  const [pendingClubs, setPendingClubs] = useState<{ club_id: string; name: string; city: string | null; association: string | null; dfb_club_number: string | null; requested_by: string | null }[]>([]);
  const [clubs, setClubs] = useState<{ club_id: string; name: string; city: string | null; license_until: string | null; teams: number; players: number }[]>([]);
  const [licRef, setLicRef] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [p, s, pc, cl] = await Promise.all([
      supabase.rpc('admin_open_payments'),
      supabase.from('app_settings').select('key,value'),
      supabase.rpc('admin_pending_clubs'),
      supabase.rpc('admin_clubs'),
    ]);
    setPayments((p.data as OpenPayment[]) ?? []);
    setPendingClubs((pc.data as typeof pendingClubs) ?? []);
    setClubs((cl.data as typeof clubs) ?? []);
    const map: Record<string, string> = {};
    ((s.data as { key: string; value: string }[]) ?? []).forEach((r) => (map[r.key] = r.value));
    setSettings(map);
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  if (!isAdmin) {
    return (
      <Screen bottomBar={false} topInset={false}>
        <T>Kein Zugriff.</T>
      </Screen>
    );
  }

  const confirm = async (ref: string) => {
    setBusy(true);
    setMsg('');
    try {
      const { data, error } = await supabase.rpc('confirm_payment', { p_reference: ref });
      if (error) throw error;
      setMsg(`✅ ${ref} bestätigt – Premium bis ${new Date(data as string).toLocaleDateString('de-DE')}`);
      await load();
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const reviewClub = async (id: string, accept: boolean) => {
    setMsg('');
    const { error } = await supabase.rpc('admin_review_club', { p_club: id, p_accept: accept });
    setMsg(error ? errorText(error) : accept ? '✅ Verein freigegeben' : 'Verein abgelehnt');
    load();
  };

  const grantLicense = async (id: string) => {
    setMsg('');
    const { data, error } = await supabase.rpc('grant_club_license', {
      p_club: id,
      p_months: 12,
      p_reference: licRef[id] || null,
      p_amount_cents: null,
    });
    setMsg(error ? errorText(error) : `✅ Vereinslizenz bis ${new Date(data as string).toLocaleDateString('de-DE')}`);
    load();
  };

  const saveSettings = async () => {
    setBusy(true);
    setMsg('');
    try {
      for (const s of SETTINGS) {
        const value = (settings[s.key] ?? '').trim();
        const { error } = await supabase.from('app_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', s.key);
        if (error) throw error;
      }
      setMsg('✅ Einstellungen gespeichert');
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen bottomBar={false} topInset={false}>
      {!!msg && (
        <Card style={{ borderColor: theme.primary }}>
          <T size={14}>{msg}</T>
        </Card>
      )}

      <SectionTitle right={<Button title="↻" variant="secondary" onPress={load} style={{ minHeight: 34, paddingHorizontal: 14 }} />}>
        Offene Zahlungen ({payments.length})
      </SectionTitle>
      {payments.length === 0 && (
        <Card>
          <T size={14} color="textSecondary">
            Keine offenen Zahlungen.
          </T>
        </Card>
      )}
      {payments.map((p) => (
        <Card key={p.reference}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T weight="800">{p.reference}</T>
            <T weight="700">{(p.amount_cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</T>
          </Row>
          <T size={13} color="textSecondary">
            {p.nickname} · {p.payer_email} · {new Date(p.created_at).toLocaleDateString('de-DE')}
          </T>
          <Button title="Zahlung eingegangen → Premium freischalten" disabled={busy} onPress={() => confirm(p.reference)} />
        </Card>
      ))}

      <SectionTitle>Neue Vereine ({pendingClubs.length})</SectionTitle>
      {pendingClubs.length === 0 && (
        <Card>
          <T size={14} color="textSecondary">
            Keine Vereine zur Prüfung.
          </T>
        </Card>
      )}
      {pendingClubs.map((c) => (
        <Card key={c.club_id}>
          <T weight="800">{c.name}</T>
          <T size={13} color="textSecondary">
            {[c.city, c.association, c.dfb_club_number && `Nr. ${c.dfb_club_number}`, c.requested_by].filter(Boolean).join(' · ')}
          </T>
          <Row>
            <Button title="Freigeben" style={{ flex: 1 }} onPress={() => reviewClub(c.club_id, true)} />
            <Button title="Ablehnen" variant="danger" onPress={() => reviewClub(c.club_id, false)} />
          </Row>
        </Card>
      ))}

      <SectionTitle>Vereine & Lizenzen ({clubs.length})</SectionTitle>
      {clubs.map((c) => (
        <Card key={c.club_id}>
          <T weight="800">{c.name}</T>
          <T size={13} color="textSecondary">
            {c.city ? `${c.city} · ` : ''}
            {c.teams} Teams · {c.players} Spieler*innen ·{' '}
            {c.license_until && new Date(c.license_until) > new Date()
              ? `Lizenz bis ${new Date(c.license_until).toLocaleDateString('de-DE')}`
              : 'keine Lizenz'}
          </T>
          <Field
            label="Rechnungs-/Zahlungsreferenz (optional)"
            value={licRef[c.club_id] ?? ''}
            onChangeText={(v) => setLicRef((x) => ({ ...x, [c.club_id]: v }))}
          />
          <Button title="Vereinslizenz +12 Monate" variant="secondary" disabled={busy} onPress={() => grantLicense(c.club_id)} />
        </Card>
      ))}

      <SectionTitle>Bankverbindung & Preis</SectionTitle>
      <Card>
        {SETTINGS.map((s) => (
          <View key={s.key}>
            <Field
              label={s.label}
              placeholder={s.placeholder}
              value={settings[s.key] ?? ''}
              onChangeText={(v) => setSettings((x) => ({ ...x, [s.key]: v }))}
              autoCapitalize={s.key === 'bank_iban' || s.key === 'bank_bic' ? 'characters' : 'none'}
            />
          </View>
        ))}
        <Button title={busy ? 'Speichere …' : 'Speichern'} disabled={busy} onPress={saveSettings} />
      </Card>
    </Screen>
  );
}
