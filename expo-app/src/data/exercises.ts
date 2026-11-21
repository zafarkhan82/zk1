import { groupIndex } from '@/lib/age';
import type { AgeGroup, Category, Level } from '@/lib/types';

export const CATEGORIES: { id: Category; label: string; emoji: string }[] = [
  { id: 'ballkontrolle', label: 'Ballkontrolle', emoji: '🎯' },
  { id: 'dribbling', label: 'Dribbling', emoji: '⚡' },
  { id: 'passen', label: 'Passen', emoji: '🔁' },
  { id: 'schiessen', label: 'Schießen', emoji: '🥅' },
  { id: 'koordination', label: 'Koordination', emoji: '🌀' },
  { id: 'athletik', label: 'Athletik', emoji: '💪' },
  { id: 'kopf', label: 'Kopf & Taktik', emoji: '🧠' },
];

export const LEVELS: { id: Level; label: string; sub: string; xp: number }[] = [
  { id: 'bronze', label: 'Bronze', sub: 'Einsteiger', xp: 10 },
  { id: 'silber', label: 'Silber', sub: 'Fortgeschritten', xp: 20 },
  { id: 'gold', label: 'Gold', sub: 'Top-Niveau', xp: 35 },
];

export type MeasureType = 'count' | 'seconds' | 'hits' | 'check';

export interface Exercise {
  id: string;
  title: string;
  category: Category;
  emoji: string;
  /** Jüngste Altersklasse, für die die Übung gedacht ist. */
  minGroup: AgeGroup;
  measure: MeasureType;
  /** Einheit, z. B. "Ballkontakte" */
  unit: string;
  /** Höher ist besser (Standard) oder niedriger (z. B. Zeit). */
  lowerIsBetter?: boolean;
  /** Zielwerte für die E-Jugend; ältere Jahrgänge werden automatisch angehoben. */
  base: Record<Level, number>;
  /** Treffer-Ziele (von 10) werden nicht skaliert. */
  noScale?: boolean;
  /** Was sich je Stärkegrad an der Ausführung ändert. */
  variant: Record<Level, string>;
  description: string;
  steps: string[];
  tips: string[];
  equipment: string;
  minutes: number;
}

const COUNT_FACTOR: Record<AgeGroup, number> = { E: 1, D: 1.3, C: 1.6, B: 1.9, A: 2.2 };
const TIME_FACTOR: Record<AgeGroup, number> = { E: 1, D: 0.92, C: 0.86, B: 0.81, A: 0.77 };

export function targetFor(ex: Exercise, level: Level, group: AgeGroup): number {
  const base = ex.base[level];
  if (ex.measure === 'check' || ex.noScale) return base;
  if (ex.lowerIsBetter) return Math.round(base * TIME_FACTOR[group] * 10) / 10;
  return Math.round(base * COUNT_FACTOR[group]);
}

export function isAchieved(ex: Exercise, level: Level, group: AgeGroup, value: number | null) {
  if (ex.measure === 'check') return true;
  if (value === null || Number.isNaN(value)) return false;
  const t = targetFor(ex, level, group);
  return ex.lowerIsBetter ? value <= t : value >= t;
}

export function exercisesFor(group: AgeGroup): Exercise[] {
  return EXERCISES.filter((e) => groupIndex(e.minGroup) <= groupIndex(group));
}

export function getExercise(id: string): Exercise | undefined {
  return EXERCISES.find((e) => e.id === id);
}

