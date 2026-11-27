// Supabase Edge Function: Vereinsnamen aus einem Bild, PDF oder Weblink auslesen (optional mit eigenem Prompt).
//
// Aufruf aus der App (angemeldet, Kreis-Admin oder darüber):
//   supabase.functions.invoke('extract-clubs', { body: { kreis_id, source: 'image' | 'pdf' | 'url', data?, media_type?, url?, instructions? } })
// Ergebnis: { clubs: [...], notes } – wird NICHT gespeichert. Der Admin prüft die Liste und übernimmt sie
// anschließend mit der Datenbankfunktion import_clubs.
// Personen (Spieler*innen, Trainer*innen) werden nie ausgelesen.
//
// Benötigtes Secret: ANTHROPIC_API_KEY oder AnthropicAPI (Supabase → Edge Functions → Secrets)
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3';

const ALLOWED_ORIGINS = ['https://zafarkhan82.github.io', 'http://localhost:8081'];
let cors: Record<string, string> = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// fussball.de / DFBnet werden nicht automatisch abgerufen (Nutzungsbedingungen) – dort bitte Screenshot oder PDF verwenden.
const BLOCKED_HOSTS = ['fussball.de', 'dfbnet.org', 'dfb.de'];
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
const MAX_BYTES = 20 * 1024 * 1024;

const ResultSchema = z.object({ clubs: z.array(z.object({ name: z.string() })), notes: z.string() });

// JSON-Schema für output_config (strukturierte Ausgabe)
const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['clubs', 'notes'],
  properties: {
    notes: { type: 'string', description: 'Kurze Hinweise auf Unsicherheiten, auf Deutsch. Leer, wenn alles klar ist.' },
    clubs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name'],
        properties: {
          name: { type: 'string', description: 'Vereinsname ohne Mannschaftszusatz, z. B. "TSV Heusenstamm" statt "TSV Heusenstamm II"' },
        },
      },
    },
  },
};

const SYSTEM = `Du liest die Namen von Fußball-Vereinen aus Unterlagen eines Fußballkreises aus (Tabellen, Spielpläne,
Staffellisten, Vereinsverzeichnisse, Screenshots).
Regeln:
- Gib NUR Vereinsnamen aus – keine Mannschaften, keine Altersklassen, keine Orte, keine Ergebnisse.
- Entferne Mannschaftszusätze am Ende: Zahlen (1, 2, 3 …), römische Ziffern (I, II, III, IV …) und „2. Mannschaft“ o. ä.
  Beispiel: "TSV Heusenstamm II" → "TSV Heusenstamm", "SV Dreieich 2" → "SV Dreieich". Gründungsjahre im Namen bleiben ("SV 1919 Zellhausen").
- Jeder Verein genau einmal.
- Spielgemeinschaften (JSG, SG) sind eigene Einträge mit ihrem vollen Namen.
- Erfinde nichts. Lies niemals Namen von Personen aus – auch nicht in den Hinweisen.
- Zusätzliche Hinweise des Admins (falls vorhanden) beachtest du, solange sie diesen Regeln nicht widersprechen.`;

function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function toBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

type Block = Anthropic.Beta.Messages.BetaContentBlockParam;

