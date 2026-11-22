// Supabase Edge Function: Abgleich mit fussball.de / DFBnet über die offizielle API.
//
// Aufruf (angemeldet, Vereins-Admin oder Plattform-Admin):
//   supabase.functions.invoke('fussballde-sync', { body: { club_id } })   → ein Verein
//   supabase.functions.invoke('fussballde-sync', { body: {} })            → alle verknüpften Vereine (nur Plattform-Admin)
//
// Secrets (Supabase → Edge Functions → Secrets), sobald der DFB den Zugang freigibt:
//   FUSSBALLDE_API_BASE   z. B. https://api.example.dfb.de/v1   (aus der API-Dokumentation)
//   FUSSBALLDE_API_KEY    API-Schlüssel / Token
//
// Nur der Abschnitt "ADAPTER" muss an die echte API angepasst werden. Alles andere (Protokoll,
// Zwischenspeicher, Übernahme ohne Löschen, Historie) ist fertig.
import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = ['https://zafarkhan82.github.io', 'http://localhost:8081'];

// ───────────────────────── Normalisiertes Format (fest) ─────────────────────────

interface NClub {
  external_id: string;
  name: string;
  city?: string;
  postal_code?: string;
  association?: string; // Landesverband
  district?: string; // Kreis
  club_number?: string; // DFB-Vereinsnummer
  logo_url?: string;
  address?: string;
}
interface NTeam {
  external_id: string;
  name: string;
  age_group: 'E' | 'D' | 'C' | 'B' | 'A' | null; // nur Jugend wird übernommen
  league?: string;
  season?: string; // "2026/27"
}
interface NMatch {
  external_id: string;
  opponent: string;
  kickoff: string; // ISO
  is_home: boolean;
  competition?: string;
  venue?: string;
  goals_for?: number | null;
  goals_against?: number | null;
}

/** Altersklasse aus Mannschaftsnamen ("D-Junioren", "U13", "E1-Jugend" …) */
export function ageGroupFromName(name: string): NTeam['age_group'] {
  const n = name.toUpperCase();
  const letter = n.match(/\b([A-E])[\s-]?(\d)?[\s-]?(JUGEND|JUNIOREN|JUNIORINNEN|JUN\.?)\b/);
  if (letter) return letter[1] as NTeam['age_group'];
  const u = n.match(/\bU\s?(\d{1,2})\b/);
  if (u) {
    const k = Number(u[1]);
    if (k >= 18 && k <= 19) return 'A';
    if (k >= 16) return 'B';
    if (k >= 14) return 'C';
    if (k >= 12) return 'D';
    if (k >= 10) return 'E';
  }
  return null;
}

// ───────────────────────── ADAPTER (an echte API anpassen) ─────────────────────────
// Die Feldnamen unten sind Annahmen. Mit der API-Dokumentation die Pfade und Felder eintragen.
// pick() probiert mehrere mögliche Feldnamen, damit kleine Abweichungen nicht sofort brechen.

// deno-lint-ignore no-explicit-any
type Any = any;
const pick = (o: Any, ...keys: string[]) => keys.map((k) => k.split('.').reduce((v: Any, p) => v?.[p], o)).find((v) => v !== undefined && v !== null);

async function api(path: string): Promise<Any> {
  const base = Deno.env.get('FUSSBALLDE_API_BASE')!;
  const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    headers: {
      Authorization: `Bearer ${Deno.env.get('FUSSBALLDE_API_KEY')}`,
      Accept: 'application/json',
    },
  });
  if (res.status === 429) throw new Error('fussball.de: zu viele Anfragen (Rate-Limit). Bitte später erneut versuchen.');
  if (!res.ok) throw new Error(`fussball.de antwortet mit ${res.status} für ${path}`);
  return res.json();
}

