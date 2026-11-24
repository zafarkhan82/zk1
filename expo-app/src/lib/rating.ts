import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { supabase } from './supabase';
import type { Category } from './types';

export type Tier = 'bronze' | 'silber' | 'gold';

export interface Rating {
  overall: number;
  overallWeekAgo: number | null;
  tier: Tier;
  attributes: Partial<Record<Category, number>>;
  components: { skill: number; activity: number; volume: number; rating: number | null; match: number | null };
  go4proId: string;
  ageGroup: string;
}

/** Gesamtwertung 35–79 vom Server (gleiche Berechnung für alle, auch in Kader und QR-Karte) */
export function usePlayerRating(playerId: string | undefined, refreshKey?: unknown) {
  const [rating, setRating] = useState<Rating | null>(null);
  useEffect(() => {
    if (!playerId) return;
    let alive = true;
    supabase.rpc('player_rating', { p_player: playerId }).then(({ data }) => {
      if (!alive || !data) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = data as any;
      setRating({
        overall: d.overall,
        overallWeekAgo: d.overall_week_ago ?? null,
        tier: d.tier,
        attributes: d.attributes ?? {},
        components: d.components,
        go4proId: d.go4pro_id,
        ageGroup: d.age_group,
      });
    });
    return () => {
      alive = false;
    };
  }, [playerId, refreshKey]);
  return rating;
}

const PUBLIC_BASE = 'https://zafarkhan82.github.io/zk1';

/** Link, den der QR-Code enthält: öffnet die Spielerkarte zur Go4Pro-ID */
export function playerLink(go4proId: string) {
  const base =
    Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hostname !== 'zafarkhan82.github.io'
      ? `${window.location.origin}${window.location.pathname.startsWith('/zk1') ? '/zk1' : ''}`
      : PUBLIC_BASE;
  return `${base}/spieler/${encodeURIComponent(go4proId)}`;
}
