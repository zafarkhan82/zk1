import { router, usePathname } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icons';
import { H, Logo } from '@/components/ui';
import { Font } from '@/constants/theme';
import { SIDE_NAV_WIDTH, useLayout } from '@/hooks/use-layout';
import { useTheme } from '@/hooks/use-theme';

type IconName = 'Home' | 'Ball' | 'Shield' | 'User';
type TabHref = '/' | '/training' | '/team' | '/profil';

const TABS: { href: TabHref; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: '/', label: 'Heute', icon: 'Home', match: (p) => p === '/' || p.startsWith('/nachrichten') || p.startsWith('/challenges') },
  { href: '/training', label: 'Training', icon: 'Ball', match: (p) => p.startsWith('/training') || p.startsWith('/uebung') },
  { href: '/team', label: 'Team', icon: 'Shield', match: (p) => p.startsWith('/team') || p.startsWith('/rangliste') },
  {
    href: '/profil',
    label: 'Ich',
    icon: 'User',
    match: (p) => ['/profil', '/verlauf', '/tagebuch', '/premium', '/karte', '/spieler'].some((x) => p.startsWith(x)),
  },
];

/** Gemeinsames Menü für alle Seiten: unten (Handy, iPad) oder links (PC) */
export function AppNav() {
  const { sideNav } = useLayout();
  const [sheet, setSheet] = useState(false);
  return (
    <>
      {sideNav ? <SideNav onPlus={() => setSheet(true)} /> : <BottomBar onPlus={() => setSheet(true)} />}
      <PlusSheet visible={sheet} onClose={() => setSheet(false)} />
    </>
  );
}

function useActive() {
  const path = usePathname() || '/';
  return (t: (typeof TABS)[number]) => t.match(path);
}

function go(href: TabHref) {
  router.navigate(href);
}

function BottomBar({ onPlus }: { onPlus: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const active = useActive();
  const { device } = useLayout();
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        Platform.OS === 'web' ? ({ position: 'fixed' } as object) : null,
        { backgroundColor: theme.bar, borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, 10) },
      ]}>
      <View style={{ flexDirection: 'row', width: '100%', maxWidth: device === 'tablet' ? 640 : undefined, alignSelf: 'center' }}>
        {TABS.slice(0, 2).map((t) => (
          <TabButton key={t.href} tab={t} focused={active(t)} />
        ))}
        <View style={styles.tab}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Eintragen"
            onPress={onPlus}
            style={({ pressed }) => [styles.plus, { backgroundColor: theme.primary, opacity: pressed ? 0.85 : 1 }]}>
            <View style={{ transform: [{ rotate: '-45deg' }] }}>
              <Icon.Plus size={28} color={theme.primaryText} />
            </View>
          </Pressable>
        </View>
        {TABS.slice(2).map((t) => (
          <TabButton key={t.href} tab={t} focused={active(t)} />
        ))}
      </View>
    </View>
  );
}

function TabButton({ tab, focused }: { tab: (typeof TABS)[number]; focused: boolean }) {
  const theme = useTheme();
  const color = focused ? theme.primary : theme.textSecondary;
  const I = Icon[tab.icon];
  return (
    <Pressable
      onPress={() => go(tab.href)}
      style={styles.tab}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={tab.label}>
      <I size={24} color={color} strokeWidth={focused ? 2.4 : 2} />
      <Text style={{ fontSize: 11, fontFamily: focused ? Font.black : Font.semibold, color }}>{tab.label}</Text>
    </Pressable>
  );
}

function SideNav({ onPlus }: { onPlus: () => void }) {
  const theme = useTheme();
  const active = useActive();
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.side,
        Platform.OS === 'web' ? ({ position: 'fixed' } as object) : null,
        { backgroundColor: theme.bar, borderRightColor: theme.border },
      ]}>
      <Pressable onPress={() => go('/')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <Logo size={36} />
        <Text style={{ fontFamily: Font.display, fontSize: 28, color: theme.text }}>
          GO<Text style={{ color: theme.primary }}>4</Text>PRO
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={onPlus}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          minHeight: 50,
          borderRadius: 999,
          paddingHorizontal: 18,
          marginBottom: 18,
          backgroundColor: theme.primary,
          opacity: pressed ? 0.85 : 1,
        })}>
        <Icon.Plus size={22} color={theme.primaryText} />
        <Text style={{ fontFamily: Font.black, fontSize: 16, color: theme.primaryText }}>Eintragen</Text>
      </Pressable>
      {TABS.map((t) => {
        const f = active(t);
        const I = Icon[t.icon];
        return (
          <Pressable
            key={t.href}
            accessibilityRole="tab"
            accessibilityState={{ selected: f }}
            onPress={() => go(t.href)}
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              minHeight: 50,
              paddingHorizontal: 16,
              borderRadius: 14,
              backgroundColor: f ? theme.primarySoft : hovered ? theme.backgroundElement : 'transparent',
              opacity: pressed ? 0.85 : 1,
            })}>
            <I size={22} color={f ? theme.primary : theme.textSecondary} strokeWidth={f ? 2.4 : 2} />
            <Text style={{ fontFamily: f ? Font.black : Font.semibold, fontSize: 16, color: f ? theme.primary : theme.text }}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PlusSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { sideNav } = useLayout();
  const open = (path: '/training' | '/eintrag' | '/trainer') => {
    onClose();
    router.push(path);
  };
  return (
    <Modal visible={visible} transparent animationType={sideNav ? 'fade' : 'slide'} onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, sideNav && { justifyContent: 'center', alignItems: 'center' }]} onPress={onClose} accessibilityLabel="Schließen">
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: theme.backgroundElement, paddingBottom: Math.max(insets.bottom, 16) + 16 },
            sideNav ? { borderRadius: 28, width: 460 } : { width: '100%', maxWidth: 640, alignSelf: 'center' },
          ]}>
          <H size={34}>Was hast du gemacht?</H>
          <SheetItem primary icon={<Icon.Ball size={26} color={theme.primaryText} />} label="Übung eintragen" onPress={() => open('/training')} />
          <SheetItem icon={<Icon.Diary size={26} color={theme.text} />} label="Tagebuch-Eintrag" onPress={() => open('/eintrag')} />
          <SheetItem icon={<Icon.Whistle size={26} color={theme.text} />} label="Als Trainer*in eintragen" onPress={() => open('/trainer')} />
          <Pressable onPress={onClose} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: theme.textSecondary, fontFamily: Font.semibold, fontSize: 15 }}>Abbrechen</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
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
        { backgroundColor: primary ? theme.primary : 'transparent', borderColor: primary ? theme.primary : theme.border, opacity: pressed ? 0.85 : 1 },
      ]}>
      {icon}
      <Text style={{ color: primary ? theme.primaryText : theme.text, fontFamily: primary ? Font.black : Font.bold, fontSize: 17 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, paddingTop: 8, zIndex: 50 },
  side: { position: 'absolute', left: 0, top: 0, bottom: 0, width: SIDE_NAV_WIDTH, borderRightWidth: 1, padding: 20, paddingTop: 28, gap: 4, zIndex: 50 },
  tab: { flex: 1, alignItems: 'center', gap: 3, minHeight: 52 },
  plus: { width: 58, height: 58, marginTop: -26, borderRadius: 18, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '45deg' }] },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 12 },
  sheetItem: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 66, paddingHorizontal: 18, borderRadius: 20, borderWidth: 1.5 },
});
