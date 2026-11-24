import { useCallback, useEffect, useState } from 'react';

import type { RankScope } from './ranking';
import { supabase } from './supabase';
import type { Level } from './types';

export interface RankOverview {
  scope: RankScope;
  label: string;
  rank: number;
  total: number;
  points: number;
  /** Platz vor 7 Tagen (gleiche Wertung ohne die letzten 7 Tage) */
  rankWeekAgo: number;
  /** Punkte bis zum nächsten Platz, null wenn schon Platz 1 */
  pointsToNext: number | null;
  nextName: string | null;
  locked: boolean;
}

export type NewsKind = 'info' | 'training' | 'spiel' | 'lob' | 'tipp';

export interface NewsItem {
  id: string;
  kind: NewsKind;
  title: string;
  body: string;
  linkUrl: string | null;
  author: string;
  pinned: boolean;
  publishedAt: string;
  scope: 'team' | 'club' | 'global';
}

export interface FeedItem {
  playerId: string;
  nickname: string;
  exerciseId: string;
  level: Level;
  value: number | null;
  at: string;
  isMine: boolean;
}

export interface HomeAd {
  id: string;
  sponsor: string;
  title: string;
  body: string;
  ctaLabel: string;
  linkUrl: string | null;
  imageUrl: string | null;
  isClubSponsor: boolean;
}

export const NEWS_KIND: Record<NewsKind, { label: string; emoji: string }> = {
  info: { label: 'Info', emoji: '📣' },
  training: { label: 'Training', emoji: '🏃' },
  spiel: { label: 'Spiel', emoji: '⚽' },
  lob: { label: 'Lob', emoji: '👏' },
  tipp: { label: 'Tipp', emoji: '💡' },
};

/* eslint-disable @typescript-eslint/no-explicit-any */

export function useRankOverview(playerId: string | undefined, refreshKey: unknown) {
  const [rows, setRows] = useState<RankOverview[]>([]);
  useEffect(() => {
    if (!playerId) return;
    let alive = true;
    supabase.rpc('my_rank_overview', { p_player: playerId }).then(({ data }) => {
      if (!alive) return;
      setRows(
        ((data ?? []) as any[]).map((r) => ({
          scope: r.scope,
          label: r.label,
          rank: r.rank,
          total: r.total,
          points: r.points,
          rankWeekAgo: r.rank_week_ago,
          pointsToNext: r.points_to_next,
          nextName: r.next_name,
          locked: r.locked,
        })),
      );
    });
    return () => {
      alive = false;
    };
  }, [playerId, refreshKey]);
  return rows;
}

export function useNews(playerId: string | undefined, limit = 20) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    if (!playerId) return;
    const { data } = await supabase.rpc('my_news', { p_player: playerId, p_limit: limit });
    setItems(
      ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        body: r.body,
        linkUrl: r.link_url,
        author: r.author_label,
        pinned: r.pinned,
        publishedAt: r.published_at,
        scope: r.scope,
      })),
    );
    setLoaded(true);
  }, [playerId, limit]);
  useEffect(() => {
    load();
  }, [load]);
  return { items, loaded, reload: load };
}

export function useTeamFeed(teamId: string | undefined) {
  const [items, setItems] = useState<FeedItem[]>([]);
  useEffect(() => {
    if (!teamId) return setItems([]);
    let alive = true;
    supabase.rpc('team_feed', { p_team: teamId }).then(({ data }) => {
      if (!alive) return;
      setItems(
        ((data ?? []) as any[]).map((r) => ({
          playerId: r.player_id,
          nickname: r.nickname,
          exerciseId: r.exercise_id,
          level: r.level,
          value: r.value,
          at: r.at,
          isMine: r.is_mine,
        })),
      );
    });
    return () => {
      alive = false;
    };
  }, [teamId]);
  return items;
}

/** Eine Anzeige pro Besuch der Startseite (nicht bei jedem Neuzeichnen) */
export function useHomeAd(playerId: string | undefined) {
  const [ad, setAd] = useState<HomeAd | null>(null);
  useEffect(() => {
    if (!playerId) return;
    let alive = true;
    supabase.rpc('home_ad', { p_player: playerId }).then(({ data }) => {
      const r = ((data ?? []) as any[])[0];
      if (!alive) return;
      setAd(
        r
          ? {
              id: r.id,
              sponsor: r.sponsor,
              title: r.title,
              body: r.body,
              ctaLabel: r.cta_label,
              linkUrl: r.link_url,
              imageUrl: r.image_url,
              isClubSponsor: r.is_club_sponsor,
            }
          : null,
      );
    });
    return () => {
      alive = false;
    };
  }, [playerId]);
  return ad;
}

export function relativeTime(iso: string, now = Date.now()) {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.round(diff / 60000);
  if (min < 60) return min <= 1 ? 'gerade eben' : `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  if (d === 1) return 'gestern';
  if (d < 7) return `vor ${d} Tagen`;
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}
