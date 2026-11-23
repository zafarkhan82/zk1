import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Chip, H, Screen, StripeHeader, T, useLevelColors } from '@/components/ui';
import { Font } from '@/constants/theme';
import { CATEGORIES, exercisesFor, targetFor } from '@/data/exercises';
import { useTheme } from '@/hooks/use-theme';
import { AGE_GROUP_LABEL } from '@/lib/age';
import { bestLevel } from '@/lib/game';
import { useStore } from '@/lib/store';
import type { Category, Level } from '@/lib/types';

const ORDER: Level[] = ['bronze', 'silber', 'gold'];

export default function Training() {
  const { state, group, premium } = useStore();
  const theme = useTheme();
  const levelColors = useLevelColors();
  const [cat, setCat] = useState<Category | 'alle'>('alle');
  const all = exercisesFor(group);
  const list = all.filter((e) => cat === 'alle' || e.category === cat);
  const cats = CATEGORIES.filter((c) => all.some((e) => e.category === c.id) && (c.id !== 'torwart' || state.profile?.position === 'Tor'));

  return (
    <Screen
      header={
        <StripeHeader height={150}>
          <H size={52}>Training</H>
          <T size={14} color="textSecondary">
            {AGE_GROUP_LABEL[group]} · {all.length} Übungen · Bronze → Silber → Gold
          </T>
        </StripeHeader>
      }>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
        <Chip label="Alle" selected={cat === 'alle'} onPress={() => setCat('alle')} />
        {cats.map((c) => (
          <Chip key={c.id} label={c.label} selected={cat === c.id} onPress={() => setCat(c.id)} />
        ))}
      </ScrollView>

      {list.map((e, i) => {
        const best = bestLevel(state.logs, e.id);
        const reached = best ? ORDER.indexOf(best) : -1;
        const next = ORDER[Math.min(reached + 1, 2)];
        const nextLocked = !premium && next !== 'bronze';
        const sub =
          reached === 2
            ? 'Gold geschafft'
            : e.measure === 'check'
              ? `${e.minutes} Min. · ${e.equipment}`
              : `${nextLocked ? 'Bronze geschafft · Silber mit Premium' : `Nächstes Ziel: ${String(targetFor(e, next, group)).replace('.', ',')} ${e.unit}`}`;
        return (
          <Pressable
            key={e.id}
            accessibilityRole="button"
            accessibilityLabel={`${e.title}, ${sub}`}
            onPress={() => router.push({ pathname: '/uebung/[id]', params: { id: e.id } })}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              minHeight: 76,
              padding: 14,
              borderRadius: 20,
              backgroundColor: theme.backgroundElement,
              opacity: pressed ? 0.85 : 1,
            })}>
            <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: theme.backgroundSelected, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: theme.primary, fontFamily: Font.number, fontSize: 19 }}>{String(i + 1).padStart(2, '0')}</Text>
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <T weight="700">{e.title}</T>
              <T size={13} color="textSecondary" numberOfLines={1}>
                {sub}
              </T>
            </View>
            <View style={{ flexDirection: 'row', gap: 5 }} accessibilityElementsHidden>
              {ORDER.map((l, idx) => (
                <View key={l} style={{ width: 14, height: 14, borderRadius: 999, backgroundColor: idx <= reached ? levelColors[l].bg : theme.backgroundSelected }} />
              ))}
            </View>
          </Pressable>
        );
      })}
    </Screen>
  );
}
