import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, Card, Field, Screen, T } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth, type SocialProvider } from '@/lib/auth';
import { errorText } from '@/lib/supabase';

export default function Login() {
  const { session, sendCode, verifyCode, signInWith } = useAuth();
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (session) return <Redirect href="/" />;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const social = (p: SocialProvider, label: string, icon: string, dark: boolean) => (
    <Pressable
      disabled={busy}
      onPress={() => run(() => signInWith(p))}
      style={({ pressed }) => ({
        minHeight: 50,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: dark ? '#000' : theme.backgroundElement,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.two,
        opacity: pressed ? 0.8 : 1,
      })}>
      {!!icon && <Text style={{ fontSize: 18, fontWeight: '800', color: dark ? '#fff' : theme.text }}>{icon}</Text>}
      <Text style={{ fontSize: 16, fontWeight: '700', color: dark ? '#fff' : theme.text }}>{label}</Text>
    </Pressable>
  );

  return (
    <Screen bottomBar={false}>
      <View style={{ alignItems: 'center', gap: Spacing.two, marginTop: Spacing.four }}>
        <T size={56}>⚽</T>
        <T size={30} weight="800" style={{ textAlign: 'center' }}>
          Kick-Tagebuch
        </T>
        <T color="textSecondary" style={{ textAlign: 'center' }}>
          Trainieren, Punkte sammeln, vom Trainer bestätigen lassen.
        </T>
      </View>

      <Card>
        <T weight="700">Anmelden oder registrieren</T>
        <T size={13} color="textSecondary">
          Für Kinder unter 16 meldet sich ein Elternteil an und legt das Kind als Spieler an.
        </T>
        {social('google', 'Weiter mit Google', 'G', false)}
        {social('apple', 'Weiter mit Apple', '', true)}
      </Card>

      <Card>
        <T weight="700">Oder mit E-Mail</T>
        {!sent ? (
          <>
            <Field
              label="E-Mail-Adresse"
              placeholder="name@beispiel.de"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />
            <Button title={busy ? 'Sende …' : 'Anmelde-Link senden'} disabled={!validEmail || busy} onPress={() => run(async () => {
              await sendCode(email);
              setSent(true);
            })} />
          </>
        ) : (
          <>
            <T size={14}>
              Wir haben dir eine E-Mail an <T weight="700" size={14}>{email.trim()}</T> geschickt. Tippe auf den Link darin – oder gib
              den Code aus der E-Mail hier ein.
            </T>
            <Field
              label="Code aus der E-Mail"
              placeholder="123456"
              keyboardType="number-pad"
              value={code}
              onChangeText={setCode}
              maxLength={8}
            />
            <Button title={busy ? 'Prüfe …' : 'Anmelden'} disabled={code.trim().length < 6 || busy} onPress={() => run(() => verifyCode(email, code))} />
            <Button title="Andere E-Mail verwenden" variant="secondary" onPress={() => {
              setSent(false);
              setCode('');
            }} />
          </>
        )}
      </Card>

      {!!error && (
        <Card style={{ borderColor: theme.danger }}>
          <T size={14} style={{ color: theme.danger }}>
            {error}
          </T>
        </Card>
      )}

      <T size={12} color="textSecondary" style={{ textAlign: 'center' }}>
        Mit der Anmeldung akzeptierst du die Nutzungsbedingungen und die Datenschutzerklärung.
      </T>
    </Screen>
  );
}
