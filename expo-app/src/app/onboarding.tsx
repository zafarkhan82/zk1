import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Checkbox, Chip, Field, Screen, T, Wrap } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { AGE_GROUP_LABEL, ageGroupFor, allowedBirthYears, uClass } from '@/lib/age';
import { useAdminScope } from '@/lib/org';
import { useStore } from '@/lib/store';
import { errorText, supabase } from '@/lib/supabase';
import type { Position } from '@/lib/types';

const POSITIONS: Position[] = ['Tor', 'Abwehr', 'Mittelfeld', 'Sturm', 'Noch offen'];

export default function CreatePlayer() {
  const { createPlayer, players, appMode } = useStore();
  const params = useLocalSearchParams<{ rolle?: string }>();
  const mode = params.rolle === 'spieler' || params.rolle === 'eltern' ? params.rolle : appMode === 'spieler' || appMode === 'eltern' ? appMode : null;
  const theme = useTheme();
  const { hasAny } = useAdminScope();
  const [forSelf, setForSelf] = useState(mode === 'spieler');
  const [nickname, setNickname] = useState('');
  const [birthYear, setBirthYear] = useState<number | null>(null);
  const [position, setPosition] = useState<Position>('Noch offen');
  const [consent, setConsent] = useState(false);
  const [publicConsent, setPublicConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [parentSent, setParentSent] = useState(false);

  const group = birthYear ? ageGroupFor(birthYear) : null;
  const u = birthYear ? uClass(birthYear) : 0;
  // Eigenes Konto erst ab 16: Jahrgang konservativ (mind. 17 im laufenden Kalenderjahr), wie in der Datenbank
  const selfTooYoung = forSelf && birthYear !== null && new Date().getFullYear() - birthYear < 17;
  const valid = nickname.trim().length >= 2 && group !== null && consent && !selfTooYoung;

  const submit = async () => {
    if (!valid || !birthYear) return;
    setBusy(true);
    setError('');
    try {
      await createPlayer({ nickname: nickname.trim(), birthYear, position, forSelf, publicConsent });
      router.replace('/');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen bottomBar={false} topInset={false}>
      {hasAny && (
        <Card onPress={() => router.push('/verwaltung')} style={{ borderColor: theme.primary }}>
          <T weight="700">Zur Verwaltung</T>
          <T size={13} color="textSecondary">
            Du verwaltest ein Bundesland, einen Verband oder einen Kreis. Ein Kind musst du dafür nicht anlegen.
          </T>
        </Card>
      )}
      {players.length === 0 && (
        <View style={{ gap: Spacing.one }}>
          <T size={24} weight="800">
            Willkommen! 👋
          </T>
          <T color="textSecondary">
            {mode === 'spieler'
              ? 'Lege dein eigenes Spielerprofil an.'
              : mode === 'eltern'
                ? 'Lege dein Kind an. Weitere Kinder kannst du später jederzeit hinzufügen.'
                : 'Lege jetzt den Spieler an, dessen Entwicklung ihr festhalten wollt.'}
          </T>
        </View>
      )}

      <Card onPress={() => router.push('/rolle')}>
        <T weight="700">Falsche Rolle?</T>
        <T size={14} color="textSecondary">
          Du bist Trainer*in oder Admin? Dann brauchst du kein Spielerprofil – tippe hier, um deine Rolle zu ändern.
        </T>
      </Card>

      {!mode && (
      <Card>
        <T weight="700">Für wen ist das Profil?</T>
        <Wrap>
          <Chip label="👨‍👩‍👧 Mein Kind" selected={!forSelf} onPress={() => setForSelf(false)} />
          <Chip label="🙋 Für mich (ab 16)" selected={forSelf} onPress={() => setForSelf(true)} />
        </Wrap>
      </Card>
      )}

      <Card>
        <Field
          label="Spitzname"
          placeholder="z. B. Flitzer10"
          value={nickname}
          onChangeText={setNickname}
          maxLength={20}
          autoCapitalize="none"
        />
        <T size={12} color="textSecondary">
          Der Spitzname ist in Ranglisten sichtbar. Bitte keinen vollen echten Namen verwenden.
        </T>
      </Card>

      <Card>
        <T weight="700">Jahrgang</T>
        <Wrap>
          {allowedBirthYears().map((y) => (
            <Chip key={y} label={String(y)} selected={birthYear === y} onPress={() => setBirthYear(y)} />
          ))}
        </Wrap>
        {birthYear && group && (
          <T color="textSecondary" size={14}>
            Spielt diese Saison {AGE_GROUP_LABEL[group]} (U{u}).
          </T>
        )}
        {selfTooYoung && (
          <View style={{ gap: 10, marginTop: 6, padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: theme.primary }}>
            <T weight="700">Unter 16 brauchst du die Zustimmung deiner Eltern</T>
            <T size={13} color="textSecondary">
              Schick deinen Eltern eine Mail: Sie legen dich in der App an und richten dir mit einem Tipp deinen eigenen Zugang ein.
              Dann trackst du dich selbst und bewertest andere.
            </T>
            {parentSent ? (
              <T size={14} weight="700" style={{ color: theme.success }}>
                Mail an deine Eltern ist unterwegs. Sobald sie den Zugang eingerichtet haben, bekommst du eine Einladung per Mail.
              </T>
            ) : (
              <>
                <Field label="E-Mail deiner Eltern" value={parentEmail} onChangeText={setParentEmail} keyboardType="email-address" autoCapitalize="none" placeholder="mama@beispiel.de" />
                <Button
                  title={busy ? 'Sende …' : 'Eltern um Zugang bitten'}
                  disabled={busy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail.trim())}
                  onPress={async () => {
                    setBusy(true);
                    setError('');
                    const { error: e } = await supabase.functions.invoke('request-parent', {
                      body: { parent_email: parentEmail.trim(), child_name: nickname.trim() || 'Dein Kind' },
                    });
                    setBusy(false);
                    if (e) {
                      let text = errorText(e);
                      try {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const ctx = (e as any).context;
                        if (ctx?.json) text = (await ctx.json()).error ?? text;
                      } catch {
                        /* Standardmeldung */
                      }
                      return setError(text);
                    }
                    setParentSent(true);
                  }}
                />
              </>
            )}
          </View>
        )}
      </Card>

      <Card>
        <T weight="700">Lieblingsposition</T>
        <Wrap>
          {POSITIONS.map((p) => (
            <Chip key={p} label={p} selected={position === p} onPress={() => setPosition(p)} />
          ))}
        </Wrap>
      </Card>

      <Card>
        <T weight="700">{forSelf ? 'Einverständnis' : 'Einverständnis der Eltern'}</T>
        <Checkbox
          checked={consent}
          onChange={setConsent}
          label={
            forSelf
              ? 'Ich stimme der Nutzung zu und habe die Datenschutzerklärung gelesen.'
              : 'Ich bin erziehungsberechtigt und stimme zu, dass mein Kind die App nutzt.'
          }
        />
        <Checkbox
          checked={publicConsent}
          onChange={setPublicConsent}
          label="Optional: Ab der C-Jugend dürfen Spitzname, Jahrgang, Verein und freigegebene Leistungen in Ranglisten erscheinen (nur mit Premium). Jederzeit widerrufbar."
        />
      </Card>

      {!!error && (
        <T size={14} style={{ color: theme.danger }}>
          {error}
        </T>
      )}
      <Button title={busy ? 'Speichere …' : "Los geht's!"} onPress={submit} disabled={!valid || busy} />
    </Screen>
  );
}
