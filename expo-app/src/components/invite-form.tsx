import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { StatusTag } from '@/components/org-ui';
import { Button, Field, Row, T } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { errorText, supabase } from '@/lib/supabase';

export type InviteKind = 'club_admin' | 'org_admin' | 'super_admin';

interface Invite {
  id: string;
  email: string;
  name: string;
  created_at: string;
  sent_at: string | null;
  send_count: number;
  status: 'offen' | 'angenommen' | 'abgelaufen' | 'zurückgezogen';
}

/** Admin per Name + E-Mail einladen (Double-Opt-In) und offene Einladungen verwalten */
export function InviteBox({ kind, targetId, label, compact }: { kind: InviteKind; targetId: string | null; label: string; compact?: boolean }) {
  const theme = useTheme();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('list_invites', { p_kind: kind, p_target: targetId });
    setInvites((data as Invite[]) ?? []);
  }, [kind, targetId]);
  useEffect(() => {
    load();
  }, [load]);

  const send = async (n: string, e: string) => {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.functions.invoke('send-invite', { body: { kind, target_id: targetId, email: e, name: n } });
    setBusy(false);
    if (error) {
      let text = errorText(error);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ctx = (error as any).context;
        if (ctx?.json) text = (await ctx.json()).error ?? text;
      } catch {
        /* Standardmeldung */
      }
      setMsg({ text, ok: false });
      return false;
    }
    setMsg({ text: `Einladung an ${e} verschickt. Die Rechte gelten erst nach Bestätigung.`, ok: true });
    load();
    return true;
  };

  const valid = name.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const open = invites.filter((i) => i.status !== 'angenommen');

  return (
    <View style={{ gap: 8 }}>
      {open.map((i) => (
        <View key={i.id} style={{ gap: 6, padding: 10, borderRadius: 12, backgroundColor: theme.backgroundSelected }}>
          <Row style={{ justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T size={13} weight="700" numberOfLines={1}>
                {i.name}
              </T>
              <T size={12} color="textSecondary" numberOfLines={1}>
                {i.email} · {new Date(i.created_at).toLocaleDateString('de-DE')}
              </T>
            </View>
            <StatusTag text={i.status === 'offen' ? 'wartet' : i.status} tone={i.status === 'offen' ? 'warn' : 'off'} />
          </Row>
          {i.status !== 'zurückgezogen' && (
            <Row style={{ gap: 8 }}>
              <Button title="Erneut senden" variant="secondary" disabled={busy} onPress={() => send(i.name, i.email)} style={{ flex: 1, minHeight: 34, paddingHorizontal: 10 }} />
              {i.status === 'offen' && (
                <Button
                  title="Zurückziehen"
                  variant="danger"
                  onPress={async () => {
                    await supabase.rpc('revoke_invite', { p_invite: i.id });
                    load();
                  }}
                  style={{ flex: 1, minHeight: 34, paddingHorizontal: 10 }}
                />
              )}
            </Row>
          )}
        </View>
      ))}
      <View style={{ flexDirection: compact ? 'column' : 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Field label="Name" value={name} onChangeText={setName} placeholder="Vor- und Nachname" maxLength={100} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="E-Mail" value={email} onChangeText={setEmail} placeholder="name@verein.de" keyboardType="email-address" autoCapitalize="none" />
        </View>
      </View>
      <Button
        title={busy ? 'Sende Einladung …' : label}
        variant="secondary"
        disabled={!valid || busy}
        onPress={async () => {
          if (await send(name.trim(), email.trim())) {
            setName('');
            setEmail('');
          }
        }}
      />
      {msg && <T size={13} style={{ color: msg.ok ? theme.success : theme.danger }}>{msg.text}</T>}
      <T size={11} color="textSecondary">
        Double-Opt-In: Die Person bekommt eine Mail, meldet sich mit genau dieser Adresse an und bestätigt. Erst dann gelten die Rechte.
      </T>
    </View>
  );
}
