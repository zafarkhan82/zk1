import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { Icon } from '@/components/icons';
import { Button, Card, H, Label, Row, Screen, T } from '@/components/ui';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useStore } from '@/lib/store';

const ROLE_LABEL = { eltern: 'Elternteil', spieler: 'Spieler*in', trainer: 'Trainer*in', admin: 'Vereins-/Verbands-Admin' } as const;

/** Konto für Trainer*innen und Admins ohne eigenes Spielerprofil */
export default function Konto() {
  const { session, signOut } = useAuth();
  const { appMode, staff, isOrgAdmin, isAdmin, players } = useStore();
  const theme = useTheme();
  const clubs = Array.from(new Map(staff.filter((s) => s.membershipStatus === 'approved').map((s) => [s.clubId, s])).values());

  const Link = ({ label, hint, onPress }: { label: string; hint?: string; onPress: () => void }) => (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 58,
        paddingHorizontal: 18,
        borderRadius: 18,
        backgroundColor: theme.backgroundElement,
        opacity: pressed ? 0.85 : 1,
      })}>
      <Text style={{ color: theme.text, fontFamily: Font.bold, fontSize: 16 }}>{label}</Text>
      <Row style={{ gap: 6 }}>
        {!!hint && <Text style={{ color: theme.textSecondary, fontFamily: Font.medium, fontSize: 13 }}>{hint}</Text>}
        <Icon.Chevron color={theme.textSecondary} />
      </Row>
    </Pressable>
  );

  return (
    <Screen>
      <H size={44}>Konto</H>
      <Card>
        <Label>Angemeldet als</Label>
        <T weight="700">{session?.user.email}</T>
        <T size={13} color="textSecondary">
          Rolle: {appMode ? ROLE_LABEL[appMode] : 'noch nicht gewählt'}
          {isAdmin ? ' · Super-Admin' : ''}
        </T>
      </Card>

      {clubs.length > 0 && (
        <Card style={{ gap: 6 }}>
          <Label>Deine Vereine</Label>
          {clubs.map((c) => (
            <T key={c.clubId} size={14}>
              {c.clubName} · {c.role === 'club_admin' ? 'Admin' : 'Trainer*in'}
            </T>
          ))}
        </Card>
      )}

      <Link label="Trainer-Bereich" hint="Teams & Freigaben" onPress={() => router.navigate('/trainer')} />
      {isOrgAdmin && <Link label="Verwaltung" hint="Kreis, Verband, Bundesland" onPress={() => router.navigate('/verwaltung')} />}
      {isAdmin && <Link label="Admin-Bereich" hint="Zahlungen, Lizenzen, Werbung" onPress={() => router.push('/admin')} />}
      <Link label="Rolle ändern" onPress={() => router.push('/rolle')} />
      {players.length === 0 && <Link label="Kind anlegen" hint="als Elternteil" onPress={() => router.push({ pathname: '/onboarding', params: { rolle: 'eltern' } })} />}

      <Card>
        <Button title="Abmelden" variant="danger" onPress={() => signOut()} />
      </Card>
    </Screen>
  );
}
