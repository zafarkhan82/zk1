// Supabase Edge Function: Zahlungsauftrag anlegen und Zahlungsinformationen per E-Mail senden.
//
// Aufruf aus der App (angemeldet): supabase.functions.invoke('payment-order', { body: { player_id, resend? } })
// Benötigte Secrets: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM (z. B. "Go4Pro <noreply@go4pro.net>")
import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.16';
import QRCode from 'npm:qrcode@1.5.4';

// Nur eigene Web-Adressen dürfen die Funktion aus dem Browser aufrufen.
const ALLOWED_ORIGINS = ['https://zafarkhan82.github.io', 'http://localhost:8081'];
let cors: Record<string, string> = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const euro = (cents: number) => (cents / 100).toFixed(2).replace('.', ',') + ' €';
const formatIban = (iban: string) => iban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** EPC-QR-Code ("GiroCode") für SEPA-Überweisungen */
function epcPayload(holder: string, iban: string, bic: string, cents: number, reference: string) {
  return ['BCD', '002', '1', 'SCT', bic, holder.slice(0, 70), iban.replace(/\s+/g, ''), 'EUR' + (cents / 100).toFixed(2), '', '', reference.slice(0, 140)].join('\n');
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') ?? '';
  cors = { ...cors, 'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Nur POST' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const { player_id, resend } = await req.json();
    if (!player_id) return json({ error: 'player_id fehlt' }, 400);

    const url = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: userData } = await userClient.auth.getUser();
    const user = userData.user;
    if (!user?.email) return json({ error: 'Nicht angemeldet' }, 401);

    // Auftrag anlegen bzw. bestehenden holen – die Datenbankfunktion prüft, ob der Spieler dem Nutzer gehört.
    const { data: rows, error: rpcError } = await userClient.rpc('create_payment_order', { p_player: player_id });
    if (rpcError) return json({ error: rpcError.message }, 400);
    const order = rows?.[0];
    if (!order) return json({ error: 'Auftrag konnte nicht angelegt werden' }, 500);

    const { data: player } = await userClient.from('players').select('nickname').eq('id', player_id).single();
    const { data: stored } = await admin.from('payment_orders').select('email_sent_at').eq('reference', order.reference).single();

    let emailSent = false;
    let emailError: string | null = null;
    const bankReady = !!order.bank_iban && !!order.bank_holder;

    // Erneutes Senden höchstens alle 10 Minuten (Schutz vor Mail-Spam)
    const recentlySent = stored?.email_sent_at && Date.now() - new Date(stored.email_sent_at).getTime() < 10 * 60 * 1000;
    if (order.status === 'offen' && bankReady && (!stored?.email_sent_at || (resend && !recentlySent))) {
      try {
        const qrPng = await QRCode.toBuffer(
          epcPayload(order.bank_holder, order.bank_iban, order.bank_bic ?? '', order.amount_cents, order.reference),
          { errorCorrectionLevel: 'M', margin: 2, width: 280 },
        );
        const port = Number(Deno.env.get('SMTP_PORT') ?? '465');
        const transport = nodemailer.createTransport({
          host: Deno.env.get('SMTP_HOST'),
          port,
          secure: port === 465,
          auth: { user: Deno.env.get('SMTP_USER'), pass: Deno.env.get('SMTP_PASS') },
        });
        const nick = esc(player?.nickname ?? 'deinen Spieler');
        const row = (label: string, value: string) =>
          `<tr><td style="padding:6px 0;color:#5B6B61;font-size:13px">${label}</td><td style="padding:6px 0;font-weight:bold;font-size:15px">${esc(value)}</td></tr>`;
        await transport.sendMail({
          from: Deno.env.get('SMTP_FROM') ?? Deno.env.get('SMTP_USER'),
          to: user.email,
          subject: `Go4Pro Premium für ${player?.nickname ?? 'deinen Spieler'} – Zahlungsinformationen`,
          text:
            `Hallo,\n\ndanke, dass du Go4Pro Premium für ${player?.nickname ?? 'deinen Spieler'} buchen möchtest.\n\n` +
            `Bitte überweise:\nEmpfänger: ${order.bank_holder}\nIBAN: ${formatIban(order.bank_iban)}\n` +
            (order.bank_bic ? `BIC: ${order.bank_bic}\n` : '') +
            `Betrag: ${euro(order.amount_cents)}\nVerwendungszweck: ${order.reference}\n\n` +
            `Bitte gib den Verwendungszweck genau so an. Premium wird nach Zahlungseingang für 1 Jahr freigeschaltet (meist 1–3 Werktage).\n\nDein Go4Pro-Team`,
          html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0E1A12">
<h2 style="color:#118C4F;margin:0 0 8px">⚽ Go4Pro Premium</h2>
<p>Danke, dass du Premium für <b>${nick}</b> buchen möchtest. So bezahlst du per Überweisung:</p>
<div style="background:#DDF3E6;border-radius:12px;padding:14px 16px;margin:16px 0">
<div style="font-size:12px;color:#5B6B61">Verwendungszweck – bitte genau so angeben</div>
<div style="font-size:24px;font-weight:bold;letter-spacing:1px">${esc(order.reference)}</div></div>
<table style="border-collapse:collapse;width:100%">
${row('Empfänger', order.bank_holder)}${row('IBAN', formatIban(order.bank_iban))}${order.bank_bic ? row('BIC', order.bank_bic) : ''}${row('Betrag', euro(order.amount_cents))}
</table>
<p style="margin-top:20px">Oder einfach mit deiner Banking-App scannen (GiroCode):</p>
<p style="text-align:center"><img src="cid:girocode" width="200" height="200" alt="GiroCode"></p>
<p style="color:#5B6B61;font-size:12px">Premium wird nach Zahlungseingang für 1 Jahr freigeschaltet (meist 1–3 Werktage). Es verlängert sich nicht automatisch.</p>
</div>`,
          attachments: [{ filename: 'girocode.png', content: qrPng, cid: 'girocode' }],
        });
        await admin.from('payment_orders').update({ email_sent_at: new Date().toISOString() }).eq('reference', order.reference);
        emailSent = true;
      } catch (e) {
        emailError = (e as Error).message;
        console.error('Mailversand fehlgeschlagen', emailError);
      }
    }

    return json({ ...order, email: user.email, email_sent: emailSent, email_already_sent: !!stored?.email_sent_at, email_error: emailError });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