export const EXERCISES: Exercise[] = [
  // ───────────── Ballkontrolle ─────────────
  {
    id: 'jonglieren',
    title: 'Jonglieren',
    category: 'ballkontrolle',
    emoji: '🤹',
    minGroup: 'E',
    measure: 'count',
    unit: 'Ballkontakte am Stück',
    base: { bronze: 10, silber: 25, gold: 50 },
    variant: {
      bronze: 'Mit deinem starken Fuß, der Ball darf einmal aufspringen.',
      silber: 'Ohne Aufspringen, nur Füße.',
      gold: 'Ohne Aufspringen, abwechselnd links und rechts.',
    },
    description: 'Halte den Ball so lange wie möglich in der Luft. Das schult Ballgefühl und Gleichgewicht.',
    steps: [
      'Ball mit den Händen fallen lassen und mit dem Spann leicht nach oben spielen.',
      'Fußspitze leicht nach oben ziehen, damit der Ball gerade hochgeht.',
      'Zähle deine Kontakte. Drei Versuche – der beste zählt.',
    ],
    tips: ['Kleine, weiche Kontakte statt kräftiger Tritte.', 'Blick auf den Ball, Knie locker.'],
    equipment: 'Ball',
    minutes: 10,
  },
  {
    id: 'ballannahme-wand',
    title: 'Ballannahme an der Wand',
    category: 'ballkontrolle',
    emoji: '🧱',
    minGroup: 'E',
    measure: 'count',
    unit: 'saubere Annahmen in 1 Minute',
    base: { bronze: 12, silber: 18, gold: 24 },
    variant: {
      bronze: 'Annahme mit der Innenseite, starker Fuß.',
      silber: 'Annahme abwechselnd links und rechts.',
      gold: 'Annahme in die Bewegung (Ball zur Seite mitnehmen), beidfüßig.',
    },
    description: 'Spiele gegen eine Wand und nimm den zurückkommenden Ball sauber an, bevor du wieder passt.',
    steps: [
      'Stell dich 3–5 Meter vor eine Wand.',
      'Pass gegen die Wand, Ball annehmen, erst dann wieder passen.',
      'Zähle nur Annahmen, bei denen der Ball nah bei dir bleibt.',
    ],
    tips: ['Fuß beim Annehmen leicht zurücknehmen, um den Ball abzufedern.', 'Vor der Annahme kurz umschauen – wie im Spiel.'],
    equipment: 'Ball, Wand',
    minutes: 10,
  },
  {
    id: 'sohle-rollen',
    title: 'Sohlen-Rollen',
    category: 'ballkontrolle',
    emoji: '👟',
    minGroup: 'E',
    measure: 'count',
    unit: 'Wechsel in 30 Sekunden',
    base: { bronze: 25, silber: 40, gold: 55 },
    variant: {
      bronze: 'Ball mit der Sohle hin und her rollen, im Stand.',
      silber: 'Wechsel links-rechts mit kleinem Hüpfer.',
      gold: 'Wechsel links-rechts und dabei um 360° drehen.',
    },
    description: 'Schnelle Sohlenkontakte trainieren Fußgeschick und schnelle Füße.',
    steps: ['Ball vor dich legen.', 'Abwechselnd mit linker und rechter Sohle kurz auf den Ball tippen.', 'Jeder Kontakt zählt als Wechsel.'],
    tips: ['Auf den Fußballen bleiben.', 'Oberkörper aufrecht, nicht nach unten krümmen.'],
    equipment: 'Ball',
    minutes: 5,
  },
  {
    id: 'hoher-ball-kontrolle',
    title: 'Hohe Bälle kontrollieren',
    category: 'ballkontrolle',
    emoji: '🪂',
    minGroup: 'D',
    measure: 'hits',
    unit: 'kontrollierte Bälle von 10',
    noScale: true,
    base: { bronze: 5, silber: 7, gold: 9 },
    variant: {
      bronze: 'Ball selbst hochwerfen, mit Oberschenkel oder Fuß annehmen.',
      silber: 'Ball hochschießen, mit Brust oder Oberschenkel annehmen.',
      gold: 'Ball hoch zuspielen lassen und direkt in eine Richtung mitnehmen.',
    },
    description: 'Hohe Bälle sicher runterholen ist im Spiel Gold wert.',
    steps: ['10 Versuche.', 'Ein Versuch zählt, wenn der Ball nach höchstens einem Aufspringen kontrolliert bei dir liegt.'],
    tips: ['Körperteil beim Kontakt leicht zurücknehmen.', 'Früh unter den Ball laufen.'],
    equipment: 'Ball',
    minutes: 10,
  },

  // ───────────── Dribbling ─────────────
  {
    id: 'slalom',
    title: 'Hütchen-Slalom',
    category: 'dribbling',
    emoji: '🚧',
    minGroup: 'E',
    measure: 'seconds',
    unit: 'Sekunden für hin und zurück',
    lowerIsBetter: true,
    base: { bronze: 22, silber: 18, gold: 15 },
    variant: {
      bronze: 'Nur mit dem starken Fuß.',
      silber: 'Innen- und Außenseite des starken Fußes.',
      gold: 'Beide Füße, jeder Kontakt abwechselnd.',
    },
    description: '6 Hütchen (oder Flaschen) im Abstand von 1,5 m. Dribble hin und zurück im Slalom.',
    steps: ['Hütchen in einer Linie aufstellen.', 'Zeit läuft ab dem ersten Ballkontakt.', 'Berührst du ein Hütchen: +1 Sekunde.'],
    tips: ['Viele kleine Kontakte, Ball nah am Fuß.', 'Erst sauber, dann schnell.'],
    equipment: 'Ball, 6 Hütchen/Flaschen, Stoppuhr',
    minutes: 15,
  },
  {
    id: 'finten',
    title: 'Finten-Training',
    category: 'dribbling',
    emoji: '🕺',
    minGroup: 'E',
    measure: 'check',
    unit: 'erledigt',
    base: { bronze: 1, silber: 1, gold: 1 },
    variant: {
      bronze: 'Übersteiger: 20× pro Seite langsam und sauber.',
      silber: 'Übersteiger + Schere: je 20× pro Seite im Tempo.',
      gold: 'Eigene Finten-Kombination (3 Finten nacheinander) 15× flüssig.',
    },
    description: 'Finten helfen dir, im 1-gegen-1 am Gegner vorbeizukommen.',
    steps: ['Ein Hütchen als Gegenspieler hinstellen.', 'Auf das Hütchen zudribbeln, Finte, dann explosiv vorbei.', 'Jede Seite gleich oft üben.'],
    tips: ['Die Finte mit dem Oberkörper verkaufen.', 'Nach der Finte das Tempo erhöhen.'],
    equipment: 'Ball, 1 Hütchen',
    minutes: 15,
  },
  {
    id: 'acht-dribbling',
    title: 'Achter-Dribbling',
    category: 'dribbling',
    emoji: '♾️',
    minGroup: 'E',
    measure: 'count',
    unit: 'Achter in 1 Minute',
    base: { bronze: 4, silber: 6, gold: 8 },
    variant: {
      bronze: 'Mit beliebigem Fuß.',
      silber: 'Nur Außenseite.',
      gold: 'Nur schwacher Fuß.',
    },
    description: 'Dribble eine liegende Acht um zwei Hütchen im Abstand von 3 Metern.',
    steps: ['Zwei Hütchen 3 m auseinander.', 'In einer Acht um beide Hütchen dribbeln.', 'Ganze Achter in einer Minute zählen.'],
    tips: ['In den Kurven den Ball eng führen.', 'Kopf zwischendurch heben.'],
    equipment: 'Ball, 2 Hütchen, Stoppuhr',
    minutes: 10,
  },
  {
    id: 'eins-gegen-eins',
    title: '1-gegen-1 Duelle',
    category: 'dribbling',
    emoji: '⚔️',
    minGroup: 'D',
    measure: 'hits',
    unit: 'gewonnene Duelle von 10',
    noScale: true,
    base: { bronze: 4, silber: 6, gold: 8 },
    variant: {
      bronze: 'Gegen einen Freund, Ziel: über eine Linie dribbeln.',
      silber: 'Feld 10×15 m, Ziel: in ein Mini-Tor treffen.',
      gold: 'Gegen einen älteren oder stärkeren Spieler.',
    },
    description: 'Spiele 10 Duelle gegen einen Partner. Zähle, wie viele du gewinnst.',
    steps: ['Feld markieren.', 'Abwechselnd angreifen.', 'Notiere deine gewonnenen Angriffe.'],
    tips: ['Auf den Gegner zudribbeln, um ihn festzumachen.', 'Richtungswechsel mit Tempo.'],
    equipment: 'Ball, Partner, Hütchen',
    minutes: 20,
  },

  // ───────────── Passen ─────────────
  {
    id: 'wandpass',
    title: 'Direktpässe an die Wand',
    category: 'passen',
    emoji: '🔁',
    minGroup: 'E',
    measure: 'count',
    unit: 'Direktpässe am Stück',
    base: { bronze: 15, silber: 30, gold: 50 },
    variant: {
      bronze: 'Abstand 3 m, starker Fuß.',
      silber: 'Abstand 4 m, abwechselnd links und rechts.',
      gold: 'Abstand 5 m, nur schwacher Fuß.',
    },
    description: 'Spiele den Ball direkt gegen die Wand zurück, ohne ihn zu stoppen.',
    steps: ['Abstand markieren.', 'Direkt zurückpassen.', 'Wenn du stoppen musst, beginnt die Zählung neu.'],
    tips: ['Standbein neben den Ball, Fußgelenk fest.', 'Mit der Innenseite flach passen.'],
    equipment: 'Ball, Wand',
    minutes: 10,
  },
  {
    id: 'passgenauigkeit',
    title: 'Pass ins Mini-Tor',
    category: 'passen',
    emoji: '🎯',
    minGroup: 'E',
    measure: 'hits',
    unit: 'Treffer von 10',
    noScale: true,
    base: { bronze: 5, silber: 7, gold: 9 },
    variant: {
      bronze: '2 Hütchen 1 m breit, 8 m Abstand, starker Fuß.',
      silber: '10 m Abstand, 5× links, 5× rechts.',
      gold: '12 m Abstand, Ball vorher annehmen und in Bewegung passen.',
    },
    description: 'Triff mit flachen Pässen ein kleines Hütchen-Tor.',
    steps: ['Mini-Tor aus zwei Hütchen bauen.', '10 Pässe.', 'Nur flache Pässe zählen.'],
    tips: ['Ziel anschauen, dann Ball anschauen, dann passen.', 'Durchschwingen in Richtung Ziel.'],
    equipment: 'Ball, 2 Hütchen',
    minutes: 10,
  },
  {
    id: 'flugball',
    title: 'Flugbälle',
    category: 'passen',
    emoji: '🌈',
    minGroup: 'C',
    measure: 'hits',
    unit: 'Treffer im Zielfeld von 10',
    noScale: true,
    base: { bronze: 4, silber: 6, gold: 8 },
    variant: {
      bronze: 'Zielfeld 5×5 m in 20 m Entfernung.',
      silber: 'Zielfeld 5×5 m in 30 m Entfernung.',
      gold: '30 m, beidfüßig (5× links, 5× rechts).',
    },
    description: 'Lange, hohe Pässe präzise in ein Zielfeld spielen.',
    steps: ['Zielfeld markieren.', '10 Flugbälle aus dem Stand oder kurzem Anlauf.', 'Der Ball muss im Feld aufkommen.'],
    tips: ['Ball unten treffen, Oberkörper leicht zurück.', 'Durchschwingen.'],
    equipment: 'Ball(e), Hütchen',
    minutes: 15,
  },

  // ───────────── Schießen ─────────────
  {
    id: 'torschuss-ecken',
    title: 'Torschuss in die Ecken',
    category: 'schiessen',
    emoji: '🥅',
    minGroup: 'E',
    measure: 'hits',
    unit: 'Treffer von 10',
    noScale: true,
    base: { bronze: 4, silber: 6, gold: 8 },
    variant: {
      bronze: 'Halbes Tor rechts/links als Ziel, 9 m.',
      silber: 'Nur untere Ecken (Ziel-Markierung), 11 m.',
      gold: 'Untere Ecken, beidfüßig, aus der Bewegung.',
    },
    description: 'Präzision vor Kraft: Triff die Ecken des Tores.',
    steps: ['Ecken mit Hütchen oder Bändern markieren.', '10 Schüsse.', 'Treffer im markierten Bereich zählen.'],
    tips: ['Spann oder Innenseite – Hauptsache genau.', 'Standbein neben den Ball, Oberkörper über den Ball.'],
    equipment: 'Ball(e), Tor oder Wand mit Markierung',
    minutes: 15,
  },
  {
    id: 'schwacher-fuss',
    title: 'Schwacher-Fuß-Challenge',
    category: 'schiessen',
    emoji: '🦶',
    minGroup: 'E',
    measure: 'hits',
    unit: 'Treffer von 10',
    noScale: true,
    base: { bronze: 3, silber: 5, gold: 7 },
    variant: {
      bronze: 'Mit schwachem Fuß aufs leere Tor aus 7 m.',
      silber: 'Schwacher Fuß, Ziel halbes Tor, 9 m.',
      gold: 'Schwacher Fuß, untere Ecken, 11 m.',
    },
    description: 'Wer mit beiden Füßen schießen kann, ist doppelt gefährlich.',
    steps: ['Nur der schwache Fuß zählt.', '10 Schüsse, Treffer zählen.'],
    tips: ['Lieber langsam und sauber.', 'Täglich ein paar Minuten – das macht den Unterschied.'],
    equipment: 'Ball, Tor oder Wand',
    minutes: 10,
  },
  {
    id: 'volley',
    title: 'Volleyschuss',
    category: 'schiessen',
    emoji: '💥',
    minGroup: 'D',
    measure: 'hits',
    unit: 'Treffer aufs Tor von 10',
    noScale: true,
    base: { bronze: 3, silber: 5, gold: 7 },
    variant: {
      bronze: 'Ball aus der Hand fallen lassen, Dropkick aufs Tor.',
      silber: 'Ball zugeworfen bekommen, Volley aufs Tor.',
      gold: 'Seitlich zugeworfen, Volley in eine Torhälfte.',
    },
    description: 'Den Ball direkt aus der Luft nehmen – Timing ist alles.',
    steps: ['10 Versuche.', 'Treffer aufs Tor (oder in die Zielfläche) zählen.'],
    tips: ['Knie über den Ball, damit er nicht in den Himmel geht.', 'Fußgelenk fest.'],
    equipment: 'Ball, Tor, evtl. Partner',
    minutes: 15,
  },

  // ───────────── Koordination ─────────────
  {
    id: 'koordinationsleiter',
    title: 'Koordinationsleiter',
    category: 'koordination',
    emoji: '🪜',
    minGroup: 'E',
    measure: 'seconds',
    unit: 'Sekunden für 3 Durchgänge',
    lowerIsBetter: true,
    base: { bronze: 20, silber: 16, gold: 13 },
    variant: {
      bronze: 'Ein Fuß pro Feld.',
      silber: 'Beide Füße in jedes Feld.',
      gold: 'Seitlich: rein-rein-raus-raus.',
    },
    description: 'Schnelle Füße durch eine Leiter (auch mit Kreide oder Schnüren gemalt).',
    steps: ['Leiter mit 8–10 Feldern.', 'Drei Durchgänge hintereinander, Zeit stoppen.', 'Feld verfehlt: +1 Sekunde.'],
    tips: ['Auf den Fußballen bleiben.', 'Arme mitnehmen.'],
    equipment: 'Leiter oder Kreide, Stoppuhr',
    minutes: 10,
  },
  {
    id: 'einbeinstand',
    title: 'Gleichgewicht auf einem Bein',
    category: 'koordination',
    emoji: '🦩',
    minGroup: 'E',
    measure: 'count',
    unit: 'Sekunden auf einem Bein',
    base: { bronze: 20, silber: 30, gold: 45 },
    variant: {
      bronze: 'Augen auf, Arme frei.',
      silber: 'Augen auf, Ball dabei mit den Händen um den Körper kreisen.',
      gold: 'Augen zu.',
    },
    description: 'Gutes Gleichgewicht hilft beim Schießen, Passen und in Zweikämpfen.',
    steps: ['Auf ein Bein stellen, anderes Knie leicht anheben.', 'Zeit stoppen, bis der Fuß den Boden berührt.', 'Beide Beine testen, das schwächere zählt.'],
    tips: ['Einen Punkt fixieren (bei Augen auf).', 'Bauch leicht anspannen.'],
    equipment: 'Stoppuhr',
    minutes: 5,
  },
  {
    id: 'ball-prellen',
    title: 'Dribbeln & Prellen',
    category: 'koordination',
    emoji: '🏀',
    minGroup: 'E',
    measure: 'count',
    unit: 'Meter ohne Fehler',
    base: { bronze: 10, silber: 20, gold: 30 },
    variant: {
      bronze: 'Fußball am Fuß, Tennisball mit der Hand prellen, gehen.',
      silber: 'Wie Bronze, aber im Lauftempo.',
      gold: 'Wie Silber, Tennisball mit der schwachen Hand.',
    },
    description: 'Zwei Dinge gleichzeitig: Das trainiert dein Gehirn und deine Übersicht.',
    steps: ['Strecke markieren.', 'Fußball mit dem Fuß führen, gleichzeitig Tennisball prellen.', 'Meter bis zum ersten Fehler zählen.'],
    tips: ['Blick nach vorne, nicht nur auf die Bälle.'],
    equipment: 'Fußball, Tennisball',
    minutes: 10,
  },

  // ───────────── Athletik ─────────────
  {
    id: 'sprint-20',
    title: '20-Meter-Sprint',
    category: 'athletik',
    emoji: '🏃',
    minGroup: 'E',
    measure: 'seconds',
    unit: 'Sekunden',
    lowerIsBetter: true,
    base: { bronze: 4.6, silber: 4.2, gold: 3.9 },
    variant: {
      bronze: 'Ohne Ball, Start aus dem Stand.',
      silber: 'Ohne Ball, bestes von 3 Versuchen.',
      gold: 'Mit Ball am Fuß (Ziel gilt trotzdem!).',
    },
    description: 'Schnelligkeit über kurze Strecken entscheidet viele Spielszenen.',
    steps: ['20 m abmessen.', 'Jemand stoppt die Zeit.', '2 Minuten Pause zwischen den Versuchen.'],
    tips: ['Vorher gut aufwärmen.', 'Die ersten Schritte kurz und schnell.'],
    equipment: 'Stoppuhr, Maßband, Helfer',
    minutes: 15,
  },
  {
    id: 'seilspringen',
    title: 'Seilspringen',
    category: 'athletik',
    emoji: '🪢',
    minGroup: 'E',
    measure: 'count',
    unit: 'Sprünge in 1 Minute',
    base: { bronze: 50, silber: 80, gold: 110 },
    variant: {
      bronze: 'Beidbeinig.',
      silber: 'Abwechselnd links und rechts.',
      gold: 'Abwechselnd, mit Kreuzsprüngen zwischendurch.',
    },
    description: 'Stärkt Sprunggelenke, Ausdauer und Rhythmus.',
    steps: ['1 Minute Zeit stoppen.', 'Sprünge zählen.', 'Fehler sind erlaubt, einfach weiter.'],
    tips: ['Nur kleine Sprünge, auf den Fußballen.'],
    equipment: 'Springseil, Stoppuhr',
    minutes: 5,
  },
  {
    id: 'shuttle-run',
    title: 'Pendellauf 5-10-5',
    category: 'athletik',
    emoji: '↔️',
    minGroup: 'D',
    measure: 'seconds',
    unit: 'Sekunden',
    lowerIsBetter: true,
    base: { bronze: 6.4, silber: 5.9, gold: 5.5 },
    variant: {
      bronze: 'Ohne Ball, Richtungswechsel mit Hand am Boden.',
      silber: 'Ohne Ball, bestes von 3 Versuchen.',
      gold: 'Mit Ball am Fuß.',
    },
    description: 'Testet Antritt und Richtungswechsel – genau das brauchst du im Spiel.',
    steps: ['Drei Linien im Abstand von 5 m.', 'Start Mitte: 5 m links, 10 m rechts, 5 m zurück zur Mitte.', 'Zeit stoppen.'],
    tips: ['Tief abbremsen, Körperschwerpunkt runter.'],
    equipment: 'Hütchen, Stoppuhr',
    minutes: 15,
  },
  {
    id: 'rumpf',
    title: 'Rumpf-Stabilität (Unterarmstütz)',
    category: 'athletik',
    emoji: '🧱',
    minGroup: 'D',
    measure: 'count',
    unit: 'Sekunden halten',
    base: { bronze: 30, silber: 45, gold: 60 },
    variant: {
      bronze: 'Unterarmstütz, Knie dürfen am Boden sein.',
      silber: 'Normaler Unterarmstütz.',
      gold: 'Unterarmstütz, abwechselnd ein Bein anheben.',
    },
    description: 'Ein starker Rumpf schützt vor Verletzungen und macht dich zweikampfstark.',
    steps: ['Auf Unterarme und Zehen stützen.', 'Körper gerade wie ein Brett.', 'Zeit stoppen, bis die Hüfte durchhängt.'],
    tips: ['Weiter atmen!', 'Qualität vor Dauer.'],
    equipment: 'Matte',
    minutes: 5,
  },

  // ───────────── Kopf & Taktik ─────────────
  {
    id: 'schulterblick',
    title: 'Schulterblick-Training',
    category: 'kopf',
    emoji: '👀',
    minGroup: 'E',
    measure: 'check',
    unit: 'erledigt',
    base: { bronze: 1, silber: 1, gold: 1 },
    variant: {
      bronze: 'Beim Wandpassen vor jeder Annahme einmal über die Schulter schauen.',
      silber: 'Partner hält hinter dir Finger hoch – Zahl ansagen, dann Ball annehmen.',
      gold: 'Im Vereinstraining bewusst vor jeder Ballannahme umschauen und danach notieren, wie oft es geklappt hat.',
    },
    description: 'Gute Spieler wissen schon vor der Ballannahme, was sie als Nächstes machen.',
    steps: ['10 Minuten konzentriert üben.', 'Danach im Tagebuch notieren, wie es lief.'],
    tips: ['Kurz und oft schauen, nicht lang und selten.'],
    equipment: 'Ball, Wand, evtl. Partner',
    minutes: 10,
  },
  {
    id: 'spielanalyse',
    title: 'Eigenes Spiel analysieren',
    category: 'kopf',
    emoji: '📋',
    minGroup: 'D',
    measure: 'check',
    unit: 'erledigt',
    base: { bronze: 1, silber: 1, gold: 1 },
    variant: {
      bronze: 'Nach dem Spiel 3 Dinge aufschreiben, die gut liefen.',
      silber: '3 gute Dinge + 2 Dinge, die du verbessern willst.',
      gold: 'Spielvideo (wenn vorhanden) anschauen und 3 eigene Szenen bewerten.',
    },
    description: 'Wer über sein Spiel nachdenkt, lernt schneller.',
    steps: ['Nach einem Spiel ruhig hinsetzen.', 'Aufgabe für deinen Stärkegrad erledigen.', 'Ergebnis ins Tagebuch schreiben.'],
    tips: ['Ehrlich sein, aber nicht zu streng mit dir.'],
    equipment: 'Tagebuch',
    minutes: 15,
  },
  {
    id: 'regelwissen',
    title: 'Regel-Quiz mit dem Trainer',
    category: 'kopf',
    emoji: '📖',
    minGroup: 'E',
    measure: 'hits',
    unit: 'richtige Antworten von 10',
    noScale: true,
    base: { bronze: 6, silber: 8, gold: 10 },
    variant: {
      bronze: 'Grundregeln: Einwurf, Ecke, Abstoß, Foul.',
      silber: 'Abseits, Freistoßarten, Rückpass.',
      gold: 'Schwierige Situationen: Vorteil, Handspiel, Strafstoß-Regeln.',
    },
    description: 'Lass dir 10 Regelfragen stellen – von Trainer, Eltern oder Mitspielern.',
    steps: ['10 Fragen beantworten.', 'Richtige Antworten zählen.'],
    tips: ['Profis kennen die Regeln besser als man denkt.'],
    equipment: 'Fragensteller',
    minutes: 10,
  },
];