const ADAPTER = {
  // TODO(API-Doku): echten Pfad eintragen
  async club(externalId: string): Promise<{ club: NClub; teams: NTeam[]; raw: Any }> {
    const raw = await api(`/clubs/${encodeURIComponent(externalId)}`);
    const teamsRaw: Any[] = pick(raw, 'teams', 'mannschaften', 'data.teams') ?? (await api(`/clubs/${encodeURIComponent(externalId)}/teams`));
    const club: NClub = {
      external_id: externalId,
      name: pick(raw, 'name', 'vereinsname', 'data.name') ?? '',
      city: pick(raw, 'city', 'ort', 'address.city'),
      postal_code: pick(raw, 'postalCode', 'plz', 'address.zip'),
      association: pick(raw, 'association', 'landesverband', 'verband'),
      district: pick(raw, 'district', 'kreis'),
      club_number: pick(raw, 'clubNumber', 'vereinsnummer'),
      logo_url: pick(raw, 'logoUrl', 'logo', 'wappen'),
      address: pick(raw, 'address.street', 'strasse'),
    };
    const teams: NTeam[] = (teamsRaw ?? []).map((t: Any) => {
      const name = pick(t, 'name', 'mannschaftsname', 'teamName') ?? '';
      return {
        external_id: String(pick(t, 'id', 'teamId', 'mannschaftsId')),
        name,
        age_group: ageGroupFromName(`${name} ${pick(t, 'ageClass', 'altersklasse') ?? ''}`),
        league: pick(t, 'league', 'staffel', 'spielklasse', 'competition.name'),
        season: pick(t, 'season', 'saison'),
      };
    });
    return { club, teams, raw };
  },

  // TODO(API-Doku): echten Pfad eintragen
  async matches(teamExternalId: string): Promise<{ matches: NMatch[]; raw: Any }> {
    const raw = await api(`/teams/${encodeURIComponent(teamExternalId)}/matches`);
    const list: Any[] = Array.isArray(raw) ? raw : (pick(raw, 'matches', 'spiele', 'data') ?? []);
    const matches: NMatch[] = list.map((m: Any) => {
      const homeId = String(pick(m, 'homeTeam.id', 'heim.id', 'homeTeamId') ?? '');
      const isHome = homeId === teamExternalId;
      const homeGoals = pick(m, 'result.home', 'toreHeim', 'homeGoals');
      const awayGoals = pick(m, 'result.away', 'toreGast', 'awayGoals');
      return {
        external_id: String(pick(m, 'id', 'matchId', 'spielId')),
        opponent: (isHome ? pick(m, 'awayTeam.name', 'gast.name', 'awayTeamName') : pick(m, 'homeTeam.name', 'heim.name', 'homeTeamName')) ?? 'Unbekannt',
        kickoff: pick(m, 'kickoff', 'anstoss', 'date', 'datum'),
        is_home: isHome,
        competition: pick(m, 'competition.name', 'wettbewerb', 'staffel'),
        venue: pick(m, 'venue.name', 'spielstaette', 'platz'),
        goals_for: homeGoals == null ? null : Number(isHome ? homeGoals : awayGoals),
        goals_against: homeGoals == null ? null : Number(isHome ? awayGoals : homeGoals),
      };
    });
    return { matches, raw };
  },
};

// ───────────────────────── Ablauf (fest) ─────────────────────────

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') ?? '';
  const cors = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = Deno.env.get('SUPABASE_URL')!;
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: u } = await userClient.auth.getUser();
  if (!u.user) return json({ error: 'Nicht angemeldet' }, 401);
  const body = await req.json().catch(() => ({}));
  const clubId: string | undefined = body.club_id;

  // Berechtigung: Plattform-Admin oder Vereins-Admin des Vereins
  const { data: isAdmin } = await userClient.rpc('is_platform_admin');
  if (!isAdmin) {
    if (!clubId) return json({ error: 'Nur Plattform-Admins dürfen alle Vereine abgleichen.' }, 403);
    const { data: isClubAdmin } = await userClient.rpc('is_club_admin', { p_club: clubId });
    if (!isClubAdmin) return json({ error: 'Nur für Vereins-Admins.' }, 403);
  }

  // Ein Lauf pro Verein höchstens alle 15 Minuten
  if (clubId) {
    const { data: recent } = await admin
      .from('sync_runs')
      .select('started_at')
      .eq('club_id', clubId)
      .gte('started_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())
      .limit(1);
    if (recent?.length) return json({ error: 'Der letzte Abgleich ist weniger als 15 Minuten her.' }, 429);
  }

  const { data: run } = await admin
    .from('sync_runs')
    .insert({ scope: clubId ? 'club' : 'all', club_id: clubId ?? null, started_by: u.user.id })
    .select()
    .single();

  if (!Deno.env.get('FUSSBALLDE_API_BASE') || !Deno.env.get('FUSSBALLDE_API_KEY')) {
    await admin
      .from('sync_runs')
      .update({ status: 'nicht_eingerichtet', message: 'API-Zugang zu fussball.de ist noch nicht hinterlegt.', finished_at: new Date().toISOString() })
      .eq('id', run.id);
    return json({ status: 'nicht_eingerichtet', message: 'Der API-Zugang zu fussball.de ist noch nicht eingerichtet.' });
  }

  try {
    let q = admin.from('clubs').select('id, fussballde_id').not('fussballde_id', 'is', null);
    if (clubId) q = q.eq('id', clubId);
    const { data: clubs } = await q;
    if (!clubs?.length) throw new Error('Kein Verein mit fussball.de-ID verknüpft.');

    for (const c of clubs) {
      const { club, teams, raw } = await ADAPTER.club(c.fussballde_id);
      const rows: Record<string, unknown>[] = [{ run_id: run.id, kind: 'club', external_id: club.external_id, data: club, raw }];
      for (const t of teams) {
        rows.push({ run_id: run.id, kind: 'team', external_id: t.external_id, parent_external_id: club.external_id, data: t });
        if (!t.age_group) continue; // nur Jugendteams E–A
        const { matches } = await ADAPTER.matches(t.external_id);
        for (const m of matches) {
          rows.push({ run_id: run.id, kind: 'match', external_id: m.external_id, parent_external_id: t.external_id, data: m });
        }
      }
      const { error } = await admin.from('import_fussballde').insert(rows);
      if (error) throw error;
    }

    const { data: result, error: applyError } = await admin.rpc('apply_fussballde_import', { p_run: run.id });
    if (applyError) throw applyError;
    return json({ status: 'ok', ...result });
  } catch (e) {
    const message = (e as Error).message;
    await admin.from('sync_runs').update({ status: 'fehler', message, finished_at: new Date().toISOString() }).eq('id', run.id);
    return json({ status: 'fehler', message }, 500);
  }
});
