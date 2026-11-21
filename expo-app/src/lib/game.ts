import { CATEGORIES, exercisesFor, getExercise, LEVELS } from '@/data/exercises';

import type { AgeGroup, AppState, Category, DiaryEntry, ExerciseLog, Level } from './types';

// ───────────── Punkte (XP) ─────────────

export const DIARY_XP = 5;

export function levelXp(level: Level) {
  return LEVELS.find((l) => l.id === level)!.xp;
}

/** Punkte für eine Übung: Basis je Stärkegrad, +50 % bei erreichtem Ziel, doppelte Basis bei Trainer-Bestätigung. */
export function logXp(log: ExerciseLog) {
  const base = levelXp(log.level);
  let xp = base;
  if (log.achieved) xp += Math.round(base / 2);
  if (log.status === 'confirmed') xp += base;
  return xp;
}

export function totalXp(state: AppState) {
  const logs = state.logs.reduce((s, l) => s + logXp(l), 0);
  const diary = state.diary.length * DIARY_XP;
  const challenges = state.claimed.reduce((s, key) => {
    const id = key.split(':')[1];
    return s + (CHALLENGE_POOL.find((c) => c.id === id)?.xp ?? 0);
  }, 0);
  return logs + diary + challenges;
}

/** Nur trainer-bestätigte Leistungen zählen für Ranglisten. */
export function confirmedXp(state: AppState) {
  return state.logs.filter((l) => l.status === 'confirmed').reduce((s, l) => s + logXp(l), 0);
}

// ───────────── Spieler-Level ─────────────

const TITLES: { from: number; title: string }[] = [
  { from: 1, title: 'Talent' },
  { from: 3, title: 'Kicker' },
  { from: 5, title: 'Stammspieler' },
  { from: 8, title: 'Leistungsträger' },
  { from: 11, title: 'Kapitän' },
  { from: 15, title: 'Auswahlspieler' },
  { from: 20, title: 'Top-Talent' },
];

/** XP, die man insgesamt braucht, um ein Level zu erreichen (Level 1 = 0). */
export function xpForLevel(level: number) {
  return 25 * (level - 1) * level;
}

export function levelInfo(xp: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const start = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const title = [...TITLES].reverse().find((t) => level >= t.from)!.title;
  return { level, title, current: xp - start, needed: next - start, progress: (xp - start) / (next - start) };
}

// ───────────── Skills ─────────────

const LEVEL_SCORE: Record<Level, number> = { bronze: 1, silber: 2, gold: 3 };

export function bestLevel(logs: ExerciseLog[], exerciseId: string): Level | null {
  let best: Level | null = null;
  for (const l of logs) {
    if (l.exerciseId !== exerciseId || !l.achieved) continue;
    if (!best || LEVEL_SCORE[l.level] > LEVEL_SCORE[best]) best = l.level;
  }
  return best;
}

/** Skill-Wert 0–99 je Kategorie: wie weit du die Stufen der passenden Übungen gemeistert hast. */
export function skillScores(state: AppState, group: AgeGroup): Record<Category, number> {
  const list = exercisesFor(group);
  const result = {} as Record<Category, number>;
  for (const cat of CATEGORIES) {
    const ex = list.filter((e) => e.category === cat.id);
    if (!ex.length) {
      result[cat.id] = 0;
      continue;
    }
    let sum = 0;
    for (const e of ex) {
      const b = bestLevel(state.logs, e.id);
      if (b) sum += LEVEL_SCORE[b];
      const confirmed = state.logs.some((l) => l.exerciseId === e.id && l.achieved && l.status === 'confirmed');
      if (confirmed) sum += 0.5;
    }
    result[cat.id] = Math.min(99, Math.round((sum / (ex.length * 3.5)) * 99));
  }
  return result;
}

