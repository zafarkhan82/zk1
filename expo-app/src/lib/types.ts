export type AgeGroup = 'E' | 'D' | 'C' | 'B' | 'A';

export type Level = 'bronze' | 'silber' | 'gold';

export type Category =
  | 'ballkontrolle'
  | 'dribbling'
  | 'passen'
  | 'schiessen'
  | 'koordination'
  | 'athletik'
  | 'kopf'
  | 'torwart';

export type Position = 'Tor' | 'Abwehr' | 'Mittelfeld' | 'Sturm' | 'Noch offen';

export interface Player {
  id: string;
  /** Eindeutiges 6-stelliges Kürzel, z. B. für den Verwendungszweck */
  code: string;
  nickname: string;
  birthYear: number;
  position: Position;
  /** true = ich bin das Elternkonto dieses Kindes */
  managedByGuardian: boolean;
  /** Das Kind hat ein eigenes Login (ab 16 allein oder unter 16 von den Eltern eingerichtet) */
  hasOwnAccess: boolean;
  /** Ich bin selbst diese*r Spieler*in (eigenes Login) */
  isMe: boolean;
  /** Es gibt ein Elternkonto (Zustimmungen liegen dann bei den Eltern, solange unter 16) */
  hasGuardian: boolean;
  publicConsent: boolean;
  /** Profilbild (160 × 160 JPEG als Data-URL) */
  avatar: string | null;
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
  /** Ein Trainer ist für die Freigabe zugeordnet */
  requested: boolean;
  /** Spielerseite (Eltern bzw. Spieler) hat bestätigt */
  playerConfirmed: boolean;
  /** Trainer hat freigegeben */
  trainerConfirmed: boolean;
}

export interface StaffRow {
  clubId: string;
  clubName: string;
  clubStatus: 'pending' | 'approved' | 'rejected';
  role: 'trainer' | 'club_admin';
  membershipStatus: 'pending' | 'approved' | 'rejected';
  teamId: string | null;
  teamName: string | null;
  ageGroup: string | null;
  season: string | null;
  joinCode: string | null;
  pendingMembers: number;
  licenseUntil: string | null;
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
  /** Spielklasse, z. B. "D-Junioren Kreisliga …" */
  league: string | null;
  ageGroup: AgeGroup | null;
  association: string | null;
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
