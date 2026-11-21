export type AgeGroup = 'E' | 'D' | 'C' | 'B' | 'A';

export type Level = 'bronze' | 'silber' | 'gold';

export type Category =
  | 'ballkontrolle'
  | 'dribbling'
  | 'passen'
  | 'schiessen'
  | 'koordination'
  | 'athletik'
  | 'kopf';

export type Position = 'Tor' | 'Abwehr' | 'Mittelfeld' | 'Sturm' | 'Noch offen';

export interface Profile {
  nickname: string;
  birthYear: number;
  position: Position;
  club: string;
  parentConsent: boolean;
  createdAt: string;
}

export type TrainerRole = 'Vereinstrainer' | 'NLZ-Trainer';

export interface Confirmation {
  trainerName: string;
  club: string;
  role: TrainerRole;
  license: string;
  comment: string;
  date: string;
}

export interface ExerciseLog {
  id: string;
  exerciseId: string;
  level: Level;
  /** Messwert (Anzahl, Sekunden, Treffer). null bei reinen Abhak-Übungen. */
  value: number | null;
  achieved: boolean;
  note: string;
  date: string;
  confirmation?: Confirmation;
}

export type DiaryType = 'training' | 'spiel' | 'allein' | 'frei';

export interface DiaryEntry {
  id: string;
  date: string;
  type: DiaryType;
  minutes: number;
  mood: 1 | 2 | 3 | 4 | 5;
  good: string;
  improve: string;
}

export interface AppState {
  version: 1;
  profile: Profile | null;
  logs: ExerciseLog[];
  diary: DiaryEntry[];
  /** Eingelöste Wochen-Challenges, Schlüssel: "<woche>:<challengeId>" */
  claimed: string[];
}
