import { DarkTheme, DefaultTheme, ThemeProvider, type ErrorBoundaryProps } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
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
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  // Nur beim allerersten Start warten. Danach bleibt die Navigation immer stehen –
  // spätere Ladezustände (z. B. nach dem Anmelden) zeigen die Screens selbst an.
  const [booted, setBooted] = useState(false);
  const initialReady = auth.ready && (!auth.session || store.ready);
  useEffect(() => {
    if (initialReady && !booted) {
      setBooted(true);
      SplashScreen.hideAsync();
    }
  }, [initialReady, booted]);

  if (!booted) return null;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.background },
        headerTintColor: c.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: c.background },
        headerBackTitle: 'Zurück',
      }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="onboarding" options={{ title: 'Spieler anlegen' }} />
      <Stack.Screen name="uebung/[id]" options={{ title: 'Übung' }} />
      <Stack.Screen name="eintrag" options={{ title: 'Neuer Tagebucheintrag', presentation: 'modal' }} />
      <Stack.Screen name="premium" options={{ title: 'Premium', presentation: 'modal' }} />
      <Stack.Screen name="team" options={{ title: 'Mein Team' }} />
      <Stack.Screen name="admin" options={{ title: 'Admin' }} />
      <Stack.Screen name="trainer/index" options={{ title: 'Trainer-Bereich' }} />
      <Stack.Screen name="trainer/team/[id]" options={{ title: 'Team' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <StoreProvider>
          <RootStack />
        </StoreProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
