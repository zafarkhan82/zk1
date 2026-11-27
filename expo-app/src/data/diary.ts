import type { DiaryEntry, DiaryType } from '@/lib/types';

export const DIARY_TYPES: { id: DiaryType; label: string }[] = [
  { id: 'training', label: '🏟️ Vereinstraining' },
  { id: 'spiel', label: '⚽ Spiel' },
  { id: 'allein', label: '🏡 Allein geübt' },
  { id: 'frei', label: '😌 Pause/Sonstiges' },
];

export const MOODS: { id: DiaryEntry['mood']; emoji: string }[] = [
  { id: 1, emoji: '😣' },
  { id: 2, emoji: '😕' },
  { id: 3, emoji: '😐' },
  { id: 4, emoji: '🙂' },
  { id: 5, emoji: '🤩' },
];
