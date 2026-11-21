import { EXERCISES } from '@/data/exercises';
import { TARGETS } from '@/data/targets';
const q = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'`;
const s = (v: string) => `'${v.replace(/'/g, "''")}'`;
const rows = EXERCISES.map((e) =>
  `(${s(e.id)}, ${s(e.title)}, ${s(e.category)}, ${s(e.emoji)}, ${s(e.minGroup)}, ${s(e.measure)}, ${s(e.unit)}, ${!!e.lowerIsBetter}, ${!!e.noScale}, ${q(TARGETS[e.id] ?? {})}::jsonb, ${q({ variant: e.variant, description: e.description, steps: e.steps, tips: e.tips, equipment: e.equipment, minutes: e.minutes })}::jsonb)`);
console.log(`-- Automatisch erzeugt aus src/data/exercises.ts\ninsert into exercises (id, title, category, emoji, min_group, measure, unit, lower_is_better, no_scale, base, content) values\n${rows.join(',\n')}\non conflict (id) do update set title = excluded.title, category = excluded.category, emoji = excluded.emoji,\n  min_group = excluded.min_group, measure = excluded.measure, unit = excluded.unit, lower_is_better = excluded.lower_is_better,\n  no_scale = excluded.no_scale, base = excluded.base, content = excluded.content, updated_at = now();`);
