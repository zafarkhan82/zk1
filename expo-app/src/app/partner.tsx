import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { StatusTag } from '@/components/org-ui';
import { Button, Card, Checkbox, Chip, Field, H, Label, Row, Screen, T, Wrap } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { pickSquareImage } from '@/lib/image';
import { errorText, supabase } from '@/lib/supabase';

const CATS = ['sport', 'freizeit', 'essen', 'bildung', 'mode', 'sonstiges'] as const;
const CAT_LABEL: Record<string, string> = { sport: 'Sport', freizeit: 'Freizeit', essen: 'Essen', bildung: 'Bildung', mode: 'Mode', sonstiges: 'Sonstiges' };

interface Voucher {
  id: string;
  title: string;
  description: string;
  points_cost: number;
  shared_code: string | null;
  uses_pool: boolean;
  stock: number | null;
  valid_until: string | null;
  active: boolean;
  redeemed: number;
  codes_left: number;
}
interface Partner {
  id: string;
  name: string;
  category: string;
  description: string;
  website: string | null;
  logo: string | null;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  vouchers: Voucher[];
}

/** Partner-Bereich: registrieren, nach Freigabe Gutscheine anbieten und Sponsoring-Angebote machen */
export default function PartnerScreen() {
  const theme = useTheme();
  const [list, setList] = useState<Partner[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const load = useCallback(async () => {
    const { data } = await supabase.rpc('my_partners');
    setList((data as Partner[]) ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <Screen>
      <H size={44}>Partner</H>
      <T size={14} color="textSecondary">
        Sportgeschäfte, Camps, Vereine und Firmen stellen Gutscheine bereit, die Kinder und Trainer*innen mit Punkten fürs Bewerten einlösen. Und ihr könnt starke Teams und Talente sponsern.
      </T>
      {list === null ? null : list.length === 0 || showNew ? (
        <RegisterForm
          onDone={() => {
            setShowNew(false);
            load();
          }}
        />
      ) : (
        <>
          {list.map((p) => (
            <PartnerCard key={p.id} p={p} onChange={load} />
          ))}
          <Button title="Weiteren Partner anlegen" variant="secondary" onPress={() => setShowNew(true)} />
        </>
      )}
      <Button title="Zur Sponsoring-Börse" variant="secondary" onPress={() => router.push('/sponsoring')} />
      <View style={{ height: 8 }} />
      <T size={11} color="textSecondary" style={{ color: theme.textSecondary }}>
        Go4Pro prüft jede Anmeldung. Keine Werbung für Alkohol, Glücksspiel, Energy-Drinks oder Ungesundes für Kinder.
      </T>
    </Screen>
  );
}

function RegisterForm({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [cat, setCat] = useState<string>('sport');
  const [desc, setDesc] = useState('');
  const [web, setWeb] = useState('https://');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const valid = name.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && (web.trim() === 'https://' || /^https:\/\/\S+\.\S+/.test(web.trim()));
  const save = async () => {
    setBusy(true);
    setErr('');
    const { error } = await supabase.rpc('register_partner', {
      p_name: name,
      p_category: cat,
      p_description: desc,
      p_website: web.trim() === 'https://' ? '' : web,
      p_email: email,
    });
    setBusy(false);
    if (error) return setErr(errorText(error));
    onDone();
  };
  return (
    <Card style={{ gap: 10 }}>
      <Label color="primary">Als Partner registrieren</Label>
      <Field label="Name des Unternehmens" value={name} onChangeText={setName} maxLength={80} />
      <Label>Branche</Label>
      <Wrap>
        {CATS.map((c) => (
          <Chip key={c} label={CAT_LABEL[c]} selected={cat === c} onPress={() => setCat(c)} />
        ))}
      </Wrap>
      <Field label="Kurzbeschreibung" value={desc} onChangeText={setDesc} multiline maxLength={600} style={{ minHeight: 80 }} />
      <Field label="Website" value={web} onChangeText={setWeb} autoCapitalize="none" keyboardType="url" />
      <Field label="Kontakt-E-Mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      {!!err && <T style={{ color: theme.danger }}>{err}</T>}
      <Button title={busy ? 'Sende …' : 'Registrieren'} disabled={!valid || busy} onPress={save} />
    </Card>
  );
}

function PartnerCard({ p, onChange }: { p: Partner; onChange: () => void }) {
  const theme = useTheme();
  const [adding, setAdding] = useState(false);
  const [offers, setOffers] = useState<{ id: string; listing: string; status: string; amount: number | null; contact: string | null }[]>([]);
  useEffect(() => {
    if (p.status === 'approved') supabase.rpc('partner_offers', { p_partner: p.id }).then(({ data }) => setOffers((data as typeof offers) ?? []));
  }, [p.id, p.status]);

  const logo = async () => {
    const d = await pickSquareImage(200, 0.8);
    if (!d || d === 'error') return;
    await supabase.rpc('set_partner_logo', { p_partner: p.id, p_data: d });
    onChange();
  };

  return (
    <Card style={{ gap: 12 }}>
      <Row style={{ gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Logo hochladen" onPress={logo}>
          {p.logo ? (
            <Image source={{ uri: p.logo }} style={{ width: 56, height: 56, borderRadius: 14 }} />
          ) : (
            <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: theme.backgroundSelected, alignItems: 'center', justifyContent: 'center' }}>
              <T size={11} color="textSecondary">
                Logo +
              </T>
            </View>
          )}
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T weight="800" size={17}>
            {p.name}
          </T>
          <T size={12} color="textSecondary">
            {CAT_LABEL[p.category]} · {p.email}
          </T>
        </View>
        <StatusTag text={p.status === 'approved' ? 'freigegeben' : p.status === 'pending' ? 'wird geprüft' : 'abgelehnt'} tone={p.status === 'approved' ? 'ok' : p.status === 'pending' ? 'warn' : 'off'} />
      </Row>

      {p.status === 'pending' && <T size={13}>Danke! Go4Pro prüft deine Anmeldung. Danach kannst du Gutscheine einstellen.</T>}

      {p.status === 'approved' && (
        <>
          <Label>Gutscheine</Label>
          {p.vouchers.length === 0 && <T size={13} color="textSecondary">Noch keine Gutscheine.</T>}
          {p.vouchers.map((v) => (
            <View key={v.id} style={{ padding: 10, borderRadius: 12, backgroundColor: theme.backgroundSelected, gap: 2 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T weight="700" style={{ flex: 1 }}>
                  {v.title}
                </T>
                <T weight="800" color="gold">
                  {v.points_cost} P
                </T>
              </Row>
              <T size={12} color="textSecondary">
                {v.redeemed}× eingelöst · {v.uses_pool ? `${v.codes_left} Codes übrig` : `Code ${v.shared_code}${v.stock != null ? ` · max. ${v.stock}` : ''}`}
                {v.active ? '' : ' · pausiert'}
              </T>
            </View>
          ))}
          {adding ? (
            <VoucherForm partner={p.id} onDone={() => (setAdding(false), onChange())} />
          ) : (
            <Button title="+ Gutschein anlegen" variant="secondary" onPress={() => setAdding(true)} />
          )}
          {offers.length > 0 && (
            <>
              <Label>Deine Sponsoring-Angebote</Label>
              {offers.map((o) => (
                <T key={o.id} size={13}>
                  {o.listing} · {o.status}
                  {o.contact ? ` · Kontakt: ${o.contact}` : ''}
                </T>
              ))}
            </>
          )}
        </>
      )}
    </Card>
  );
}

function VoucherForm({ partner, onDone }: { partner: string; onDone: () => void }) {
  const theme = useTheme();
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [points, setPoints] = useState('300');
  const [pool, setPool] = useState(false);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState('');
  const [stock, setStock] = useState('');
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pts = parseInt(points, 10);
  const codeList = codes.split(/[\s,;]+/).filter((c) => c.length >= 3);
  const valid = title.trim().length >= 2 && pts >= 50 && (pool ? codeList.length > 0 : code.trim().length >= 3) && (!until || /^\d{4}-\d{2}-\d{2}$/.test(until));

  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      const { data, error } = await supabase.rpc('save_voucher', {
        p_id: null,
        p_partner: partner,
        p_title: title,
        p_description: desc,
        p_points: pts,
        p_shared_code: pool ? null : code,
        p_uses_pool: pool,
        p_stock: pool || !stock ? null : parseInt(stock, 10),
        p_valid_until: until || null,
        p_active: true,
      });
      if (error) throw error;
      if (pool) {
        const r = await supabase.rpc('add_voucher_codes', { p_voucher: data, p_codes: codeList });
        if (r.error) throw r.error;
      }
      onDone();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 10, padding: 12, borderRadius: 14, backgroundColor: theme.background }}>
      <Field label="Titel" value={title} onChangeText={setTitle} placeholder="z. B. 10 € auf Fußballschuhe" maxLength={80} />
      <Field label="Beschreibung / Bedingungen" value={desc} onChangeText={setDesc} multiline maxLength={400} style={{ minHeight: 70 }} />
      <Field label="Preis in Punkten (mind. 50)" value={points} onChangeText={setPoints} keyboardType="number-pad" />
      <Checkbox checked={pool} onChange={setPool} label="Einzel-Codes (jeder Code nur einmal)" />
      {pool ? (
        <Field label="Codes (durch Leerzeichen, Komma oder Zeile getrennt)" value={codes} onChangeText={setCodes} multiline autoCapitalize="characters" style={{ minHeight: 90 }} />
      ) : (
        <>
          <Field label="Gutschein-Code für alle" value={code} onChangeText={setCode} autoCapitalize="characters" />
          <Field label="Maximale Anzahl (leer = unbegrenzt)" value={stock} onChangeText={setStock} keyboardType="number-pad" />
        </>
      )}
      <Field label="Gültig bis (JJJJ-MM-TT, optional)" value={until} onChangeText={setUntil} placeholder="2027-06-30" />
      {pool && <T size={12} color="textSecondary">{codeList.length} Codes erkannt</T>}
      {!!err && <T style={{ color: theme.danger }}>{err}</T>}
      <Button title={busy ? 'Speichere …' : 'Gutschein veröffentlichen'} disabled={!valid || busy} onPress={save} />
    </View>
  );
}
