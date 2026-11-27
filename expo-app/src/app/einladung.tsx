import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button, Card, Field, H, Label, Logo, Row, Screen, T } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useStore } from '@/lib/store';
import { errorText, supabase } from '@/lib/supabase';

interface Info {
  found: boolean;
  kind?: 'club_admin' | 'org_admin' | 'super_admin' | 'player_access';
  name?: string;
  email_hint?: string;
  target_name?: string;
  status?: 'offen' | 'angenommen' | 'abgelaufen' | 'zurückgezogen';
  email_matches?: boolean;
}

const ROLE = { club_admin: 'Vereins-Admin', org_admin: 'Admin', super_admin: 'Super-Admin', player_access: 'Dein Spieler-Zugang' } as const;

/** Bestätigungsseite einer Admin-Einladung (Double-Opt-In): anmelden mit der eingeladenen E-Mail, dann annehmen */
export default function Einladung() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { session, sendCode, verifyCode, signOut } = useAuth();
  const { refresh, refreshStaff } = useStore();
  const theme = useTheme();
  const [info, setInfo] = useState<Info | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('invite_info', { p_token: String(token ?? '') });
    setInfo((data as Info) ?? { found: false });
  }, [token]);
  useEffect(() => {
    load();
  }, [load, session]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ text: errorText(e), ok: false });
    } finally {
      setBusy(false);
    }
  };

  const accept = () =>
    run(async () => {
      const { data, error } = await supabase.rpc('accept_invite', { p_token: String(token) });
      if (error) throw error;
      setMsg({ text: 'Bestätigt! Deine Rechte sind jetzt aktiv.', ok: true });
      await Promise.all([refresh(), refreshStaff()]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = data as any;
      setTimeout(() => {
        if (r?.kind === 'player_access') router.replace('/');
        else if (r?.kind === 'club_admin' && r.target_id) router.replace({ pathname: '/verein/[id]', params: { id: r.target_id } });
        else router.replace('/verwaltung');
      }, 900);
    });

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <Screen bottomBar={false}>
      <Row style={{ gap: 10 }}>
        <Logo size={36} />
        <H size={28}>
          Go<H size={28} color="primary">4</H>Pro
        </H>
      </Row>

      {!info ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
      ) : !info.found ? (
        <Card>
          <H size={26}>Einladung nicht gefunden</H>
          <T color="textSecondary">Der Link ist unvollständig oder ungültig. Bitte den Link aus der Mail vollständig öffnen.</T>
        </Card>
      ) : (
        <>
          <Card style={{ gap: 8, borderColor: theme.primary }}>
            <Label color="primary">Einladung</Label>
            <H size={30}>{ROLE[info.kind!]}</H>
            <T>
              für <T weight="800">{info.target_name}</T>
            </T>
            <T size={13} color="textSecondary">
              Eingeladen: {info.name} ({info.email_hint})
            </T>
          </Card>

          {info.status !== 'offen' ? (
            <Card>
              <T weight="700">Diese Einladung ist {info.status}.</T>
              {info.status === 'angenommen' ? (
                <Button title="Zur App" onPress={() => router.replace(info.kind === 'player_access' ? '/' : info.kind === 'club_admin' ? '/trainer' : '/verwaltung')} />
              ) : (
                <T size={13} color="textSecondary">
                  Bitte die einladende Person, dich erneut einzuladen.
                </T>
              )}
            </Card>
          ) : !session ? (
            <Card style={{ gap: 10 }}>
              <T weight="700">Schritt 1: Mit der eingeladenen E-Mail anmelden</T>
              <T size={13} color="textSecondary">
                Zur Sicherheit bestätigst du deine Adresse mit einem Code, den wir dir per Mail schicken.
              </T>
              {!sent ? (
                <>
                  <Field label="E-Mail-Adresse" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder={info.email_hint} />
                  <Button title={busy ? 'Sende …' : 'Code senden'} disabled={!validEmail || busy} onPress={() => run(async () => (await sendCode(email), setSent(true)))} />
                </>
              ) : (
                <>
                  <Field label="Code aus der E-Mail" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={8} placeholder="123456" />
                  <Button title={busy ? 'Prüfe …' : 'Anmelden'} disabled={code.trim().length < 6 || busy} onPress={() => run(() => verifyCode(email, code))} />
                  <Button title="Andere E-Mail" variant="secondary" onPress={() => (setSent(false), setCode(''))} />
                </>
              )}
            </Card>
          ) : info.email_matches ? (
            <Card style={{ gap: 10 }}>
              <T weight="700">Schritt 2: Einladung annehmen</T>
              <T size={13} color="textSecondary">
                {info.kind === 'player_access'
                  ? `Damit trägst du dein Training als „${info.target_name}“ selbst ein und kannst andere bewerten. Deine Eltern behalten den Überblick.`
                  : `Mit dem Annehmen bekommst du die Rechte als ${ROLE[info.kind!]} für ${info.target_name}. Du kannst sie jederzeit wieder abgeben.`}
              </T>
              <Button title={busy ? 'Bestätige …' : 'Einladung annehmen'} disabled={busy} onPress={accept} />
            </Card>
          ) : (
            <Card style={{ gap: 10, borderColor: theme.danger }}>
              <T weight="700">Falsches Konto</T>
              <T size={13} color="textSecondary">
                Du bist mit einer anderen E-Mail angemeldet. Die Einladung gilt nur für {info.email_hint}.
              </T>
              <Button title="Abmelden und neu anmelden" variant="secondary" onPress={() => signOut()} />
            </Card>
          )}
          {msg && (
            <Card style={{ borderColor: msg.ok ? theme.success : theme.danger }}>
              <T size={14}>{msg.text}</T>
            </Card>
          )}
        </>
      )}
      <View style={{ height: 20 }} />
    </Screen>
  );
}
