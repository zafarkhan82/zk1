import { useCallback, useEffect, useState } from 'react';

import { errorText, supabase } from './supabase';

export type RankScope = 'team' | 'league' | 'region' | 'national';
export type RankPeriod = 'season' | 'month';

export const SCOPES: { id: RankScope; label: string }[] = [
  { id: 'team', label: 'Team' },
  { id: 'league', label: 'Spielklasse' },
  { id: 'region', label: 'Region' },
  { id: 'national', label: 'Deutschland' },
];

export interface RankRow {
  rank: number;
  playerId: string;
  nickname: string;
  clubName: string;
  teamName: string;
  points: number;
  entries: number;
  isMe: boolean;
}

export interface RankResult {
  rows: RankRow[];
  me: RankRow | null;
  total: number;
  locked: boolean;
  label: string;
}

export interface RosterRow {
  playerId: string;
  nickname: string;
  jerseyNumber: number | null;
  position: string | null;
  points: number;
  entries: number;
  lastActivity: string | null;
  isMine: boolean;
}

/** Rangliste eines Spielers für einen Bereich (Team, Spielklasse, Region, Deutschland). */
export function useRanking(playerId: string | undefined, scope: RankScope, period: RankPeriod) {
  const [data, setData] = useState<RankResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!playerId) return;
    setLoading(true);
    setError('');
    const { data: rows, error: e } = await supabase.rpc('rankings', { p_player: playerId, p_scope: scope, p_period: period });
    setLoading(false);
    if (e) {
      setError(errorText(e));
      setData(null);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = ((rows ?? []) as any[]).map((r) => ({
      rank: r.rank,
      playerId: r.player_id,
      nickname: r.nickname,
      clubName: r.club_name,
      teamName: r.team_name,
      points: r.points,
      entries: r.entries,
      isMe: r.is_me,
      total: r.total as number,
      locked: r.locked as boolean,
      label: r.scope_label as string,
    }));
    const first = list[0];
    setData({
      rows: list,
      me: list.find((r) => r.isMe) ?? null,
      total: first?.total ?? 0,
      locked: first?.locked ?? false,
      label: first?.label ?? '',
    });
  }, [playerId, scope, period]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}

/** Kader eines Teams mit Saison-Punkten */
export function useRoster(teamId: string | undefined) {
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!teamId) {
      setRows([]);
      return;
    }
    let alive = true;
    supabase.rpc('team_roster', { p_team: teamId }).then(({ data, error: e }) => {
      if (!alive) return;
      if (e) {
        setError(errorText(e));
        return;
      }
      setError('');
      setRows(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((data ?? []) as any[]).map((r) => ({
          playerId: r.player_id,
          nickname: r.nickname,
          jerseyNumber: r.jersey_number,
          position: r.preferred_position,
          points: r.points,
          entries: r.entries,
          lastActivity: r.last_activity,
          isMine: r.is_mine,
        })),
      );
    });
    return () => {
      alive = false;
    };
  }, [teamId]);

  return { rows, error };
}
