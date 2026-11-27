import { BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed/700Bold';
import { BarlowCondensed_800ExtraBold } from '@expo-google-fonts/barlow-condensed/800ExtraBold';
import { BarlowCondensed_800ExtraBold_Italic } from '@expo-google-fonts/barlow-condensed/800ExtraBold_Italic';
import { BarlowCondensed_900Black_Italic } from '@expo-google-fonts/barlow-condensed/900Black_Italic';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Inter_800ExtraBold } from '@expo-google-fonts/inter/800ExtraBold';
import { useFonts } from 'expo-font';
import { DarkTheme, ThemeProvider, type ErrorBoundaryProps } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { AppNav, StaffNav } from '@/components/app-nav';
import { LiveRatingToast } from '@/components/live-ratings';
import { StartAnimation } from '@/components/splash';
import { Colors } from '@/constants/theme';
import { SIDE_NAV_WIDTH, useLayout } from '@/hooks/use-layout';
import { AuthProvider, useAuth } from '@/lib/auth';
import { StoreProvider, useStore } from '@/lib/store';

SplashScreen.preventAutoHideAsync();

/** Statt einer weißen Seite: Fehler anzeigen und Neuladen anbieten. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 80, gap: 16 }} style={{ backgroundColor: '#F4F7F5' }}>
      <Text style={{ fontSize: 40 }}>🤕</Text>
      <Text style={{ fontSize: 22, fontWeight: '800', color: '#0E1A12' }}>Da ist etwas schiefgelaufen</Text>
      <Text style={{ fontSize: 14, color: '#5B6B61' }}>Bitte mach einen Screenshot dieser Seite, damit wir den Fehler beheben können.</Text>
      <Text selectable style={{ fontSize: 13, color: '#C93A3A', fontFamily: Platform.select({ web: 'monospace', default: undefined }) }}>
        {error.name}: {error.message}
        {'\n\n'}
        {(error.stack ?? '').split('\n').slice(0, 6).join('\n')}
      </Text>
      <Pressable
        onPress={() => {
          if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.reload();
          else retry();
        }}
        style={{ backgroundColor: '#118C4F', borderRadius: 14, padding: 14, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Neu laden</Text>
      </Pressable>
    </ScrollView>
  );
}

function RootStack() {
  const auth = useAuth();
  const store = useStore();
  const c = Colors.dark;
  const [fontsLoaded, fontError] = useFonts({
    BarlowCondensed_700Bold,
    BarlowCondensed_800ExtraBold,
    BarlowCondensed_800ExtraBold_Italic,
    BarlowCondensed_900Black_Italic,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  // Nur beim allerersten Start warten. Danach bleibt die Navigation immer stehen –
  // spätere Ladezustände (z. B. nach dem Anmelden) zeigen die Screens selbst an.
  const [booted, setBooted] = useState(false);
  const [intro, setIntro] = useState(true);
  const pathname = usePathname() || '/';
  const { sideNav } = useLayout();
  // Menü auf allen Seiten – außer Anmeldung und Spieler-Anlage (dort gibt es noch nichts zu navigieren)
  const hidden = ['/login', '/onboarding', '/einladung', '/rolle'].includes(pathname) || pathname.startsWith('/p/');
  const showNav = !!auth.session && store.ready && store.players.length > 0 && !hidden;
  // Trainer*innen und Admins ohne eigenes Spielerprofil bekommen ein eigenes Menü
  const showStaffNav =
    !!auth.session && store.ready && store.players.length === 0 && !hidden &&
    (store.appMode === 'trainer' || store.appMode === 'admin' || store.isOrgAdmin || store.hasStaffRequests);
  const initialReady = (fontsLoaded || !!fontError) && auth.ready && (!auth.session || store.ready);
  useEffect(() => {
    if (initialReady && !booted) {
      setBooted(true);
      SplashScreen.hideAsync();
    }
  }, [initialReady, booted]);

  if (!booted) return null;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ flex: 1, paddingLeft: (showNav || showStaffNav) && sideNav ? SIDE_NAV_WIDTH : 0 }}>
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.background },
        headerTintColor: c.text,
        headerTitleStyle: { fontFamily: 'BarlowCondensed_800ExtraBold_Italic', fontSize: 22 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: c.background },
        headerBackTitle: 'Zurück',
      }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="onboarding" options={{ title: 'Spieler anlegen' }} />
      <Stack.Screen name="uebung/[id]" options={{ title: 'Übung' }} />
      <Stack.Screen name="eintrag" options={{ title: 'Neuer Tagebucheintrag' }} />
      <Stack.Screen name="premium" options={{ title: 'Premium' }} />
      <Stack.Screen name="tagebuch" options={{ title: 'Tagebuch' }} />
      <Stack.Screen name="challenges" options={{ title: 'Challenges' }} />
      <Stack.Screen name="verlauf" options={{ title: 'Verlauf', headerTitle: '' }} />
      <Stack.Screen name="rangliste" options={{ title: 'Rangliste', headerTitle: '' }} />
      <Stack.Screen name="nachrichten" options={{ title: 'Nachrichten', headerTitle: '' }} />
      <Stack.Screen name="nachricht-neu" options={{ title: 'Nachricht schreiben' }} />
      <Stack.Screen name="werbung" options={{ title: 'Werbung' }} />
      <Stack.Screen name="verwaltung/index" options={{ title: 'Verwaltung', headerTitle: '' }} />
      <Stack.Screen name="verwaltung/[id]" options={{ title: 'Gebiet', headerTitle: '' }} />
      <Stack.Screen name="admin" options={{ title: 'Admin' }} />
      <Stack.Screen name="trainer/index" options={{ title: 'Trainer-Bereich' }} />
      <Stack.Screen name="trainer/team/[id]" options={{ title: 'Team' }} />
      <Stack.Screen name="verein/[id]" options={{ title: 'Verein' }} />
      <Stack.Screen name="karte" options={{ title: 'Spielerkarte', headerTitle: '' }} />
      <Stack.Screen name="einladung" options={{ title: 'Einladung', headerShown: false }} />
      <Stack.Screen name="rolle" options={{ title: 'Rolle', headerShown: false }} />
      <Stack.Screen name="konto" options={{ title: 'Konto', headerShown: false }} />
      <Stack.Screen name="spieler/[code]" options={{ title: 'Spieler', headerTitle: '' }} />
      <Stack.Screen name="bewerten" options={{ title: 'Bewerten', headerTitle: '' }} />
      <Stack.Screen name="bewertungen" options={{ title: 'Bewertungen', headerTitle: '' }} />
      <Stack.Screen name="begegnung-neu" options={{ title: 'Begegnung', headerTitle: '' }} />
      <Stack.Screen name="punkte" options={{ title: 'Punkte', headerTitle: '' }} />
      <Stack.Screen name="partner" options={{ title: 'Partner', headerTitle: '' }} />
      <Stack.Screen name="sponsoring" options={{ title: 'Sponsoring', headerTitle: '' }} />
      <Stack.Screen name="seite" options={{ title: 'Meine Seite', headerTitle: '' }} />
      <Stack.Screen name="p/[slug]" options={{ title: 'Go4Pro', headerShown: false }} />
    </Stack>
      </View>
      {showNav && <AppNav />}
      {showStaffNav && <StaffNav showVerwaltung={store.isOrgAdmin} />}
      {!!auth.session && <LiveRatingToast playerId={store.players.length ? (store.state.profile?.id ?? null) : null} />}
      {intro && !pathname.startsWith('/p/') && <StartAnimation onDone={() => setIntro(false)} />}
    </View>
  );
}

const NavTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: Colors.dark.background, card: Colors.dark.background, text: Colors.dark.text, primary: Colors.dark.primary, border: Colors.dark.border },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={NavTheme}>
      <AuthProvider>
        <StoreProvider>
          <RootStack />
        </StoreProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