export const DAILY_TIPS: { text: string; minGroup?: 'E' | 'D' | 'C' | 'B' | 'A' }[] = [
  { text: 'Trink vor, während und nach dem Training Wasser – auch wenn du keinen Durst hast.' },
  { text: 'Schlaf ist Training für deinen Körper: 9–10 Stunden helfen dir, besser zu werden.' },
  { text: 'Jeden Tag 5 Minuten schwacher Fuß bringen mehr als einmal pro Woche eine Stunde.' },
  { text: 'Fehler gehören dazu. Wer nichts versucht, macht auch keine Fortschritte.' },
  { text: 'Vor jeder Ballannahme kurz umschauen – so weißt du, wo Platz ist.' },
  { text: 'Fairplay: Gib dem Gegner nach dem Spiel die Hand, egal wie es ausgeht.' },
  { text: 'Eine Banane oder Vollkornbrot 1–2 Stunden vor dem Training gibt dir Energie.' },
  { text: 'Lobe deine Mitspieler – ein gutes Team macht jeden Einzelnen besser.' },
  { text: 'Dehnen nach dem Training hilft deinem Körper bei der Erholung.', minGroup: 'D' },
  { text: 'Setz dir für jede Woche ein kleines, klares Ziel und schreib es ins Tagebuch.', minGroup: 'D' },
  { text: 'Handy eine Stunde vor dem Schlafen weglegen – dein Körper erholt sich besser.', minGroup: 'C' },
  { text: 'Krafttraining nur mit Anleitung von Trainern – Technik vor Gewicht.', minGroup: 'B' },
  { text: 'Schule und Fußball gehören zusammen: Ein Plan für die Woche hilft bei beidem.', minGroup: 'C' },
];
