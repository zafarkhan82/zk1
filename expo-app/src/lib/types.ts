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

export interface Player {
  id: string;
  nickname: string;
  birthYear: number;
  position: Position;
  /** true = Elternkonto verwaltet das Kind, false = eigenes Konto (ab 16) */
  managedByGuardian: boolean;
  publicConsent: boolean;
}

export type EntryStatus = 'pending' | 'confirmed' | 'rejected';

export interface ExerciseLog {
  id: string;
  exerciseId: string;
  level: Level;
  /** Messwert (Anzahl, Sekunden, Treffer). null bei reinen Abhak-Übungen. */
  value: number | null;
  achieved: boolean;
  note: string;
  date: string;
  status: EntryStatus;
  /** Trainer-Bestätigung wurde angefragt */
  requested: boolean;
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

export interface TeamInfo {
  memberId: string;
  teamId: string;
  teamName: string;
  clubName: string;
  status: 'pending' | 'approved' | 'rejected';
  jerseyNumber: number | null;
}

/** Daten des gerade gewählten Spielers */
export interface AppState {
  profile: Player | null;
  logs: ExerciseLog[];
  diary: DiaryEntry[];
  /** Eingelöste Wochen-Challenges, Schlüssel: "<woche>:<challengeId>" (nur auf dem Gerät) */
  claimed: string[];
}
