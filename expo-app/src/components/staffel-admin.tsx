import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { StatusTag } from '@/components/org-ui';
import { Button, Card, Chip, Field, Label, Row, SectionTitle, T, Wrap } from '@/components/ui';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { errorText, supabase } from '@/lib/supabase';

interface Staffel {
  id: string;
  age_group: string;
  art: string;
  name: string;
  kennung: number | null;
  fussballde_key: string | null;
  season: string;
  team_count: number | null;
  active: boolean;
  last_import_at: string | null;
  last_import_info: { format?: string; clubs_new?: number; teams_new?: number; matches?: number; table_rows?: number } | null;
  teams: number;
}

const AGES = ['A', 'B', 'C', 'D', 'E'];
const EMPTY = { id: null as string | null, age: 'D', art: 'Liga', name: '', kennung: '', key: '' };

/** Datei im Browser auswählen und als Text lesen */
function pickXmlFile(): Promise<string | null> {
  return new Promise((resolve) => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return resolve(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xml,text/xml,application/xml';
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      const r = new FileReader();
      r.onload = () => resolve(String(r.result ?? ''));
      r.onerror = () => resolve(null);
      r.readAsText(f, 'utf-8');
    };
    input.click();
  });
}

/** Staffeln eines Kreises: DFB-Kennung und fussball.de-Schlüssel pflegen, offizielle DFB-Dateien einspielen */
export function StaffelAdmin({ kreisId }: { kreisId: string }) {
  const theme = useTheme();
  const [list, setList] = useState<Staffel[]>([]);
  const [age, setAge] = useState<string>('alle');
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const [paste, setPaste] = useState<{ id: string; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('kreis_staffeln', { p_kreis: kreisId });
    setList((data as Staffel[]) ?? []);
  }, [kreisId]);
  useEffect(() => {
    load();
  }, [load]);

  const runImport = async (s: Staffel, xml: string | null) => {
    if (!xml) return;
    setBusy(s.id);
    setMsg(null);
    const { data, error } = await supabase.rpc('import_staffel_xml', { p_staffel: s.id, p_xml: xml });
    setBusy(null);
    if (error) return setMsg({ text: `${s.name}: ${errorText(error)}`, ok: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = data as any;
    setMsg({
      text: `${s.age_group}-Jugend ${s.name}: ${r.teams_total} Teams (${r.teams_new} neu), ${r.clubs_new} neue Vereine, ${r.matches} Spiele, ${r.table_rows} Tabellenplätze aktualisiert.`,
      ok: true,
    });
    setPaste(null);
    load();
  };

  const save = async () => {
    if (!form) return;
    const { error } = await supabase.rpc('save_staffel', {
      p_id: form.id,
      p_kreis: kreisId,
      p_age: form.age,
      p_art: form.art,
      p_name: form.name,
      p_kennung: form.kennung ? Number(form.kennung) : null,
      p_key: form.key || null,
      p_active: true,
    });
    if (error) return setMsg({ text: errorText(error), ok: false });
    setForm(null);
    setMsg({ text: 'Staffel gespeichert.', ok: true });
    load();
  };

  const shown = list.filter((s) => age === 'alle' || s.age_group === age);
  const imported = list.filter((s) => s.last_import_at).length;

  return (
    <View style={{ gap: 12 }}>
      <SectionTitle right={<T color="textSecondary">{list.length}</T>}>Staffeln</SectionTitle>
      <Card style={{ backgroundColor: theme.primarySoft, gap: 6 }}>
        <Label color="primary">Daten aktualisieren</Label>
        <T size={13}>
          Je Staffel die offizielle DFB-Datei (Sportmedia-XML: Spielplan oder Ergebnisse/Tabelle) einspielen. Vereine, Teams, Spiele,
          Ergebnisse und Tabelle werden über die festen DFB-Schlüssel angelegt bzw. aktualisiert – nichts wird doppelt angelegt.
          Spieler*innen und Kader werden nicht übernommen. {imported} von {list.length} Staffeln haben schon Daten.
        </T>
      </Card>
      {msg && (
        <Card style={{ borderColor: msg.ok ? theme.success : theme.danger }}>
          <T size={14}>{msg.text}</T>
        </Card>
      )}
      <Wrap>
        <Chip label="Alle" selected={age === 'alle'} onPress={() => setAge('alle')} />
        {AGES.filter((a) => list.some((s) => s.age_group === a)).map((a) => (
          <Chip key={a} label={`${a}-Jugend`} selected={age === a} onPress={() => setAge(a)} />
        ))}
      </Wrap>

      {shown.map((s) => (
        <Card key={s.id} style={{ gap: 8 }}>
          <Row style={{ justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: Font.label, fontSize: 11, letterSpacing: 1.2, color: theme.textSecondary }}>
                {s.age_group}-JUGEND · {s.art.toUpperCase()}
              </Text>
              <T weight="700">{s.name}</T>
            </View>
            {s.last_import_at ? <StatusTag text="Daten" tone="ok" /> : <StatusTag text="leer" tone="off" />}
          </Row>
          <T size={12} color="textSecondary">
            Kennung {s.kennung ?? '–'} · {s.teams} Teams in Go4Pro{s.team_count ? ` (laut Liste ${s.team_count})` : ''}
            {s.last_import_at
              ? ` · zuletzt ${new Date(s.last_import_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}${
                  s.last_import_info?.format ? ` (${s.last_import_info.format})` : ''
                }`
              : ''}
          </T>
          {!!s.fussballde_key && (
            <Pressable onPress={() => Linking.openURL(`https://www.fussball.de/spieltagsuebersicht/-/staffel/${s.fussballde_key}`)}>
              <Text selectable style={{ fontFamily: Font.medium, fontSize: 12, color: theme.primary }}>
                fussball.de: {s.fussballde_key}
              </Text>
            </Pressable>
          )}
          <Row style={{ flexWrap: 'wrap' }}>
            {Platform.OS === 'web' && (
              <Button
                title={busy === s.id ? 'Spiele ein …' : 'DFB-Datei einspielen'}
                disabled={!!busy}
                onPress={async () => runImport(s, await pickXmlFile())}
                style={{ minHeight: 40, paddingHorizontal: 14 }}
              />
            )}
            <Button
              title="XML einfügen"
              variant="secondary"
              onPress={() => setPaste(paste?.id === s.id ? null : { id: s.id, text: '' })}
              style={{ minHeight: 40, paddingHorizontal: 14 }}
            />
            <Button
              title="Bearbeiten"
              variant="secondary"
              onPress={() =>
                setForm({ id: s.id, age: s.age_group, art: s.art, name: s.name, kennung: s.kennung ? String(s.kennung) : '', key: s.fussballde_key ?? '' })
              }
              style={{ minHeight: 40, paddingHorizontal: 14 }}
            />
          </Row>
          {paste?.id === s.id && (
            <View style={{ gap: 8 }}>
              <TextInput
                multiline
                value={paste.text}
                onChangeText={(v) => setPaste({ id: s.id, text: v })}
                placeholder="Inhalt der DFB-XML-Datei hier einfügen"
                placeholderTextColor={theme.textSecondary}
                style={{ minHeight: 120, borderRadius: 12, borderWidth: 1, borderColor: theme.border, padding: 10, color: theme.text, fontFamily: Font.body, fontSize: 12, textAlignVertical: 'top' }}
              />
              <Button title={busy === s.id ? 'Spiele ein …' : 'Einspielen'} disabled={!!busy || paste.text.trim().length < 20} onPress={() => runImport(s, paste.text)} />
            </View>
          )}
        </Card>
      ))}

      {form ? (
        <Card style={{ gap: 10, borderColor: theme.primary }}>
          <Label color="primary">{form.id ? 'Staffel bearbeiten' : 'Neue Staffel'}</Label>
          <Wrap>
            {AGES.map((a) => (
              <Chip key={a} label={`${a}-Jugend`} selected={form.age === a} onPress={() => setForm({ ...form, age: a })} />
            ))}
          </Wrap>
          <Field label="Art (Liga, Herbstrunde, Pokal, Halle …)" value={form.art} onChangeText={(v) => setForm({ ...form, art: v })} />
          <Field label="Name der Staffel" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="z. B. 1. Kreisklasse Offenbach" />
          <Field label="DFB-Staffel-Kennung (6 Ziffern)" value={form.kennung} onChangeText={(v) => setForm({ ...form, kennung: v.replace(/\D/g, '') })} keyboardType="number-pad" maxLength={6} />
          <Field label="fussball.de-Schlüssel (aus der Adresse)" value={form.key} onChangeText={(v) => setForm({ ...form, key: v.trim() })} autoCapitalize="characters" />
          <Row>
            <Button title="Speichern" disabled={form.name.trim().length < 2} onPress={save} style={{ flex: 1 }} />
            <Button title="Abbrechen" variant="secondary" onPress={() => setForm(null)} style={{ flex: 1 }} />
          </Row>
        </Card>
      ) : (
        <Button title="Staffel hinzufügen" variant="secondary" onPress={() => setForm({ ...EMPTY })} />
      )}
    </View>
  );
}
