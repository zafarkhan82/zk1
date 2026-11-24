import { Redirect } from 'expo-router';
import { TabList, Tabs, TabSlot, TabTrigger } from 'expo-router/ui';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button, H } from '@/components/ui';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useStore } from '@/lib/store';

const TABS: { name: string; href: '/' | '/training' | '/team' | '/profil' }[] = [
  { name: 'index', href: '/' },
  { name: 'training', href: '/training' },
  { name: 'team', href: '/team' },
  { name: 'profil', href: '/profil' },
];

export default function TabLayout() {
  const { session } = useAuth();
  const { players, ready, loadError, refresh, hasStaffRequests, isAdmin } = useStore();
  const theme = useTheme();

  if (!session) return <Redirect href="/login" />;
  if (!ready) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} size="large" />
        <Text style={{ color: theme.textSecondary, fontFamily: Font.medium }}>Lade deine Daten …</Text>
      </View>
    );
  }
  if (loadError && players.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background, padding: 24 }]}>
        <H size={32} style={{ textAlign: 'center' }}>
          Keine Verbindung
        </H>
        <Text style={{ color: theme.textSecondary, textAlign: 'center', fontFamily: Font.medium }}>
          Deine Daten konnten nicht geladen werden. Prüfe dein Internet.
        </Text>
        <Button title="Erneut versuchen" onPress={() => refresh()} />
      </View>
    );
  }
  if (players.length === 0) return <Redirect href={hasStaffRequests && !isAdmin ? '/trainer' : '/onboarding'} />;

  // Das sichtbare Menü kommt aus dem Root-Layout (AppNav) und ist auf allen Seiten gleich.
  // Die Tab-Leiste hier registriert nur die Tab-Routen und bleibt unsichtbar.
  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />
      <TabList style={{ display: 'none' }}>
        {TABS.map((t) => (
          <TabTrigger key={t.name} name={t.name} href={t.href} />
        ))}
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
});