export function overall(scores: Record<Category, number>) {
  const vals = Object.values(scores);
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

// ───────────── Datum & Serie ─────────────

export function dayKey(d: Date | string) {
  const date = typeof d === 'string' ? new Date(d) : d;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function activeDays(state: AppState) {
  const set = new Set<string>();
  state.logs.forEach((l) => set.add(dayKey(l.date)));
  state.diary.forEach((d) => set.add(dayKey(d.date)));
  return set;
}

/** Aktive Tage in Folge bis heute (oder gestern, wenn heute noch nichts passiert ist). */
export function streak(state: AppState, now = new Date()) {
  const days = activeDays(state);
  const d = new Date(now);
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let count = 0;
  while (days.has(dayKey(d))) {
    count++;
    d.setDate(d.getDate() - 1);
  }
  return count;
}

/** Montag 00:00 der Woche, in der `now` liegt. */
export function weekStart(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

export function weekKey(now = new Date()) {
  return dayKey(weekStart(now));
}

function inWeek(date: string, now: Date) {
  const start = weekStart(now).getTime();
  const t = new Date(date).getTime();
  return t >= start && t < start + 7 * 86400000;
}

// ───────────── Wochen-Challenges ─────────────

export interface Challenge {
  id: string;
  title: string;
  description: string;
  target: number;
  xp: number;
  emoji: string;
  progress: (logs: ExerciseLog[], diary: DiaryEntry[]) => number;
}

const catCount = (cat: Category) => (logs: ExerciseLog[]) =>
  logs.filter((l) => getExercise(l.exerciseId)?.category === cat).length;

export const CHALLENGE_POOL: Challenge[] = [
  { id: 'fleissig', emoji: '🔥', title: 'Fleißig', description: 'Trage 5 Übungen ein.', target: 5, xp: 40, progress: (l) => l.length },
  { id: 'tagebuch3', emoji: '📓', title: 'Tagebuch-Profi', description: 'Schreibe 3 Tagebucheinträge.', target: 3, xp: 30, progress: (_, d) => d.length },
  { id: 'gold1', emoji: '🥇', title: 'Goldener Moment', description: 'Schaffe ein Gold-Ziel.', target: 1, xp: 50, progress: (l) => l.filter((x) => x.level === 'gold' && x.achieved).length },
  { id: 'bestaetigt', emoji: '✅', title: 'Vom Trainer gesehen', description: 'Lass 1 Leistung vom Trainer bestätigen.', target: 1, xp: 50, progress: (l) => l.filter((x) => x.status === 'confirmed').length },
  { id: 'technik', emoji: '🎯', title: 'Ballzauberer', description: '3 Übungen Ballkontrolle oder Dribbling.', target: 3, xp: 35, progress: (l) => catCount('ballkontrolle')(l) + catCount('dribbling')(l) },
  { id: 'schuss', emoji: '🥅', title: 'Torjäger', description: '2 Schuss-Übungen.', target: 2, xp: 30, progress: catCount('schiessen') },
  { id: 'athlet', emoji: '💪', title: 'Athlet', description: '2 Athletik- oder Koordinations-Übungen.', target: 2, xp: 30, progress: (l) => catCount('athletik')(l) + catCount('koordination')(l) },
  { id: 'minuten', emoji: '⏱️', title: 'Dranbleiben', description: '120 Minuten Fußball im Tagebuch.', target: 120, xp: 40, progress: (_, d) => d.reduce((s, e) => s + e.minutes, 0) },
  { id: 'passmaster', emoji: '🔁', title: 'Passmaschine', description: '2 Pass-Übungen.', target: 2, xp: 30, progress: catCount('passen') },
  { id: 'kopf', emoji: '🧠', title: 'Schlauer Spieler', description: '1 Übung aus Kopf & Taktik.', target: 1, xp: 25, progress: catCount('kopf') },
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Drei Challenges pro Woche – für alle gleich, wechseln jeden Montag. */
export function weeklyChallenges(now = new Date()) {
  const key = weekKey(now);
  const pool = [...CHALLENGE_POOL];
  const picked: Challenge[] = [];
  let h = hash(key);
  while (picked.length < 3) {
    const idx = h % pool.length;
    picked.push(pool.splice(idx, 1)[0]);
    h = hash(String(h) + key);
  }
  return picked;
}

export function challengeProgress(state: AppState, c: Challenge, now = new Date()) {
  const logs = state.logs.filter((l) => inWeek(l.date, now));
  const diary = state.diary.filter((d) => inWeek(d.date, now));
  return Math.min(c.target, c.progress(logs, diary));
}

// ───────────── Abzeichen ─────────────

export interface Badge {
  id: string;
  emoji: string;
  title: string;
  description: string;
  earned: boolean;
}

export function badges(state: AppState, group: AgeGroup): Badge[] {
  const logs = state.logs;
  const golds = logs.filter((l) => l.level === 'gold' && l.achieved).length;
  const confirmed = logs.filter((l) => l.status === 'confirmed').length;
  const s = streak(state);
  const scores = skillScores(state, group);
  const cats = new Set(logs.map((l) => getExercise(l.exerciseId)?.category));
  return [
    { id: 'start', emoji: '⚽', title: 'Anstoß', description: 'Erste Übung eingetragen', earned: logs.length >= 1 },
    { id: 'tagebuch', emoji: '📓', title: 'Schreiberling', description: '10 Tagebucheinträge', earned: state.diary.length >= 10 },
    { id: 'serie3', emoji: '🔥', title: 'Am Ball', description: '3 Tage in Folge aktiv', earned: s >= 3 },
    { id: 'serie7', emoji: '🌟', title: 'Wochen-Held', description: '7 Tage in Folge aktiv', earned: s >= 7 },
    { id: 'allrounder', emoji: '🧩', title: 'Allrounder', description: 'Übungen aus allen 7 Bereichen', earned: cats.size >= CATEGORIES.length },
    { id: 'gold', emoji: '🥇', title: 'Gold!', description: 'Erstes Gold-Ziel geschafft', earned: golds >= 1 },
    { id: 'gold10', emoji: '🏆', title: 'Goldsammler', description: '10 Gold-Ziele geschafft', earned: golds >= 10 },
    { id: 'trainer', emoji: '✅', title: 'Bestätigt', description: 'Erste Trainer-Bestätigung', earned: confirmed >= 1 },
    { id: 'trainer10', emoji: '📜', title: 'Geprüfte Qualität', description: '10 Trainer-Bestätigungen', earned: confirmed >= 10 },
    { id: 'skill50', emoji: '📈', title: 'Aufsteiger', description: 'Ein Skill über 50', earned: Object.values(scores).some((v) => v >= 50) },
  ];
}

// ───────────── Sonstiges ─────────────

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}
