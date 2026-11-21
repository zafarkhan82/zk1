import type { AgeGroup, Level } from '@/lib/types';

/**
 * Zielwerte je Übung und Altersklasse: [Bronze, Silber, Gold].
 * Bronze: für fast alle des Jahrgangs erreichbar. Gold: sehr gute Spieler*innen des Jahrgangs.
 * Werte nach Prüfung durch einen Jugendtrainer (A-Lizenz) – physikalisch machbar, nicht linear hochgerechnet.
 * Fehlt eine Altersklasse, ist die Übung dort nicht vorgesehen (siehe minGroup).
 */
type Row = [number, number, number];
export const TARGETS: Record<string, Partial<Record<AgeGroup, Row>>> = {
  jonglieren: { E: [10, 20, 35], D: [15, 30, 50], C: [20, 40, 70], B: [30, 60, 100], A: [40, 80, 120] },
  'ballannahme-wand': { E: [10, 14, 18], D: [12, 17, 22], C: [14, 20, 26], B: [16, 22, 28], A: [18, 24, 30] },
  'sohle-rollen': { E: [25, 40, 55], D: [30, 45, 60], C: [35, 50, 65], B: [40, 55, 70], A: [40, 60, 75] },
  'hoher-ball-kontrolle': { D: [5, 7, 9], C: [5, 7, 9], B: [6, 8, 9], A: [6, 8, 10] },
  slalom: { E: [22, 18, 15], D: [20, 17, 14], C: [18, 15.5, 13], B: [17, 14.5, 12.5], A: [16, 14, 12] },
  finten: { E: [1, 1, 1], D: [1, 1, 1], C: [1, 1, 1], B: [1, 1, 1], A: [1, 1, 1] },
  'acht-dribbling': { E: [4, 6, 8], D: [5, 7, 9], C: [6, 8, 10], B: [7, 9, 11], A: [7, 10, 12] },
  'eins-gegen-eins': { E: [4, 6, 8], D: [4, 6, 8], C: [4, 6, 8], B: [4, 6, 8], A: [4, 6, 8] },
  wandpass: { E: [15, 25, 40], D: [20, 35, 50], C: [25, 45, 70], B: [30, 55, 80], A: [35, 60, 90] },
  passgenauigkeit: { E: [5, 7, 9], D: [5, 7, 9], C: [5, 7, 9], B: [6, 8, 9], A: [6, 8, 10] },
  flugball: { C: [4, 6, 8], B: [4, 6, 8], A: [5, 7, 9] },
  'torschuss-ecken': { E: [4, 6, 8], D: [4, 6, 8], C: [4, 6, 8], B: [5, 7, 8], A: [5, 7, 9] },
  'schwacher-fuss': { E: [3, 5, 7], D: [3, 5, 7], C: [4, 6, 7], B: [4, 6, 8], A: [5, 7, 8] },
  volley: { D: [3, 5, 7], C: [3, 5, 7], B: [4, 6, 8], A: [4, 6, 8] },
  koordinationsleiter: { E: [20, 16, 13], D: [18, 15, 12.5], C: [17, 14, 11.5], B: [16, 13, 11], A: [15, 12.5, 10.5] },
  einbeinstand: { E: [20, 30, 10], D: [25, 35, 15], C: [30, 45, 20], B: [30, 45, 25], A: [30, 45, 30] },
  'ball-prellen': { E: [10, 20, 30], D: [15, 25, 40], C: [20, 30, 50], B: [20, 35, 50], A: [20, 35, 50] },
  'sprint-20': { E: [4.6, 4.2, 3.8], D: [4.3, 3.9, 3.6], C: [4.0, 3.6, 3.4], B: [3.7, 3.4, 3.2], A: [3.5, 3.2, 3.0] },
  seilspringen: { E: [50, 80, 110], D: [65, 95, 125], C: [80, 110, 140], B: [90, 120, 150], A: [100, 130, 160] },
  'shuttle-run': { D: [6.2, 5.8, 5.4], C: [5.6, 5.3, 5.0], B: [5.4, 5.1, 4.8], A: [5.2, 4.9, 4.6] },
  rumpf: { D: [30, 45, 60], C: [40, 50, 60], B: [45, 60, 60], A: [50, 60, 60] },
  schulterblick: { E: [1, 1, 1], D: [1, 1, 1], C: [1, 1, 1], B: [1, 1, 1], A: [1, 1, 1] },
  spielanalyse: { D: [1, 1, 1], C: [1, 1, 1], B: [1, 1, 1], A: [1, 1, 1] },
  regelwissen: { E: [6, 8, 10], D: [6, 8, 10], C: [6, 8, 10], B: [7, 9, 10], A: [7, 9, 10] },
  // neue Übungen
  aufwaermen: { E: [1, 1, 1], D: [1, 1, 1], C: [1, 1, 1], B: [1, 1, 1], A: [1, 1, 1] },
  rondo: { E: [5, 8, 12], D: [6, 10, 15], C: [8, 12, 18], B: [10, 15, 20], A: [10, 15, 22] },
  'torwart-fangen': { E: [5, 7, 9], D: [5, 7, 9], C: [6, 8, 9], B: [6, 8, 10], A: [7, 9, 10] },
  'torwart-fallschule': { E: [1, 1, 1], D: [1, 1, 1], C: [1, 1, 1], B: [1, 1, 1], A: [1, 1, 1] },
  'mental-routine': { E: [1, 1, 1], D: [1, 1, 1], C: [1, 1, 1], B: [1, 1, 1], A: [1, 1, 1] },
  'spieltag-essen': { E: [1, 1, 1], D: [1, 1, 1], C: [1, 1, 1], B: [1, 1, 1], A: [1, 1, 1] },
  'kopfball-dosiert': { C: [4, 6, 8], B: [5, 7, 9], A: [5, 7, 9] },
};

/** Abstände für Treffer-Übungen je Altersklasse (die Trefferzahl bleibt, die Distanz wächst). */
export const DISTANCE: Record<string, Partial<Record<AgeGroup, string>>> = {
  passgenauigkeit: { E: '8 m', D: '10 m', C: '12 m', B: '14 m', A: '16 m' },
  'torschuss-ecken': { E: '9 m', D: '11 m', C: '13 m', B: '16 m', A: '16 m' },
  'schwacher-fuss': { E: '7 m', D: '9 m', C: '11 m', B: '13 m', A: '14 m' },
  flugball: { C: '20–25 m', B: '25–30 m', A: '30–35 m' },
  'torwart-fangen': { E: '6 m', D: '8 m', C: '10 m', B: '12 m', A: '14 m' },
};

const IDX: Record<Level, number> = { bronze: 0, silber: 1, gold: 2 };

export function targetValue(id: string, group: AgeGroup, level: Level): number | null {
  const row = TARGETS[id]?.[group];
  return row ? row[IDX[level]] : null;
}