/** Quelle in Inhaltsblöcke für Claude umwandeln */
async function sourceBlocks(body: { source: string; data?: string; media_type?: string; url?: string }): Promise<Block[]> {
  if (body.source === 'image') {
    const mt = body.media_type as (typeof IMAGE_TYPES)[number];
    if (!body.data || !IMAGE_TYPES.includes(mt)) throw new Error('Bitte ein Bild (PNG, JPG, WebP) hochladen.');
    return [{ type: 'image', source: { type: 'base64', media_type: mt, data: body.data } }];
  }
  if (body.source === 'pdf') {
    if (!body.data) throw new Error('Bitte ein PDF hochladen.');
    return [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: body.data } }];
  }
  if (body.source === 'url') {
    let u: URL;
    try {
      u = new URL(String(body.url ?? '').trim());
    } catch {
      throw new Error('Bitte einen gültigen Link angeben.');
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Nur http- oder https-Links.');
    if (BLOCKED_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith('.' + h))) {
      throw new Error('Seiten von fussball.de/DFBnet ruft Go4Pro nicht automatisch ab. Bitte einen Screenshot oder ein PDF der Seite hochladen.');
    }
    const res = await fetch(u, { headers: { 'User-Agent': 'Go4Pro-Import/1.0', Accept: 'text/html,application/pdf,image/*' }, redirect: 'follow' });
    if (!res.ok) throw new Error(`Die Seite antwortet mit Fehler ${res.status}.`);
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw new Error('Die Datei hinter dem Link ist zu groß (max. 20 MB).');
    if (type === 'application/pdf') {
      return [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: toBase64(buf) } }];
    }
    if ((IMAGE_TYPES as readonly string[]).includes(type)) {
      return [{ type: 'image', source: { type: 'base64', media_type: type as (typeof IMAGE_TYPES)[number], data: toBase64(buf) } }];
    }
    const text = htmlToText(new TextDecoder().decode(buf));
    if (text.length < 20) throw new Error('Auf der Seite wurde kein lesbarer Text gefunden. Bitte Screenshot oder PDF verwenden.');
    return [{ type: 'document', source: { type: 'text', media_type: 'text/plain', data: text }, title: u.hostname }];
  }
  throw new Error('Unbekannte Quelle.');
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') ?? '';
  cors = { ...cors, 'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Nur POST' }, 405);

  try {
    const body = await req.json();
    if (!body?.kreis_id) return json({ error: 'kreis_id fehlt' }, 400);

    // Nur Admins des Kreises (oder darüber) dürfen auslesen
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) return json({ error: 'Nicht angemeldet' }, 401);
    const { data: allowed, error: permError } = await userClient.rpc('is_unit_admin', { p_unit: body.kreis_id });
    if (permError || !allowed) return json({ error: 'Nur Admins des Kreises (oder darüber).' }, 403);

    // Name des Secrets: ANTHROPIC_API_KEY (Standard) oder AnthropicAPI
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? Deno.env.get('AnthropicAPI');
    if (!apiKey) {
      return json({ error: 'Das Auslesen ist noch nicht eingerichtet (API-Schlüssel fehlt in den Supabase-Secrets).' }, 503);
    }

    const instructions = String(body.instructions ?? '').trim().slice(0, 2000);
    const blocks = await sourceBlocks(body);
    const client = new Anthropic({ apiKey });
    let response: Anthropic.Beta.Messages.BetaMessage;
    try {
      response = await client.beta.messages.create({
        model: 'claude-opus-5-5',
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              ...blocks,
              {
                type: 'text',
                text:
                  'Lies alle Vereinsnamen aus dieser Quelle aus.' +
                  (instructions ? `\n\nZusätzliche Hinweise des Admins:\n<hinweise>\n${instructions}\n</hinweise>` : ''),
              },
            ],
          },
        ],
      });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
        return json({ error: 'Der API-Schlüssel wird nicht akzeptiert. Bitte einen gültigen Schlüssel (beginnt mit sk-ant-api03-) eintragen.' }, 503);
      }
      if (e instanceof Anthropic.RateLimitError) return json({ error: 'Gerade zu viele Anfragen – bitte gleich noch einmal versuchen.' }, 429);
      if (e instanceof Anthropic.BadRequestError) return json({ error: 'Die Datei konnte nicht gelesen werden (zu groß oder beschädigt).' }, 400);
      if (e instanceof Anthropic.APIError) return json({ error: `Auslesen fehlgeschlagen (${e.status}).` }, 502);
      throw e;
    }

    if (response.stop_reason === 'refusal') return json({ error: 'Die Quelle konnte nicht ausgewertet werden.' }, 422);
    if (response.stop_reason === 'max_tokens') return json({ error: 'Die Quelle ist zu umfangreich – bitte in kleineren Teilen hochladen.' }, 422);

    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    let parsed: z.infer<typeof ResultSchema>;
    try {
      parsed = ResultSchema.parse(JSON.parse(text));
    } catch {
      return json({ error: 'Das Ergebnis war nicht lesbar – bitte noch einmal versuchen.' }, 502);
    }
    const strip = (n: string) =>
      n.trim().replace(/\s+(I{1,3}|IV|V|VI{0,3}|[1-9]|[1-9]\.\s*Mannschaft)$/i, '').replace(/\s+/g, ' ').trim();
    const seen = new Set<string>();
    const clubs = parsed.clubs
      .map((c) => ({ name: strip(c.name) }))
      .filter((c) => c.name.length >= 3 && !seen.has(c.name.toLowerCase()) && seen.add(c.name.toLowerCase()));
    return json({ clubs, notes: parsed.notes });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unbekannter Fehler' }, 400);
  }
});
