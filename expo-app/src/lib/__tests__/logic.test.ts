// Ausführen: npm test  (Node-Testrunner über tsx)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EXERCISES, getExercise, isAchieved, targetFor } from '@/data/exercises';
import { TARGETS } from '@/data/targets';
import { ageGroupFor, allowedBirthYears, uClass } from '@/lib/age';
import { levelInfo, logXp, overall, weekKey, xpForLevel } from '@/lib/game';
import type { ExerciseLog } from '@/lib/types';

const log = (over: Partial<ExerciseLog>): ExerciseLog => ({
  id: 'x',
  exerciseId: 'jonglieren',
  level: 'bronze',
  value: 10,
  achieved: false,
  note: '',
  date: new Date().toISOString(),
  status: 'pending',
  requested: false,
  playerConfirmed: true,
  trainerConfirmed: false,
  ...over,
});

describe('Altersklassen (DFB-Stichtag, Saisonwechsel 1. Juli)', () => {
  it('Saison 2026/27: Jahrgang 2008 = U19 (A), 2017 = U10 (E)', () => {
    const nov = new Date('2026-11-21T12:00:00');
    assert.equal(uClass(2008, nov), 19);
    assert.equal(ageGroupFor(2008, nov), 'A');
    assert.equal(ageGroupFor(2017, nov), 'E');
    assert.equal(ageGroupFor(2018, nov), null);
  });
  it('vor dem 1. Juli gilt noch die alte Saison', () => {
    assert.equal(uClass(2014, new Date('2026-06-30T12:00:00')), 12);
    assert.equal(uClass(2014, new Date('2026-07-01T12:00:00')), 13);
  });
  it('10 erlaubte Jahrgänge E bis A', () => {
    assert.equal(allowedBirthYears(new Date('2026-11-21')).length, 10);
  });
});

describe('Zielwerte', () => {
  it('jede Übung hat Werte für alle Altersklassen ab minGroup', () => {
    const groups = ['E', 'D', 'C', 'B', 'A'] as const;
    for (const e of EXERCISES) {
      for (const g of groups.slice(groups.indexOf(e.minGroup))) {
        assert.ok(TARGETS[e.id]?.[g], `${e.id} fehlt für ${g}`);
      }
    }
  });
  it('Bronze ≤ Silber ≤ Gold (bzw. umgekehrt bei Zeiten), außer Sonderfall Einbeinstand', () => {
    for (const e of EXERCISES) {
      if (e.measure === 'check' || e.id === 'einbeinstand') continue;
      for (const row of Object.values(TARGETS[e.id])) {
        const [b, s, g] = row!;
        if (e.lowerIsBetter) assert.ok(b >= s && s >= g, e.id);
        else assert.ok(b <= s && s <= g, e.id);
      }
    }
  });
  it('keine physikalisch unmöglichen Werte (Seilspringen A-Gold ≤ 160, Ballannahme ≤ 35/min)', () => {
    assert.ok(targetFor(getExercise('seilspringen')!, 'gold', 'A') <= 160);
    assert.ok(targetFor(getExercise('ballannahme-wand')!, 'gold', 'A') <= 35);
  });
  it('Abhak-Übungen gelten nie automatisch als erreicht', () => {
    assert.equal(isAchieved(getExercise('finten')!, 'gold', 'E', null), false);
  });
  it('Zeit-Übungen: kleiner ist besser', () => {
    const sprint = getExercise('sprint-20')!;
    assert.equal(isAchieved(sprint, 'bronze', 'E', 4.5), true);
    assert.equal(isAchieved(sprint, 'bronze', 'E', 4.7), false);
  });
});

describe('Punkte und Level', () => {
  it('Level-Schwellen steigen', () => {
    assert.equal(xpForLevel(1), 0);
    assert.equal(levelInfo(0).level, 1);
    assert.equal(levelInfo(xpForLevel(5)).level, 5);
    assert.equal(levelInfo(0).title, 'Rookie');
  });
  it('abgelehnte Einträge bringen keine Punkte', () => {
    assert.equal(logXp(log({ status: 'rejected' })), 0);
    assert.equal(logXp(log({ level: 'gold', achieved: true, status: 'confirmed' })), 35 + 18 + 35);
  });
  it('Gesamt-Skill ignoriert Torwart für Feldspieler', () => {
    const scores = { ballkontrolle: 50, dribbling: 50, passen: 50, schiessen: 50, koordination: 50, athletik: 50, kopf: 50, torwart: 0 };
    assert.equal(overall(scores), 50);
    assert.equal(overall(scores, true), 44);
  });
  it('Wochenschlüssel ist der Montag (auch über die Zeitumstellung)', () => {
    assert.equal(weekKey(new Date('2026-10-25T23:30:00')), '2026-10-19');
    assert.equal(weekKey(new Date('2026-10-26T00:30:00')), '2026-10-26');
  });
});
