import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

// Öffentliche Werte: Der "publishable key" ist für die App gedacht. Den Zugriff regeln die
// Zugriffsregeln (Row Level Security) in der Datenbank.
export const SUPABASE_URL = 'https://scbpjeqkdapjxvbhbuli.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Q0S1f345pn0Ca4lj9TWE9Q_tTCvt3M3';

// Speicher, der auch in Browsern ohne Zugriff auf localStorage nicht abstürzt.
const safeStorage = {
  getItem: async (k: string) => {
    try {
      return await AsyncStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: async (k: string, v: string) => {
    try {
      await AsyncStorage.setItem(k, v);
    } catch {
      // ignorieren
    }
  },
  removeItem: async (k: string) => {
    try {
      await AsyncStorage.removeItem(k);
    } catch {
      // ignorieren
    }
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: safeStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
    flowType: 'pkce',
  },
});

/** Fehlermeldungen von Supabase in verständliches Deutsch übersetzen. */
export function errorText(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (/provider is not enabled/i.test(msg)) return 'Diese Anmeldeart ist noch nicht eingerichtet.';
  if (/rate limit/i.test(msg)) return 'Zu viele Versuche. Bitte warte ein paar Minuten.';
  if (/token has expired|invalid/i.test(msg) && /otp|token/i.test(msg)) return 'Der Code ist falsch oder abgelaufen.';
  if (/Failed to fetch|Network request failed/i.test(msg)) return 'Keine Verbindung zum Server.';
  return msg;
}
