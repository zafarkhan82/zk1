import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, Card, Field, Label, Row, T } from '@/components/ui';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { PendingClub } from '@/lib/org';

/** An/Aus-Schalter mit Beschriftung */
export function ActiveToggle({ active, onChange, disabled }: { active: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: active, disabled }}
      disabled={disabled}
      onPress={() => onChange(!active)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, opacity: disabled ? 0.5 : 1 }}>
      <View style={{ width: 44, height: 26, borderRadius: 13, padding: 3, backgroundColor: active ? theme.success : theme.backgroundSelected }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', marginLeft: active ? 18 : 0 }} />
      </View>
      <Text style={{ fontFamily: Font.semibold, fontSize: 12, color: active ? theme.success : theme.textSecondary }}>{active ? 'aktiv' : 'deaktiviert'}</Text>
    </Pressable>
  );
}

/** Statusmarke */
export function StatusTag({ text, tone }: { text: string; tone: 'ok' | 'warn' | 'off' }) {
  const theme = useTheme();
  const bg = tone === 'ok' ? theme.success : tone === 'warn' ? theme.gold : theme.backgroundSelected;
  const fg = tone === 'warn' ? theme.onGold : tone === 'ok' ? '#fff' : theme.textSecondary;
  return (
    <View style={{ borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: bg }}>
      <Text style={{ fontFamily: Font.label, fontSize: 10, letterSpacing: 1, color: fg }}>{text.toUpperCase()}</Text>
    </View>
  );
}

/** Admin per E-Mail hinzufügen */
export function AddByEmail({ label, onAdd }: { label: string; onAdd: (email: string) => Promise<string | null> }) {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  return (
    <View style={{ gap: 8 }}>
      <Field label={label} placeholder="name@verein.de" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <Button
        title={busy ? 'Füge hinzu …' : 'Hinzufügen'}
        variant="secondary"
        disabled={!valid || busy}
        onPress={async () => {
          setBusy(true);
          const err = await onAdd(email.trim());
          setBusy(false);
          setMsg(err ? { text: err, ok: false } : { text: 'Hinzugefügt.', ok: true });
          if (!err) setEmail('');
        }}
      />
      {msg && <T size={13} style={{ color: msg.ok ? theme.success : theme.danger }}>{msg.text}</T>}
      <T size={12} color="textSecondary">
        Die Person muss sich vorher einmal mit dieser E-Mail-Adresse bei Go4Pro angemeldet haben.
      </T>
    </View>
  );
}

/** Offene Vereinsanfrage mit Freigeben/Ablehnen */
export function PendingClubCard({ c, onReview }: { c: PendingClub; onReview: (accept: boolean) => void }) {
  return (
    <Card style={{ gap: 8 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Label color="primary">Vereinsanfrage</Label>
        <T size={12} color="textSecondary">
          {new Date(c.at).toLocaleDateString('de-DE')}
        </T>
      </Row>
      <T weight="700">{c.name}</T>
      <T size={13} color="textSecondary">
        {[c.postal && c.city ? `${c.postal} ${c.city}` : c.city, c.kreis && `Kreis ${c.kreis}`, c.verband, c.dfb && `Vereinsnr. ${c.dfb}`]
          .filter(Boolean)
          .join(' · ')}
      </T>
      {!!c.requested_by && (
        <T size={13} color="textSecondary">
          Angefragt von {c.requested_by}
        </T>
      )}
      <Row>
        <Button title="Freigeben" onPress={() => onReview(true)} style={{ flex: 1 }} />
        <Button title="Ablehnen" variant="danger" onPress={() => onReview(false)} style={{ flex: 1 }} />
      </Row>
    </Card>
  );
}
