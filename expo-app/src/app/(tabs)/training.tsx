import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Card, Chip, Pill, Row, Screen, T, useLevelColors, Wrap } from '@/components/ui';
import { CATEGORIES, exercisesFor, LEVELS } from '@/data/exercises';
import { AGE_GROUP_LABEL } from '@/lib/age';
import { bestLevel, skillScores } from '@/lib/game';
import { useStore } from '@/lib/store';
import type { Category } from '@/lib/types';

export default function Training() {
  const { state, group } = useStore();
  const levelColors = useLevelColors();
  const [cat, setCat] = useState<Category | 'alle'>('alle');
  const scores = skillScores(state, group);
  const list = exercisesFor(group).filter((e) => cat === 'alle' || e.category === cat);

  return (
    <Screen>
      <View>
        <T size={28} weight="800">
          Training
        </T>
        <T color="textSecondary" size={14}>
          Übungen für die {AGE_GROUP_LABEL[group]} · Bronze → Silber → Gold
        </T>
      </View>

      <Wrap>
        <Chip label="Alle" selected={cat === 'alle'} onPress={() => setCat('alle')} />
        {CATEGORIES.map((c) => (
          <Chip key={c.id} label={`${c.emoji} ${c.label}`} selected={cat === c.id} onPress={() => setCat(c.id)} />
        ))}
      </Wrap>

      {cat !== 'alle' && (
        <T size={14} color="textSecondary">
          Dein Skill in diesem Bereich: {scores[cat]} / 99
        </T>
      )}

      {list.map((e) => {
        const best = bestLevel(state.logs, e.id);
        const count = state.logs.filter((l) => l.exerciseId === e.id).length;
        const catInfo = CATEGORIES.find((c) => c.id === e.category)!;
        return (
          <Card key={e.id} onPress={() => router.push({ pathname: '/uebung/[id]', params: { id: e.id } })}>
            <Row>
              <T size={32}>{e.emoji}</T>
              <View style={{ flex: 1, gap: 2 }}>
                <T weight="700">{e.title}</T>
                <T size={13} color="textSecondary">
                  {catInfo.label} · ca. {e.minutes} Min. · {count}× gemacht
                </T>
              </View>
              {best ? (
                <Pill text={LEVELS.find((l) => l.id === best)!.label} color={levelColors[best].bg} textColor={levelColors[best].fg} />
              ) : (
                <T size={12} color="textSecondary">
                  neu
                </T>
              )}
            </Row>
          </Card>
        );
      })}
    </Screen>
  );
}
