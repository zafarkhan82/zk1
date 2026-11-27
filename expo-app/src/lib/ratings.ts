import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Category = 'technik' | 'spielverstaendnis' | 'athletik' | 'einsatz' | 'fairplay' | 'teamgeist';
export type RaterRole = 'trainer' | 'mitspieler' | 'gegner';
export type EncounterKind = 'einzelaktion' | 'training' | 'spiel' | 'turnier';

export const CATEGORY: Record<Category, { label: string; hint: string }> = {
  technik: { label: 'Technik', hint: 'Ballannahme, Passen, Dribbeln, Schuss' },
  spielverstaendnis: { label: 'Spielverständnis', hint: 'Freilaufen, Entscheidungen, Übersicht' },
  athletik: { label: 'Athletik', hint: 'Tempo, Ausdauer, Zweikampf' },
  einsatz: { label: 'Einsatz', hint: 'Laufbereitschaft, Wille, nie aufgeben' },
  fairplay: { label: 'Fair Play', hint: 'Respekt vor allen auf und neben dem Platz' },
  teamgeist: { label: 'Teamgeist', hint: 'Hilft anderen, feuert an, spielt ab' },
};
export const CATEGORY_ORDER: Category[] = ['technik', 'spielverstaendnis', 'athletik', 'einsatz', 'fairplay', 'teamgeist'];

export const KIND: Record<EncounterKind, { label: string; emoji: string }> = {
  einzelaktion: { label: 'Einzelaktion', emoji: '🎯' },
  training: { label: 'Training', emoji: '⚽' },
  spiel: { label: 'Spiel', emoji: '🏟️' },
  turnier: { label: 'Turnier', emoji: '🏆' },
};

export const ROLE: Record<RaterRole, string> = { trainer: 'Trainer*in', mitspieler: 'Mitspieler*in', gegner: 'Gegner*in' };

export interface InboxTarget {
  player_id: string;
  nickname: string;
  avatar: string | null;
  jersey: number | null;
  role: RaterRole;
  categories: Category[];
  done: boolean;
}
export interface InboxEncounter {
  id: string;
  kind: EncounterKind;
  title: string;
  date: string;
  team: string | null;
  opponent: string | null;
  open_until: string;
  targets: InboxTarget[];
}

export interface ReceivedItem {
  id: string;
  at: string;
  role: RaterRole;
  avg: number;
  reported: boolean;
  scores: Partial<Record<Category, number>>;
  rater: string | null;
  rater_avatar: string | null;
  encounter: { kind: EncounterKind; title: string; date: string };
}
export interface ReceivedSummary {
  count: number;
  avg: number | null;
  week: number;
  trainer: number | null;
  mitspieler: number | null;
  gegner: number | null;
  technik: number | null;
  spielverstaendnis: number | null;
  athletik: number | null;
  einsatz: number | null;
  fairplay: number | null;
  teamgeist: number | null;
}

/** Offene Begegnungen zum Bewerten: als Spieler*in (playerId) oder als Trainer*in (null) */
export function useRatingInbox(playerId: string | null, enabled = true) {
  const [items, setItems] = useState<InboxEncounter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!enabled) return setLoading(false);
    const { data, error } = await supabase.rpc('rating_inbox', { p_player: playerId });
    setError(error ? error.message : '');
    setItems((data as InboxEncounter[]) ?? []);
    setLoading(false);
  }, [playerId, enabled]);
  useEffect(() => {
    load();
  }, [load]);
  const open = items.reduce((n, e) => n + e.targets.filter((t) => !t.done).length, 0);
  return { items, loading, error, reload: load, open };
}

export async function submitRating(encounterId: string, ratedId: string, raterPlayerId: string | null, scores: Partial<Record<Category, number>>) {
  const { data, error } = await supabase.rpc('submit_rating', {
    p_encounter: encounterId,
    p_rated: ratedId,
    p_rater_player: raterPlayerId,
    p_scores: scores,
  });
  if (error) throw error;
  return data as { id: string; points: number };
}

/**
 * Erhaltene Bewertungen – live: neue Bewertungen kommen per Realtime sofort an.
 * onNew wird bei jeder neuen Bewertung aufgerufen (z. B. für einen Hinweis).
 */
export function useReceivedRatings(playerId: string | undefined, onNew?: () => void) {
  const [items, setItems] = useState<ReceivedItem[]>([]);
  const [summary, setSummary] = useState<ReceivedSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const cb = useRef(onNew);
  cb.current = onNew;

  const load = useCallback(async () => {
    if (!playerId) return;
    const { data } = await supabase.rpc('received_ratings', { p_player: playerId, p_limit: 60 });
    const d = (data as any) ?? {};
    setItems(d.items ?? []);
    setSummary(d.summary ?? null);
    setLoading(false);
  }, [playerId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!playerId) return;
    const ch = supabase
      .channel(`ratings-${playerId}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ratings', filter: `rated_player_id=eq.${playerId}` }, (p) => {
        load();
        setTick((t) => t + 1);
        if (p.eventType === 'INSERT') cb.current?.();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [playerId, load]);

  return { items, summary, loading, reload: load, tick };
}

export interface GivenItem {
  at: string;
  role: RaterRole;
  avg: number;
  rated: string;
  rated_avatar: string | null;
  encounter: string;
  kind: EncounterKind;
}
export function useGivenRatings(playerId: string | null, refreshKey?: unknown) {
  const [items, setItems] = useState<GivenItem[]>([]);
  useEffect(() => {
    supabase.rpc('given_ratings', { p_player: playerId }).then(({ data }) => setItems((data as GivenItem[]) ?? []));
  }, [playerId, refreshKey]);
  return items;
}

export interface PointsInfo {
  balance: number;
  earned: number;
  history: { amount: number; reason: string; at: string }[];
}
export function usePoints(playerId: string | null, refreshKey?: unknown) {
  const [info, setInfo] = useState<PointsInfo | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.rpc('my_points', { p_player: playerId });
    setInfo((data as PointsInfo) ?? { balance: 0, earned: 0, history: [] });
  }, [playerId]);
  useEffect(() => {
    load();
  }, [load, refreshKey]);
  return { info, reload: load };
}

/** Stufen für Punkte: was man ab wie vielen gesammelten Punkten freischaltet */
export const POINT_LEVELS = [
  { min: 0, label: 'Starter' },
  { min: 100, label: 'Scout' },
  { min: 300, label: 'Profi-Scout', unlock: 'Eigene Seite' },
  { min: 1000, label: 'Chef-Scout' },
  { min: 3000, label: 'Legende' },
];
export function pointLevel(earned: number) {
  let cur = POINT_LEVELS[0];
  for (const l of POINT_LEVELS) if (earned >= l.min) cur = l;
  const next = POINT_LEVELS.find((l) => l.min > earned) ?? null;
  return { cur, next };
}

export const stars = (n: number | null | undefined) => (n == null ? '–' : n.toFixed(1).replace('.', ','));

export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'gerade eben';
  if (s < 3600) return `vor ${Math.floor(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.floor(s / 3600)} Std.`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'gestern' : `vor ${d} Tagen`;
}
