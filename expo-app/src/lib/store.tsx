import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { ageGroupFor } from './age';
import { useAuth } from './auth';
import { supabase } from './supabase';
import type { AgeGroup, AppState, DiaryEntry, ExerciseLog, Player, Position, StaffRow, TeamInfo } from './types';

const ACTIVE_KEY = 'kicktagebuch:aktiverSpieler';

export interface NewPlayer {
  nickname: string;
  birthYear: number;
  position: Position;
  forSelf: boolean;
  publicConsent: boolean;
}

export type NewLog = Pick<ExerciseLog, 'exerciseId' | 'level' | 'value' | 'note'>;

interface Store {
  /** Spielerliste ist geladen (oder Laden ist fehlgeschlagen, siehe loadError) */
  ready: boolean;
  /** Fehler beim Laden – dann nicht zum Onboarding umleiten, sondern "Erneut versuchen" anbieten */
  loadError: string | null;
  loading: boolean;
  players: Player[];
  state: AppState;
  group: AgeGroup;
  premium: boolean;
  isAdmin: boolean;
  /** Gewählte Rolle beim Einstieg (null = noch nicht gewählt) */
  appMode: AppMode | null;
  setAppMode: (m: AppMode) => Promise<void>;
  /** Admin eines Bundeslands, Verbands oder Kreises (oder Super-Admin) */
  isOrgAdmin: boolean;
  teams: TeamInfo[];
  staff: StaffRow[];
  /** Freigeschaltete*r Trainer*in oder Vereins-Admin in mindestens einem Verein */
  isStaff: boolean;
  /** Hat (auch wartende) Trainer-/Vereinsanträge */
  hasStaffRequests: boolean;
  selectPlayer: (id: string) => void;
  createPlayer: (p: NewPlayer) => Promise<void>;
  setPublicConsent: (v: boolean) => Promise<void>;
  addLog: (l: NewLog) => Promise<ExerciseLog>;
  confirmByPlayer: (ids: string[]) => Promise<void>;
  addDiary: (d: Omit<DiaryEntry, 'id' | 'date'>) => Promise<void>;
  joinTeam: (code: string) => Promise<void>;
  claim: (week: string, challengeId: string, xp: number) => Promise<void>;
  refresh: () => Promise<void>;
  refreshStaff: () => Promise<void>;
}

export type AppMode = 'eltern' | 'spieler' | 'trainer' | 'admin';

const Ctx = createContext<Store | null>(null);

/* eslint-disable @typescript-eslint/no-explicit-any */
const toPlayer = (r: any, uid: string): Player => ({
  id: r.id,
  code: r.code,
  nickname: r.nickname,
  birthYear: r.birth_year,
  position: (r.preferred_position ?? 'Noch offen') as Position,
  managedByGuardian: r.guardian_user_id === uid,
  hasOwnAccess: !!r.own_user_id,
  isMe: r.own_user_id === uid,
  hasGuardian: !!r.guardian_user_id,
  publicConsent: !!r.public_consent_at,
});

