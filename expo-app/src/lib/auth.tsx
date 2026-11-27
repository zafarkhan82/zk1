import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export type SocialProvider = 'google' | 'apple';

interface Auth {
  ready: boolean;
  session: Session | null;
  sendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  signInWith: (provider: SocialProvider) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<Auth | null>(null);

function redirectUrl() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.href.split('#')[0].split('?')[0];
  return Linking.createURL('/');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<Auth>(
    () => ({
      ready,
      session,
      sendCode: async (email) => {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim().toLowerCase(),
          options: { shouldCreateUser: true, emailRedirectTo: redirectUrl() },
        });
        if (error) throw error;
      },
      verifyCode: async (email, code) => {
        const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
        if (error) throw error;
      },
      signInWith: async (provider) => {
        if (Platform.OS === 'web') {
          const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: redirectUrl() } });
          if (error) throw error;
          return;
        }
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo: redirectUrl(), skipBrowserRedirect: true },
        });
        if (error) throw error;
        const res = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl());
        if (res.type !== 'success') return;
        const code = new URL(res.url).searchParams.get('code');
        if (code) {
          const { error: e2 } = await supabase.auth.exchangeCodeForSession(code);
          if (e2) throw e2;
        }
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [ready, session],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const a = useContext(Ctx);
  if (!a) throw new Error('useAuth außerhalb von AuthProvider');
  return a;
}
