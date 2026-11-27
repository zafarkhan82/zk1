// Supabase Edge Function: Admin-Einladung anlegen und per E-Mail verschicken (Double-Opt-In).
//
// Aufruf aus der App (angemeldet): supabase.functions.invoke('send-invite', { body: { kind, target_id, email, name } })
//   kind: 'club_admin' | 'org_admin' | 'super_admin'
// Die Datenbank prüft die Berechtigung (create_invite). Der Link-Schlüssel geht nur per Mail an die eingeladene Person.
// Benötigte Secrets: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.16';

const ALLOWED_ORIGINS = ['https://zafarkhan82.github.io', 'http://localhost:8081'];
const APP_URL = 'https://zafarkhan82.github.io/zk1';
let cors: Record<string, string> = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const ROLE: Record<string, string> = {
  club_admin: 'Vereins-Admin',
  org_admin: 'Admin',
  super_admin: 'Super-Admin',
  player_access: 'eigener Spieler-Zugang',
};

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') ?? '';
  cors = { ...cors, 'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Nur POST' }, 405);

  try {
    const { kind, target_id, email, name } = await req.json();
    if (!kind || !email || !name) return json({ error: 'Name und E-Mail angeben.' }, 400);

    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) return json({ error: 'Nicht angemeldet' }, 401);

    // Einladung anlegen – die Datenbank prüft, ob die Person einladen darf
    const { data: inv, error } = await userClient.rpc('create_invite', {
      p_kind: kind,
      p_target: target_id ?? null,
      p_email: String(email),
      p_name: String(name),
    });
    if (error) return json({ error: error.message }, 400);

    const link = `${APP_URL}/einladung?token=${inv.token}`;
    const role = ROLE[kind] ?? 'Admin';
    const target = String(inv.target_name ?? 'Go4Pro');
    const inviter = String(inv.inviter ?? 'Go4Pro');
    const port = Number(Deno.env.get('SMTP_PORT') ?? '465');
    const transport = nodemailer.createTransport({
      host: Deno.env.get('SMTP_HOST'),
      port,
      secure: port === 465,
      auth: { user: Deno.env.get('SMTP_USER'), pass: Deno.env.get('SMTP_PASS') },
    });
    const child = kind === 'player_access';
    await transport.sendMail({
      from: Deno.env.get('SMTP_FROM') ?? Deno.env.get('SMTP_USER'),
      to: String(email),
      subject: child ? `Go4Pro: Dein eigener Zugang für „${target}“` : `Go4Pro: Einladung als ${role} – ${target}`,
      text:
        (child
          ? `Hallo ${name},\n\n${inviter} hat dir einen eigenen Go4Pro-Zugang für dein Spielerprofil „${target}“ eingerichtet. ` +
            `Damit trägst du dein Training selbst ein und kannst andere bewerten.\n\n`
          : `Hallo ${name},\n\n${inviter} lädt dich ein, ${role} für „${target}“ bei Go4Pro zu werden.\n\n`) +
        `Bitte bestätige die Einladung über diesen Link (14 Tage gültig):\n${link}\n\n` +
        `Du meldest dich dort mit genau dieser E-Mail-Adresse an (Code per Mail) und nimmst die Einladung an. ` +
        `Erst dann bekommst du die Rechte.\n\nWenn du die Einladung nicht erwartet hast, ignoriere diese Mail einfach.\n\nDein Go4Pro-Team`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#111">
  <h2 style="margin:0 0 12px">${child ? 'Dein eigener Go4Pro-Zugang' : `Einladung als ${esc(role)}`}</h2>
  <p>Hallo ${esc(String(name))},</p>
  ${child
    ? `<p><b>${esc(inviter)}</b> hat dir einen eigenen Zugang für dein Spielerprofil <b>„${esc(target)}“</b> eingerichtet. Damit trägst du dein Training selbst ein und kannst andere bewerten.</p>`
    : `<p><b>${esc(inviter)}</b> lädt dich ein, <b>${esc(role)}</b> für <b>„${esc(target)}“</b> bei Go4Pro zu werden.</p>`}
  <p style="margin:24px 0"><a href="${link}" style="background:#19E3FF;color:#04141B;padding:14px 22px;border-radius:999px;text-decoration:none;font-weight:bold">Einladung bestätigen</a></p>
  <p style="font-size:13px;color:#555">Du meldest dich mit genau dieser E-Mail-Adresse an (Code per Mail) und nimmst die Einladung an. Erst dann bekommst du die Rechte. Der Link ist 14 Tage gültig.</p>
  <p style="font-size:13px;color:#555">Wenn du die Einladung nicht erwartet hast, ignoriere diese Mail einfach.</p>
</div>`,
    });
    await userClient.rpc('mark_invite_sent', { p_invite: inv.id });
    return json({ ok: true, id: inv.id });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unbekannter Fehler' }, 500);
  }
});
