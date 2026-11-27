import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { pickSquareImage } from '@/lib/image';
import { errorText } from '@/lib/supabase';

const HUES = ['#19E3FF', '#F5C84B', '#7CE38B', '#FF8A65', '#B39DFF', '#4FC3F7', '#F48FB1'];

/** Profilbild oder Initialen */
export function Avatar({ uri, name, size = 40, ring }: { uri?: string | null; name?: string | null; size?: number; ring?: string }) {
  const theme = useTheme();
  const n = (name ?? '?').trim() || '?';
  const hue = HUES[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];
  const initials = n.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: uri ? theme.backgroundSelected : hue + '33',
        borderWidth: ring ? 2 : 0,
        borderColor: ring,
      }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />
      ) : (
        <Text style={{ color: hue, fontFamily: Font.number, fontSize: size * 0.42 }}>{initials}</Text>
      )}
    </View>
  );
}

/** Profilbild antippen zum Ändern. Speichert stark verkleinert (160×160 JPEG) über onSave. */
export function AvatarPicker({ uri, name, size = 88, onSave }: { uri?: string | null; name?: string | null; size?: number; onSave: (data: string | null) => Promise<void> }) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pick = async () => {
    setErr('');
    const d = await pickSquareImage(160, 0.72);
    if (d === null) return;
    if (d === 'error') return setErr('Das Bild konnte nicht gelesen werden. Bitte ein anderes Foto wählen.');
    setBusy(true);
    try {
      await onSave(d);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Profilbild ändern" onPress={pick} disabled={busy} style={({ pressed }) => ({ opacity: pressed || busy ? 0.7 : 1 })}>
        <Avatar uri={uri} name={name} size={size} ring={theme.primary} />
        <View style={{ position: 'absolute', right: -2, bottom: -2, width: 30, height: 30, borderRadius: 15, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: theme.background }}>
          <Text style={{ color: theme.primaryText, fontFamily: Font.black, fontSize: 16, marginTop: -2 }}>{busy ? '…' : '+'}</Text>
        </View>
      </Pressable>
      {!!uri && !busy && (
        <Pressable accessibilityRole="button" onPress={() => onSave(null)} hitSlop={6}>
          <Text style={{ color: theme.textSecondary, fontFamily: Font.medium, fontSize: 12 }}>Bild entfernen</Text>
        </Pressable>
      )}
      {!!err && <Text style={{ color: theme.danger, fontFamily: Font.medium, fontSize: 12, textAlign: 'center' }}>{err}</Text>}
    </View>
  );
}