export const toLog = (r: any): ExerciseLog => ({
  id: r.id,
  exerciseId: r.exercise_id,
  level: r.level,
  value: r.value === null ? null : Number(r.value),
  achieved: r.achieved,
  note: r.note ?? '',
  date: r.created_at,
  status: r.status,
  requested: !!r.trainer_user_id,
  playerConfirmed: !!r.player_confirmed_at,
  trainerConfirmed: !!r.trainer_confirmed_at,
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

const toStaff = (r: any): StaffRow => ({
  clubId: r.club_id,
  clubName: r.club_name,
  clubStatus: r.club_status,
  role: r.role,
  membershipStatus: r.membership_status,
  teamId: r.team_id,
  teamName: r.team_name,
  ageGroup: r.age_group,
  season: r.season,
  joinCode: r.join_code,
  pendingMembers: Number(r.pending_members ?? 0),
  licenseUntil: r.license_until,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export function StoreProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;

  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [logs, setLogs] = useState<ExerciseLog[]>([]);
  const [diary, setDiary] = useState<DiaryEntry[]>([]);
  const [claimed, setClaimed] = useState<string[]>([]);
  const [premium, setPremium] = useState(false);
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [appMode, setAppModeState] = useState<AppMode | null>(null);
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  // Schutz vor vertauschten Daten, wenn schnell zwischen Kindern gewechselt wird
  const requestFor = useRef<string | null>(null);

  const refreshStaff = useCallback(async () => {
    if (!uid) {
      setStaff([]);
      setIsAdmin(false);
      setAppModeState(null);
      setIsOrgAdmin(false);
      return;
    }
    const [s, a, m, sc] = await Promise.all([
      supabase.rpc('my_staff_overview'),
      supabase.rpc('is_platform_admin'),
      supabase.rpc('my_app_mode'),
      supabase.rpc('my_admin_scope'),
    ]);
    if (!s.error) setStaff(((s.data ?? []) as unknown[]).map(toStaff));
    setIsAdmin(!!a.data);
    if (!m.error) setAppModeState((m.data as AppMode | null) ?? null);
    const scope = sc.data as { super?: boolean; units?: unknown[] } | null;
    setIsOrgAdmin(!!scope && (!!scope.super || (scope.units?.length ?? 0) > 0));
  }, [uid]);

  const loadPlayers = useCallback(async () => {
    if (!uid) {
      setPlayers([]);
      setActiveId(null);
      setLoadError(null);
      setLoadedFor('');
      return;
    }
    const [{ data, error }] = await Promise.all([
      supabase
        .from('players')
        .select('*')
        .or(`guardian_user_id.eq.${uid},own_user_id.eq.${uid}`)
        .is('anonymized_at', null)
        .order('created_at'),
      refreshStaff(),
    ]);
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
    setLoadError(null);
    setLoadedFor(uid);
  }, [uid, refreshStaff]);

  const loadPlayerData = useCallback(async (playerId: string) => {
    requestFor.current = playerId;
    setLoading(true);
    try {
      const [l, d, prem, t, c] = await Promise.all([
        supabase.from('exercise_entries').select('*').eq('player_id', playerId).order('created_at', { ascending: false }),
        supabase.from('diary_entries').select('*').eq('player_id', playerId).order('created_at', { ascending: false }),
        supabase.rpc('is_premium', { p_player: playerId }),
        supabase.rpc('my_teams', { p_player: playerId }),
        supabase.from('challenge_claims').select('week,challenge_id').eq('player_id', playerId),
      ]);
      if (requestFor.current !== playerId) return; // inzwischen anderes Kind gewählt
      const firstError = l.error ?? d.error ?? prem.error ?? t.error;
      if (firstError) throw firstError;
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
          league: r.league ?? null,
          ageGroup: r.age_group ?? null,
          association: r.association ?? null,
        })),
      );
      setClaimed(((c.data ?? []) as { week: string; challenge_id: string }[]).map((r) => `${r.week}:${r.challenge_id}`));
      setLoadError(null);
    } catch (e) {
      if (requestFor.current === playerId) setLoadError((e as Error).message ?? 'Laden fehlgeschlagen');
    } finally {
      if (requestFor.current === playerId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlayers().catch((e) => {
      setLoadError((e as Error).message ?? 'Laden fehlgeschlagen');
      setLoadedFor(uid ?? '');
    });
  }, [loadPlayers, uid]);

  useEffect(() => {
    if (activeId) loadPlayerData(activeId);
    else {
      requestFor.current = null;
      setLogs([]);
      setDiary([]);
      setTeams([]);
      setClaimed([]);
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
    async (l: NewLog) => {
      if (!activeId || !uid) throw new Error('Kein Spieler gewählt');
      // "achieved", Bestätigungen und Trainer setzt die Datenbank selbst.
      const { data, error } = await supabase
        .from('exercise_entries')
        .insert({
          player_id: activeId,
          exercise_id: l.exerciseId,
          level: l.level,
          value: l.value,
          achieved: false,
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

  const confirmByPlayer = useCallback(
    async (ids: string[]) => {
      const { error } = await supabase.rpc('player_confirm_entries', { p_ids: ids });
      if (error) throw error;
      if (activeId) await loadPlayerData(activeId);
    },
    [activeId, loadPlayerData],
  );

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
    async (week: string, challengeId: string, xp: number) => {
      if (!activeId || !uid) return;
      const key = `${week}:${challengeId}`;
      const { error } = await supabase
        .from('challenge_claims')
        .insert({ player_id: activeId, week, challenge_id: challengeId, xp, created_by: uid });
      if (error && !/duplicate/i.test(error.message)) throw error;
      setClaimed((c) => (c.includes(key) ? c : [...c, key]));
    },
    [activeId, uid],
  );

  const refresh = useCallback(async () => {
    try {
      await loadPlayers();
      if (activeId) await loadPlayerData(activeId);
    } catch (e) {
      setLoadError((e as Error).message ?? 'Laden fehlgeschlagen');
    }
  }, [loadPlayers, loadPlayerData, activeId]);

  const ready = loadedFor === (uid ?? '');
  const setAppMode = useCallback(async (m: AppMode) => {
    const { error } = await supabase.rpc('set_app_mode', { p_mode: m });
    if (error) throw error;
    setAppModeState(m);
  }, []);

  const profile = players.find((p) => p.id === activeId) ?? null;
  const group: AgeGroup = (profile && ageGroupFor(profile.birthYear)) || 'E';
  const state: AppState = useMemo(() => ({ profile, logs, diary, claimed }), [profile, logs, diary, claimed]);
  const isStaff = staff.some((s) => s.membershipStatus === 'approved' && s.clubStatus === 'approved');
  const hasStaffRequests = staff.length > 0;

  const value = useMemo<Store>(
    () => ({
      ready,
      loadError,
      loading,
      players,
      state,
      group,
      premium,
      isAdmin,
      appMode,
      setAppMode,
      isOrgAdmin,
      teams,
      staff,
      isStaff,
      hasStaffRequests,
      selectPlayer,
      createPlayer,
      setPublicConsent,
      addLog,
      confirmByPlayer,
      addDiary,
      joinTeam,
      claim,
      refresh,
      refreshStaff,
    }),
    [ready, loadError, loading, players, state, group, premium, isAdmin, appMode, setAppMode, isOrgAdmin, teams, staff, isStaff, hasStaffRequests, selectPlayer, createPlayer, setPublicConsent, addLog, confirmByPlayer, addDiary, joinTeam, claim, refresh, refreshStaff],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore außerhalb von StoreProvider');
  return s;
}
