import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { ageGroupFor } from './age';
import { useAuth } from './auth';
import { supabase } from './supabase';
import type { AgeGroup, AppState, DiaryEntry, ExerciseLog, Player, Position, TeamInfo } from './types';

const ACTIVE_KEY = 'kicktagebuch:aktiverSpieler';
const claimKey = (playerId: string) => `kicktagebuch:claimed:${playerId}`;

export interface NewPlayer {
  nickname: string;
  birthYear: number;
  position: Position;
  forSelf: boolean;
  publicConsent: boolean;
}

interface Store {
  /** Spielerliste ist geladen */
  ready: boolean;
  loading: boolean;
  players: Player[];
  state: AppState;
  group: AgeGroup;
  premium: boolean;
  isAdmin: boolean;
  teams: TeamInfo[];
  selectPlayer: (id: string) => void;
  createPlayer: (p: NewPlayer) => Promise<void>;
  setPublicConsent: (v: boolean) => Promise<void>;
  addLog: (l: Omit<ExerciseLog, 'id' | 'date' | 'status' | 'requested'>) => Promise<ExerciseLog>;
  requestConfirmation: (logId: string) => Promise<void>;
  addDiary: (d: Omit<DiaryEntry, 'id' | 'date'>) => Promise<void>;
  joinTeam: (code: string) => Promise<void>;
  claim: (key: string) => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

/* eslint-disable @typescript-eslint/no-explicit-any */
const toPlayer = (r: any, uid: string): Player => ({
  id: r.id,
  code: r.code,
  nickname: r.nickname,
  birthYear: r.birth_year,
  position: (r.preferred_position ?? 'Noch offen') as Position,
  managedByGuardian: r.guardian_user_id === uid,
  publicConsent: !!r.public_consent_at,
});

const toLog = (r: any): ExerciseLog => ({
  id: r.id,
  exerciseId: r.exercise_id,
  level: r.level,
  value: r.value === null ? null : Number(r.value),
  achieved: r.achieved,
  note: r.note ?? '',
  date: r.created_at,
  status: r.status,
  requested: !!r.trainer_user_id,
});

const toDiary = (r: any): DiaryEntry => ({
  id: r.id,
  date: r.created_at,
  type: r.kind,
  minutes: r.minutes,
  mood: r.mood,
  good: r.good ?? '',
  improve: r.improve ?? '',
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export function StoreProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;

  // Für welches Konto die Spielerliste geladen ist ("" = abgemeldet). So ist "ready" nie veraltet.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [logs, setLogs] = useState<ExerciseLog[]>([]);
  const [diary, setDiary] = useState<DiaryEntry[]>([]);
  const [claimed, setClaimed] = useState<string[]>([]);
  const [premium, setPremium] = useState(false);
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!uid) {
      setIsAdmin(false);
      return;
    }
    supabase.rpc('is_platform_admin').then(({ data }) => setIsAdmin(!!data));
  }, [uid]);

  const loadPlayers = useCallback(async () => {
    if (!uid) {
      setPlayers([]);
      setActiveId(null);
      setLoadedFor('');
      return;
    }
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .or(`guardian_user_id.eq.${uid},own_user_id.eq.${uid}`)
      .is('anonymized_at', null)
      .order('created_at');
    if (error) throw error;
    const list = (data ?? []).map((r) => toPlayer(r, uid));
    setPlayers(list);
    let stored: string | null = null;
    try {
      stored = await AsyncStorage.getItem(ACTIVE_KEY);
    } catch {
      // ignorieren
    }
    setActiveId(list.find((p) => p.id === stored)?.id ?? list[0]?.id ?? null);
    setLoadedFor(uid);
  }, [uid]);

  const loadPlayerData = useCallback(async (playerId: string) => {
    setLoading(true);
    try {
      const [l, d, prem, t] = await Promise.all([
        supabase.from('exercise_entries').select('*').eq('player_id', playerId).order('created_at', { ascending: false }),
        supabase.from('diary_entries').select('*').eq('player_id', playerId).order('created_at', { ascending: false }),
        supabase.rpc('is_premium', { p_player: playerId }),
        supabase.rpc('my_teams', { p_player: playerId }),
      ]);
      setLogs((l.data ?? []).map(toLog));
      setDiary((d.data ?? []).map(toDiary));
      setPremium(!!prem.data);
      setTeams(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((t.data ?? []) as any[]).map((r) => ({
          memberId: r.member_id,
          teamId: r.team_id,
          teamName: r.team_name,
          clubName: r.club_name,
          status: r.status,
          jerseyNumber: r.jersey_number,
        })),
      );
      let raw: string | null = null;
      try {
        raw = await AsyncStorage.getItem(claimKey(playerId));
      } catch {
        // ignorieren
      }
      setClaimed(raw ? JSON.parse(raw) : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlayers().catch(() => setLoadedFor(uid ?? ''));
  }, [loadPlayers]);

  useEffect(() => {
    if (activeId) loadPlayerData(activeId);
    else {
      setLogs([]);
      setDiary([]);
      setTeams([]);
      setPremium(false);
    }
  }, [activeId, loadPlayerData]);

  const selectPlayer = useCallback((id: string) => {
    setActiveId(id);
    AsyncStorage.setItem(ACTIVE_KEY, id).catch(() => {});
  }, []);

  const createPlayer = useCallback(
    async (p: NewPlayer) => {
      if (!uid) throw new Error('Nicht angemeldet');
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('players')
        .insert({
          nickname: p.nickname,
          birth_year: p.birthYear,
          preferred_position: p.position,
          guardian_user_id: p.forSelf ? null : uid,
          own_user_id: p.forSelf ? uid : null,
          usage_consent_at: now,
          public_consent_at: p.publicConsent ? now : null,
        })
        .select()
        .single();
      if (error) throw error;
      const player = toPlayer(data, uid);
      setPlayers((list) => [...list, player]);
      selectPlayer(player.id);
    },
    [uid, selectPlayer],
  );

  const setPublicConsent = useCallback(
    async (v: boolean) => {
      if (!activeId) return;
      const { error } = await supabase
        .from('players')
        .update({ public_consent_at: v ? new Date().toISOString() : null })
        .eq('id', activeId);
      if (error) throw error;
      setPlayers((list) => list.map((p) => (p.id === activeId ? { ...p, publicConsent: v } : p)));
    },
    [activeId],
  );

  const addLog = useCallback(
    async (l: Omit<ExerciseLog, 'id' | 'date' | 'status' | 'requested'>) => {
      if (!activeId || !uid) throw new Error('Kein Spieler gewählt');
      const { data, error } = await supabase
        .from('exercise_entries')
        .insert({
          player_id: activeId,
          exercise_id: l.exerciseId,
          level: l.level,
          value: l.value,
          achieved: l.achieved,
          note: l.note || null,
          created_by: uid,
        })
        .select()
        .single();
      if (error) throw error;
      const log = toLog(data);
      setLogs((list) => [log, ...list]);
      return log;
    },
    [activeId, uid],
  );

  const requestConfirmation = useCallback(async (logId: string) => {
    const { error } = await supabase.rpc('request_trainer_confirmation', { p_entry: logId });
    if (error) throw error;
    setLogs((list) => list.map((l) => (l.id === logId ? { ...l, requested: true } : l)));
  }, []);

  const addDiary = useCallback(
    async (d: Omit<DiaryEntry, 'id' | 'date'>) => {
      if (!activeId || !uid) throw new Error('Kein Spieler gewählt');
      const { data, error } = await supabase
        .from('diary_entries')
        .insert({
          player_id: activeId,
          kind: d.type,
          minutes: d.minutes,
          mood: d.mood,
          good: d.good || null,
          improve: d.improve || null,
          created_by: uid,
        })
        .select()
        .single();
      if (error) throw error;
      setDiary((list) => [toDiary(data), ...list]);
    },
    [activeId, uid],
  );

  const joinTeam = useCallback(
    async (code: string) => {
      if (!activeId) throw new Error('Kein Spieler gewählt');
      const { error } = await supabase.rpc('join_team', { p_code: code, p_player: activeId });
      if (error) throw error;
      await loadPlayerData(activeId);
    },
    [activeId, loadPlayerData],
  );

  const claim = useCallback(
    (key: string) => {
      if (!activeId) return;
      setClaimed((c) => {
        if (c.includes(key)) return c;
        const next = [...c, key];
        AsyncStorage.setItem(claimKey(activeId), JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [activeId],
  );

  const refresh = useCallback(async () => {
    await loadPlayers();
    if (activeId) await loadPlayerData(activeId);
  }, [loadPlayers, loadPlayerData, activeId]);

  const ready = loadedFor === (uid ?? '');
  const profile = players.find((p) => p.id === activeId) ?? null;
  const group: AgeGroup = (profile && ageGroupFor(profile.birthYear)) || 'E';
  const state: AppState = useMemo(() => ({ profile, logs, diary, claimed }), [profile, logs, diary, claimed]);

  const value = useMemo<Store>(
    () => ({
      ready,
      loading,
      players,
      state,
      group,
      premium,
      isAdmin,
      teams,
      selectPlayer,
      createPlayer,
      setPublicConsent,
      addLog,
      requestConfirmation,
      addDiary,
      joinTeam,
      claim,
      refresh,
    }),
    [ready, loading, players, state, group, premium, isAdmin, teams, selectPlayer, createPlayer, setPublicConsent, addLog, requestConfirmation, addDiary, joinTeam, claim, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore außerhalb von StoreProvider');
  return s;
}
