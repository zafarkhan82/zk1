// Supabase Edge Function: Ein Kind (unter 16) bittet seine Eltern per Mail, einen Go4Pro-Zugang einzurichten.
// Aufruf (angemeldet): supabase.functions.invoke('request-parent', { body: { parent_email, child_name } })
// Limit und Protokoll in der Datenbank (log_parent_request: max. 3 pro Tag). Benötigte Secrets: SMTP_*
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

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') ?? '';
  cors = { ...cors, 'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Nur POST' }, 405);
  try {
    const { parent_email, child_name } = await req.json();
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const kidEmail = userData.user?.email;
    if (!kidEmail) return json({ error: 'Nicht angemeldet' }, 401);
    const name = String(child_name ?? '').trim().slice(0, 40) || 'Dein Kind';
    const { error } = await userClient.rpc('log_parent_request', { p_parent_email: String(parent_email ?? ''), p_child_name: name });
    if (error) return json({ error: error.message }, 400);

    const port = Number(Deno.env.get('SMTP_PORT') ?? '465');
    const transport = nodemailer.createTransport({
      host: Deno.env.get('SMTP_HOST'),
      port,
      secure: port === 465,
      auth: { user: Deno.env.get('SMTP_USER'), pass: Deno.env.get('SMTP_PASS') },
    });
    const steps = [
      `Go4Pro öffnen: ${APP_URL}`,
      'Mit Ihrer E-Mail-Adresse anmelden und „Elternteil“ wählen',
      `Ihr Kind anlegen (Spitzname, Jahrgang)`,
      `Unter „Ich“ auf „Eigenen Zugang einrichten“ tippen und die E-Mail Ihres Kindes eintragen: ${kidEmail}`,
    ];
    await transport.sendMail({
      from: Deno.env.get('SMTP_FROM') ?? Deno.env.get('SMTP_USER'),
      to: String(parent_email).trim(),
      replyTo: kidEmail,
      subject: `${name} möchte Go4Pro nutzen – Ihre Zustimmung`,
      text:
        `Hallo,\n\n${name} (${kidEmail}) möchte mit Go4Pro sein Fußballtraining festhalten und von Trainer*innen bestätigen lassen.\n` +
        `Für Kinder unter 16 brauchen wir dafür Ihre Zustimmung. So geht's:\n\n` +
        steps.map((s, i) => `${i + 1}. ${s}`).join('\n') +
        `\n\nSie behalten den Überblick und entscheiden, ob Leistungen veröffentlicht werden.\n` +
        `Wenn Sie nichts tun, passiert nichts – es werden keine Daten Ihres Kindes gespeichert.\n\nIhr Go4Pro-Team`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#111">
  <h2 style="margin:0 0 12px">${esc(name)} möchte Go4Pro nutzen</h2>
  <p><b>${esc(name)}</b> (${esc(kidEmail)}) möchte mit Go4Pro sein Fußballtraining festhalten und von Trainer*innen bestätigen lassen. Für Kinder unter 16 brauchen wir dafür Ihre Zustimmung.</p>
  <ol>${steps.map((s) => `<li style="margin:6px 0">${esc(s)}</li>`).join('')}</ol>
  <p style="margin:24px 0"><a href="${APP_URL}" style="background:#19E3FF;color:#04141B;padding:14px 22px;border-radius:999px;text-decoration:none;font-weight:bold">Go4Pro öffnen</a></p>
  <p style="font-size:13px;color:#555">Sie behalten den Überblick und entscheiden, ob Leistungen veröffentlicht werden. Wenn Sie nichts tun, passiert nichts – es werden keine Daten Ihres Kindes gespeichert.</p>
</div>`,
    });
    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unbekannter Fehler' }, 500);
  }
});
