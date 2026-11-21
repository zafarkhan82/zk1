import { Redirect } from 'expo-router';
import { TabList, Tabs, TabSlot, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type PressableProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useStore } from '@/lib/store';

const TABS = [
  { name: 'index', href: '/', label: 'Start', icon: '🏠' },
  { name: 'training', href: '/training', label: 'Training', icon: '⚽' },
  { name: 'tagebuch', href: '/tagebuch', label: 'Tagebuch', icon: '📓' },
  { name: 'challenges', href: '/challenges', label: 'Challenges', icon: '🏆' },
  { name: 'profil', href: '/profil', label: 'Profil', icon: '👤' },
] as const;

export default function TabLayout() {
  const { session } = useAuth();
  const { players, ready } = useStore();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  if (!session) return <Redirect href="/login" />;
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background, gap: 12 }}>
        <ActivityIndicator color={theme.primary} size="large" />
        <Text style={{ color: theme.textSecondary }}>Lade deine Daten …</Text>
      </View>
    );
  }
  if (players.length === 0) return <Redirect href="/onboarding" />;

  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />
      <TabList
        style={[
          styles.bar,
          {
            backgroundColor: theme.backgroundElement,
            borderTopColor: theme.border,
            paddingBottom: Math.max(insets.bottom, 8),
          },
        ]}>
        {TABS.map((t) => (
          <TabTrigger key={t.name} name={t.name} href={t.href} asChild>
            <TabButton icon={t.icon} label={t.label} />
          </TabTrigger>
        ))}
      </TabList>
    </Tabs>
  );
}

function TabButton({ icon, label, isFocused, ...props }: TabTriggerSlotProps & { icon: string; label: string }) {
  const theme = useTheme();
  return (
    <Pressable {...(props as PressableProps)} style={styles.tab} accessibilityLabel={label}>
      <View style={[styles.iconWrap, isFocused && { backgroundColor: theme.primarySoft }]}>
        <Text style={{ fontSize: 20, opacity: isFocused ? 1 : 0.55 }}>{icon}</Text>
      </View>
      <Text style={{ fontSize: 11, fontWeight: isFocused ? '700' : '500', color: isFocused ? theme.primary : theme.textSecondary }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 6,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  iconWrap: {
    paddingHorizontal: 14,
    paddingVertical: 2,
    borderRadius: 999,
  },
});
