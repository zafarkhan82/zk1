import type { AgeGroup } from './types';

export const AGE_GROUPS: AgeGroup[] = ['E', 'D', 'C', 'B', 'A'];

export const AGE_GROUP_LABEL: Record<AgeGroup, string> = {
  E: 'E-Jugend',
  D: 'D-Jugend',
  C: 'C-Jugend',
  B: 'B-Jugend',
  A: 'A-Jugend',
};

/** Startjahr der laufenden Saison (Saisonwechsel am 1. Juli). */
export function seasonStartYear(now = new Date()): number {
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

/** U-Klasse nach DFB-Stichtag: Saison 2026/27 → U19 = Jahrgang 2008. */
export function uClass(birthYear: number, now = new Date()): number {
  return seasonStartYear(now) + 1 - birthYear;
}

export function ageGroupFor(birthYear: number, now = new Date()): AgeGroup | null {
  const u = uClass(birthYear, now);
  if (u >= 10 && u <= 11) return 'E';
  if (u >= 12 && u <= 13) return 'D';
  if (u >= 14 && u <= 15) return 'C';
  if (u >= 16 && u <= 17) return 'B';
  if (u >= 18 && u <= 19) return 'A';
  return null;
}

/** Jahrgänge, die in der laufenden Saison E- bis A-Jugend spielen (jüngste zuerst). */
export function allowedBirthYears(now = new Date()): number[] {
  const start = seasonStartYear(now);
  const years: number[] = [];
  for (let u = 10; u <= 19; u++) years.push(start + 1 - u);
  return years;
}

export function groupIndex(g: AgeGroup): number {
  return AGE_GROUPS.indexOf(g);
}
