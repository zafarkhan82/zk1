import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { Button, Card, Row, Screen, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useStore } from '@/lib/store';
import { errorText, supabase } from '@/lib/supabase';

const FREE = [
  'Trainingstagebuch',
  'Alle Übungen selbst eintragen (Bronze bis Gold)',
  'Punkte, Level, Skills und Abzeichen',
  'Team beitreten, Team-Challenges auf Bronze',
  'Spielberichte des eigenen Teams',
];

const PREMIUM = [
  'Leistungen vom Trainer bestätigen lassen',
  'Bewertungen durch Trainer',
  'Bewertungen durch Mitspieler und Gegner',
  'Challenges ab Silber',
  'Challenges mit Spielern anderer Vereine',
  'Öffentliche Ranglisten: lokal, regional, national, international',
];

interface Order {
  reference: string;
  amount_cents: number;
  status: 'offen' | 'bezahlt' | 'storniert';
  bank_holder: string;
  bank_iban: string;
  bank_bic: string;
  bank_name: string;
}

const euro = (cents: number) => (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const formatIban = (iban: string) => iban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();

function CopyRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);
  const canCopy = Platform.OS === 'web' && typeof navigator !== 'undefined' && !!navigator.clipboard;
  return (
    <View style={{ gap: 2 }}>
      <T size={12} color="textSecondary">
        {label}
      </T>
      <Row style={{ justifyContent: 'space-between' }}>
        <T weight="700" style={{ flex: 1 }}>
          {value || '—'}
        </T>
        {canCopy && !!value && (
          <Pressable
            onPress={() => {
              navigator.clipboard.writeText(label === 'IBAN' ? value.replace(/\s+/g, '') : value).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
            style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: theme.backgroundSelected }}>
            <T size={12} weight="700">
              {copied ? '✓ kopiert' : 'Kopieren'}
            </T>
          </Pressable>
        )}
      </Row>
    </View>
  );
}

export default function Premium() {
  const { state, premium } = useStore();
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const name = state.profile?.nickname ?? 'deinen Spieler';

  const startTransfer = async () => {
    if (!state.profile) return;
    setBusy(true);
    setError('');
    try {
      const { data, error: e } = await supabase.rpc('create_payment_order', { p_player: state.profile.id });
      if (e) throw e;
      setOrder((data as Order[])[0] ?? null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const bankMissing = order && !order.bank_iban;

  return (
    <Screen bottomBar={false} topInset={false}>
      <View style={{ alignItems: 'center', gap: Spacing.one }}>
        <T size={44}>⭐</T>
        <T size={26} weight="800">
          Go4Pro Premium
        </T>
        <T color="textSecondary" style={{ textAlign: 'center' }}>
          Für {name}: zeig deine Leistung über das Team hinaus.
        </T>
      </View>

      {premium ? (
        <Card style={{ borderColor: theme.primary, borderWidth: 2 }}>
          <T weight="800">✅ Premium ist aktiv</T>
          <T size={14} color="textSecondary">
            Alle Funktionen sind für {name} freigeschaltet.
          </T>
        </Card>
      ) : !order ? (
        <Card style={{ borderColor: theme.accent, borderWidth: 2, alignItems: 'center' }}>
          <T size={36} weight="800">
            20 €
          </T>
          <T color="textSecondary">pro Kind und Jahr</T>
          <Button title={busy ? 'Einen Moment …' : 'Per Überweisung bezahlen'} onPress={startTransfer} disabled={busy} style={{ alignSelf: 'stretch' }} />
          {!!error && (
            <T size={13} style={{ color: theme.danger, textAlign: 'center' }}>
              {error}
            </T>
          )}
        </Card>
      ) : (
        <Card style={{ borderColor: theme.accent, borderWidth: 2 }}>
          <T weight="800" size={18}>
            🏦 So bezahlst du
          </T>
          <T size={14} color="textSecondary">
            Überweise den Betrag mit genau diesem Verwendungszweck. Premium wird nach Zahlungseingang freigeschaltet
            (meist 1–3 Werktage).
          </T>
          <View style={{ backgroundColor: theme.primarySoft, borderRadius: 12, padding: Spacing.three, gap: 2 }}>
            <T size={12} color="textSecondary">
              Verwendungszweck
            </T>
            <T size={22} weight="800" style={{ letterSpacing: 1 }}>
              {order.reference}
            </T>
          </View>
          <CopyRow label="Verwendungszweck" value={order.reference} />
          <CopyRow label="Betrag" value={euro(order.amount_cents)} />
          <CopyRow label="Empfänger" value={order.bank_holder} />
          <CopyRow label="IBAN" value={formatIban(order.bank_iban)} />
          {!!order.bank_bic && <CopyRow label="BIC" value={order.bank_bic} />}
          {!!order.bank_name && <CopyRow label="Bank" value={order.bank_name} />}
          {bankMissing && (
            <T size={13} style={{ color: theme.danger }}>
              Die Bankverbindung wird gerade hinterlegt. Bitte schau in Kürze noch einmal hier vorbei – der Verwendungszweck
              bleibt gleich.
            </T>
          )}
          <T size={12} color="textSecondary">
            Status: {order.status === 'offen' ? '⏳ Zahlung offen' : order.status === 'bezahlt' ? '✅ bezahlt' : 'storniert'}
          </T>
        </Card>
      )}

      <Card>
        <T weight="700">⭐ Premium</T>
        {PREMIUM.map((f) => (
          <Row key={f} style={{ alignItems: 'flex-start' }}>
            <T size={14}>⭐</T>
            <T size={14} style={{ flex: 1 }}>
              {f}
            </T>
          </Row>
        ))}
      </Card>

      <Card>
        <T weight="700">Immer kostenlos (team-intern)</T>
        {FREE.map((f) => (
          <Row key={f} style={{ alignItems: 'flex-start' }}>
            <T size={14}>✓</T>
            <T size={14} style={{ flex: 1 }}>
              {f}
            </T>
          </Row>
        ))}
      </Card>

      <T size={12} color="textSecondary">
        Premium gilt ein Jahr ab Zahlungseingang und verlängert sich nicht automatisch.
      </T>
    </Screen>
  );
}
