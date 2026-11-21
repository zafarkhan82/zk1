import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { ageGroupFor } from './age';
import { newId } from './game';
import type { AgeGroup, AppState, Confirmation, DiaryEntry, ExerciseLog, Profile } from './types';

const KEY = 'kicktagebuch:v1';

const EMPTY: AppState = { version: 1, profile: null, logs: [], diary: [], claimed: [] };

interface Store {
  ready: boolean;
  state: AppState;
  group: AgeGroup;
  setProfile: (p: Profile) => void;
  addLog: (l: Omit<ExerciseLog, 'id' | 'date'>) => ExerciseLog;
  deleteLog: (id: string) => void;
  confirmLog: (id: string, c: Omit<Confirmation, 'date'>) => void;
  addDiary: (d: Omit<DiaryEntry, 'id' | 'date'>) => void;
  deleteDiary: (id: string) => void;
  claim: (key: string) => void;
  resetAll: () => void;
}

const Ctx = createContext<Store | null>(null);

async function load(): Promise<AppState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as AppState;
    return { ...EMPTY, ...parsed };
  } catch {
    return EMPTY;
  }
}

async function save(state: AppState) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Speichern nicht möglich (z. B. privater Browser-Modus) – App läuft trotzdem weiter.
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(EMPTY);
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    load().then((s) => {
      setState(s);
      loaded.current = true;
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (loaded.current) save(state);
  }, [state]);

  const setProfile = useCallback((p: Profile) => setState((s) => ({ ...s, profile: p })), []);

  const addLog = useCallback((l: Omit<ExerciseLog, 'id' | 'date'>) => {
    const log: ExerciseLog = { ...l, id: newId(), date: new Date().toISOString() };
    setState((s) => ({ ...s, logs: [log, ...s.logs] }));
    return log;
  }, []);

  const deleteLog = useCallback(
    (id: string) => setState((s) => ({ ...s, logs: s.logs.filter((l) => l.id !== id) })),
    [],
  );

  const confirmLog = useCallback((id: string, c: Omit<Confirmation, 'date'>) => {
    setState((s) => ({
      ...s,
      logs: s.logs.map((l) => (l.id === id ? { ...l, confirmation: { ...c, date: new Date().toISOString() } } : l)),
    }));
  }, []);

  const addDiary = useCallback((d: Omit<DiaryEntry, 'id' | 'date'>) => {
    setState((s) => ({ ...s, diary: [{ ...d, id: newId(), date: new Date().toISOString() }, ...s.diary] }));
  }, []);

  const deleteDiary = useCallback(
    (id: string) => setState((s) => ({ ...s, diary: s.diary.filter((d) => d.id !== id) })),
    [],
  );

  const claim = useCallback(
    (key: string) => setState((s) => (s.claimed.includes(key) ? s : { ...s, claimed: [...s.claimed, key] })),
    [],
  );

  const resetAll = useCallback(() => setState(EMPTY), []);

  const group: AgeGroup = (state.profile && ageGroupFor(state.profile.birthYear)) || 'E';

  const value = useMemo(
    () => ({ ready, state, group, setProfile, addLog, deleteLog, confirmLog, addDiary, deleteDiary, claim, resetAll }),
    [ready, state, group, setProfile, addLog, deleteLog, confirmLog, addDiary, deleteDiary, claim, resetAll],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore außerhalb von StoreProvider');
  return s;
}
