import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { StoreProvider, useStore } from '@/lib/store';

SplashScreen.preventAutoHideAsync();

function RootStack() {
  const auth = useAuth();
  const store = useStore();
  const ready = auth.ready && (!auth.session || store.ready);
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

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
