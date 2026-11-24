import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Chip, Field, Label, Num, Pill, Row, Screen, SectionTitle, T, Wrap } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { errorText, supabase } from '@/lib/supabase';

interface Ad {
  id: string;
  club_id: string | null;
  club_name: string | null;
  sponsor: string;
  title: string;
  body: string;
  cta_label: string;
  link_url: string | null;
  image_url: string | null;
  category: string;
  status: 'entwurf' | 'aktiv' | 'pausiert' | 'beendet';
  active_from: string;
  active_until: string | null;
  impressions: number;
  clicks: number;
  price_cents: number | null;
  approved: boolean;
}

const CATEGORIES = ['sport', 'camp', 'verein', 'bildung', 'gesundheit', 'sonstiges'];
const EMPTY = { sponsor: '', title: '', body: '', cta: 'Mehr erfahren', link: '', image: '', category: 'sport', until: '', price: '' };

/** Anzeigen verwalten: Go4Pro-Admins (alle) und Vereins-Admins (Sponsoren des eigenen Vereins) */
export default function Werbung() {
  const theme = useTheme();
  const [ads, setAds] = useState<Ad[]>([]);
  const [filter, setFilter] = useState<'alle' | 'aktiv' | 'verein' | 'partner'>('aktiv');
  const [edit, setEdit] = useState<string | null>(null);
  const [f, setF] = useState(EMPTY);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('manage_ads');
    if (error) return setMsg(errorText(error));
    setAds((data as Ad[]) ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const startEdit = (a: Ad | null) => {
    setMsg('');
    setEdit(a ? a.id : 'neu');
    setF(
      a
        ? {
            sponsor: a.sponsor,
            title: a.title,
            body: a.body,
            cta: a.cta_label,
            link: a.link_url ?? '',
            image: a.image_url ?? '',
            category: a.category,
            until: a.active_until ?? '',
            price: a.price_cents != null ? String(a.price_cents / 100) : '',
          }
        : EMPTY,
    );
  };

  const save = async () => {
    setBusy(true);
    const current = ads.find((a) => a.id === edit);
    const { error } = await supabase.rpc('save_ad', {
      p_id: edit === 'neu' ? null : edit,
      p_club: current?.club_id ?? null,
      p_sponsor: f.sponsor,
      p_title: f.title,
      p_body: f.body,
      p_cta: f.cta,
      p_link: f.link || null,
      p_image: f.image || null,
      p_category: f.category,
      p_from: null,
      p_until: /^\d{4}-\d{2}-\d{2}$/.test(f.until) ? f.until : null,
      p_price: f.price ? Math.round(Number(f.price.replace(',', '.')) * 100) : null,
    });
    setBusy(false);
    if (error) return setMsg(errorText(error));
    setEdit(null);
    setMsg('Gespeichert. Neue Anzeigen sind erst nach „Freischalten“ sichtbar.');
    load();
  };

  const setStatus = async (id: string, status: Ad['status']) => {
    const { error } = await supabase.rpc('set_ad_status', { p_id: id, p_status: status });
    if (error) setMsg(errorText(error));
    load();
  };

  const shown = ads.filter((a) =>
    filter === 'alle' ? true : filter === 'aktiv' ? a.status === 'aktiv' : filter === 'verein' ? !!a.club_id : !a.club_id,
  );
  const sum = (k: 'impressions' | 'clicks') => ads.reduce((s, a) => s + Number(a[k]), 0);
  const revenue = ads.filter((a) => a.status === 'aktiv').reduce((s, a) => s + (a.price_cents ?? 0), 0);
  const linkOk = (v: string) => !v || /^https:\/\/\S+$/.test(v);

  return (
    <Screen bottomBar={false} topInset={false}>
      <Card style={{ backgroundColor: theme.primarySoft }}>
        <Label color="primary">Regeln für Werbung in einer Kinder-App</Label>
        <T size={13}>
          • Immer als „Anzeige“ gekennzeichnet{'\n'}• Keine direkte Kaufaufforderung an Kinder („Kauf jetzt!“){'\n'}• Kein Tracking, kein
          Profiling – nur Summen für Einblendungen und Klicks{'\n'}• Links öffnen nur nach Eltern-Abfrage{'\n'}• Keine Werbung für
          Süßigkeiten, Energy-Drinks, Glücksspiel, Apps mit In-App-Käufen{'\n'}• Premium-Familien sehen keine allgemeine Werbung, nur
          Vereinspartner
        </T>
      </Card>

      <Row>
        <View style={{ flex: 1 }}>
          <Label>Einblendungen</Label>
          <Num size={28}>{sum('impressions').toLocaleString('de-DE')}</Num>
        </View>
        <View style={{ flex: 1 }}>
          <Label>Klicks</Label>
          <Num size={28}>{sum('clicks').toLocaleString('de-DE')}</Num>
        </View>
        <View style={{ flex: 1 }}>
          <Label>Aktiv €</Label>
          <Num size={28}>{(revenue / 100).toLocaleString('de-DE')}</Num>
        </View>
      </Row>

      <Button title="Neue Anzeige" onPress={() => startEdit(null)} />
      {!!msg && <T size={14}>{msg}</T>}

      {edit && (
        <Card style={{ gap: 10, borderColor: theme.primary }}>
          <Label color="primary">{edit === 'neu' ? 'Neue allgemeine Anzeige' : 'Anzeige bearbeiten'}</Label>
          <Field label="Sponsor" value={f.sponsor} onChangeText={(v) => setF({ ...f, sponsor: v })} maxLength={80} />
          <Field label="Überschrift" value={f.title} onChangeText={(v) => setF({ ...f, title: v })} maxLength={80} />
          <Field label="Text (max. 240 Zeichen)" value={f.body} onChangeText={(v) => setF({ ...f, body: v })} maxLength={240} multiline />
          <Field label="Button-Text" value={f.cta} onChangeText={(v) => setF({ ...f, cta: v })} maxLength={30} />
          <Field label="Link (https://…)" value={f.link} onChangeText={(v) => setF({ ...f, link: v })} autoCapitalize="none" keyboardType="url" />
          <Field label="Bild-URL (optional, https://…)" value={f.image} onChangeText={(v) => setF({ ...f, image: v })} autoCapitalize="none" keyboardType="url" />
          {(!linkOk(f.link) || !linkOk(f.image)) && <T size={13} style={{ color: theme.danger }}>Links müssen mit https:// beginnen.</T>}
          <Label>Kategorie</Label>
          <Wrap>
            {CATEGORIES.map((c) => (
              <Chip key={c} label={c} selected={f.category === c} onPress={() => setF({ ...f, category: c })} />
            ))}
          </Wrap>
          <Field label="Läuft bis (JJJJ-MM-TT, leer = offen)" value={f.until} onChangeText={(v) => setF({ ...f, until: v })} maxLength={10} />
          <Field label="Preis in € (intern)" value={f.price} onChangeText={(v) => setF({ ...f, price: v })} keyboardType="decimal-pad" />
          <Row>
            <Button
              title={busy ? 'Speichere …' : 'Speichern'}
              disabled={busy || f.sponsor.trim().length < 2 || f.title.trim().length < 2 || !linkOk(f.link) || !linkOk(f.image)}
              onPress={save}
              style={{ flex: 1 }}
            />
            <Button title="Abbrechen" variant="secondary" onPress={() => setEdit(null)} style={{ flex: 1 }} />
          </Row>
        </Card>
      )}

      <SectionTitle>Anzeigen ({ads.length})</SectionTitle>
      <Wrap>
        <Chip label="Aktiv" selected={filter === 'aktiv'} onPress={() => setFilter('aktiv')} />
        <Chip label="Go4Pro-Partner" selected={filter === 'partner'} onPress={() => setFilter('partner')} />
        <Chip label="Vereinspartner" selected={filter === 'verein'} onPress={() => setFilter('verein')} />
        <Chip label="Alle" selected={filter === 'alle'} onPress={() => setFilter('alle')} />
      </Wrap>

      {shown.slice(0, 60).map((a) => {
        const ctr = a.impressions > 0 ? ((a.clicks / a.impressions) * 100).toFixed(1).replace('.', ',') : '0';
        return (
          <Card key={a.id} style={{ gap: 8 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T size={12} color="textSecondary" style={{ flex: 1 }}>
                {a.club_name ? `Vereinspartner · ${a.club_name}` : 'Go4Pro-Partner'} · {a.category}
              </T>
              <Pill
                text={a.status}
                color={a.status === 'aktiv' ? theme.success : theme.backgroundSelected}
                textColor={a.status === 'aktiv' ? '#fff' : theme.text}
              />
            </Row>
            <T weight="700">
              {a.sponsor}: {a.title}
            </T>
            {!!a.body && (
              <T size={13} color="textSecondary">
                {a.body}
              </T>
            )}
            <T size={12} color="textSecondary">
              {Number(a.impressions).toLocaleString('de-DE')} Einblendungen · {Number(a.clicks).toLocaleString('de-DE')} Klicks · {ctr} %
              {a.active_until ? ` · bis ${new Date(a.active_until).toLocaleDateString('de-DE')}` : ''}
            </T>
            <Row style={{ flexWrap: 'wrap' }}>
              {a.status !== 'aktiv' && <Button title="Freischalten" onPress={() => setStatus(a.id, 'aktiv')} style={{ minHeight: 36, paddingHorizontal: 14 }} />}
              {a.status === 'aktiv' && <Button title="Pausieren" variant="secondary" onPress={() => setStatus(a.id, 'pausiert')} style={{ minHeight: 36, paddingHorizontal: 14 }} />}
              <Button title="Bearbeiten" variant="secondary" onPress={() => startEdit(a)} style={{ minHeight: 36, paddingHorizontal: 14 }} />
              {a.status !== 'beendet' && <Button title="Beenden" variant="danger" onPress={() => setStatus(a.id, 'beendet')} style={{ minHeight: 36, paddingHorizontal: 14 }} />}
            </Row>
          </Card>
        );
      })}
    </Screen>
  );
}
