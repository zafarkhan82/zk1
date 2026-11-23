import { Redirect, router } from 'expo-router';
import { TabList, Tabs, TabSlot, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View, type PressableProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icons';
import { Button, H } from '@/components/ui';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useStore } from '@/lib/store';

type IconName = 'Home' | 'Ball' | 'Shield' | 'User';
const TABS: { name: string; href: '/' | '/training' | '/team' | '/profil'; label: string; icon: IconName }[] = [
  { name: 'index', href: '/', label: 'Heute', icon: 'Home' },
  { name: 'training', href: '/training', label: 'Training', icon: 'Ball' },
  { name: 'team', href: '/team', label: 'Team', icon: 'Shield' },
  { name: 'profil', href: '/profil', label: 'Ich', icon: 'User' },
];

export default function TabLayout() {
  const { session } = useAuth();
  const { players, ready, loadError, refresh, hasStaffRequests } = useStore();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState(false);

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
  if (players.length === 0) return <Redirect href={hasStaffRequests ? '/trainer' : '/onboarding'} />;

  const go = (path: '/training' | '/eintrag' | '/trainer') => {
    setSheet(false);
    router.push(path);
  };

  return (
    <>
      <Tabs>
        <TabSlot style={{ flex: 1 }} />
        <TabList style={[styles.bar, { backgroundColor: theme.bar, borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, 10) }]}>
          {TABS.slice(0, 2).map((t) => (
            <TabTrigger key={t.name} name={t.name} href={t.href} asChild>
              <TabButton icon={t.icon} label={t.label} />
            </TabTrigger>
          ))}
          <View style={styles.tab}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Eintragen"
              onPress={() => setSheet(true)}
              style={({ pressed }) => [styles.plus, { backgroundColor: theme.primary, opacity: pressed ? 0.85 : 1 }]}>
              <View style={{ transform: [{ rotate: '-45deg' }] }}>
                <Icon.Plus size={28} color={theme.primaryText} />
              </View>
            </Pressable>
          </View>
          {TABS.slice(2).map((t) => (
            <TabTrigger key={t.name} name={t.name} href={t.href} asChild>
              <TabButton icon={t.icon} label={t.label} />
            </TabTrigger>
          ))}
        </TabList>
      </Tabs>

      <Modal visible={sheet} transparent animationType="slide" onRequestClose={() => setSheet(false)}>
        <Pressable style={styles.backdrop} onPress={() => setSheet(false)} accessibilityLabel="Schließen">
          <Pressable style={[styles.sheet, { backgroundColor: theme.backgroundElement, paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
            <H size={34}>Was hast du gemacht?</H>
            <SheetItem primary icon={<Icon.Ball size={26} color={theme.primaryText} />} label="Übung eintragen" onPress={() => go('/training')} />
            <SheetItem icon={<Icon.Diary size={26} color={theme.text} />} label="Tagebuch-Eintrag" onPress={() => go('/eintrag')} />
            <SheetItem icon={<Icon.Whistle size={26} color={theme.text} />} label="Als Trainer*in eintragen" onPress={() => go('/trainer')} />
            <Pressable onPress={() => setSheet(false)} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: theme.textSecondary, fontFamily: Font.semibold, fontSize: 15 }}>Abbrechen</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function SheetItem({ icon, label, onPress, primary }: { icon: ReactNode; label: string; onPress: () => void; primary?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.sheetItem,
        {
          backgroundColor: primary ? theme.primary : 'transparent',
          borderColor: primary ? theme.primary : theme.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      {icon}
      <Text style={{ color: primary ? theme.primaryText : theme.text, fontFamily: primary ? Font.black : Font.bold, fontSize: 17 }}>{label}</Text>
    </Pressable>
  );
}

function TabButton({ icon, label, isFocused, ...props }: TabTriggerSlotProps & { icon: IconName; label: string }) {
  const theme = useTheme();
  const color = isFocused ? theme.primary : theme.textSecondary;
  const I = Icon[icon];
  return (
    <Pressable
      {...(props as PressableProps)}
      style={styles.tab}
      accessibilityRole="tab"
      accessibilityState={{ selected: !!isFocused }}
      accessibilityLabel={label}>
      <I size={24} color={color} strokeWidth={isFocused ? 2.4 : 2} />
      <Text style={{ fontSize: 11, fontFamily: isFocused ? Font.black : Font.semibold, color }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 8,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3, minHeight: 52 },
  plus: {
    width: 58,
    height: 58,
    marginTop: -26,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '45deg' }],
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 12 },
  sheetItem: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 66, paddingHorizontal: 18, borderRadius: 20, borderWidth: 1.5 },
});
