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
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [p, s] = await Promise.all([
      supabase.rpc('admin_open_payments'),
      supabase.from('app_settings').select('key,value'),
    ]);
    setPayments((p.data as OpenPayment[]) ?? []);
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
