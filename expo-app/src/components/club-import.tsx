import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';

import { Button, Card, Checkbox, Chip, Field, Label, Row, SectionTitle, T, Wrap } from '@/components/ui';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { errorText, supabase } from '@/lib/supabase';

interface Team {
  name: string;
  age_group: 'A' | 'B' | 'C' | 'D' | 'E' | null;
}
interface Club {
  name: string;
  city: string | null;
  postal_code: string | null;
  dfb_club_number: string | null;
  website: string | null;
  teams: Team[];
  selected: boolean;
  exists: boolean;
}
type Source = 'image' | 'pdf' | 'url';

/** Datei im Browser wählen und als Base64 lesen */
function pickFile(accept: string): Promise<{ data: string; type: string; name: string } | null> {
  return new Promise((resolve) => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return resolve(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      if (f.size > 20 * 1024 * 1024) {
        alert('Die Datei ist zu groß (max. 20 MB).');
        return resolve(null);
      }
      const r = new FileReader();
      r.onload = () => {
        const s = String(r.result ?? '');
        resolve({ data: s.slice(s.indexOf(',') + 1), type: f.type, name: f.name });
      };
      r.onerror = () => resolve(null);
      r.readAsDataURL(f);
    };
    input.click();
  });
}

/** Vereine aus Bild, PDF oder Link auslesen (KI), prüfen und übernehmen */
export function ClubImport({ kreisId, onDone }: { kreisId: string; onDone?: () => void }) {
  const theme = useTheme();
  const [source, setSource] = useState<Source>('image');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<{ data: string; type: string; name: string } | null>(null);
  const [busy, setBusy] = useState<'read' | 'save' | null>(null);
  const [clubs, setClubs] = useState<Club[] | null>(null);
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [staffeln, setStaffeln] = useState<{ id: string; name: string; age_group: string; art: string }[]>([]);
  const [staffel, setStaffel] = useState<string | null>(null);
  const [ageFilter, setAgeFilter] = useState<string>('D');

  useEffect(() => {
    supabase.rpc('kreis_staffeln', { p_kreis: kreisId }).then(({ data }) => setStaffeln((data as typeof staffeln) ?? []));
  }, [kreisId]);

  const read = async () => {
    setBusy('read');
    setMsg(null);
    setClubs(null);
    const body =
      source === 'url'
        ? { kreis_id: kreisId, source, url }
        : { kreis_id: kreisId, source, data: file?.data, media_type: file?.type };
    const { data, error } = await supabase.functions.invoke('extract-clubs', { body });
    if (error) {
      // Fehlermeldung der Funktion auslesen
      let text = errorText(error);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ctx = (error as any).context;
        if (ctx?.json) text = (await ctx.json()).error ?? text;
      } catch {
        /* Standardmeldung */
      }
      setBusy(null);
      return setMsg({ text, ok: false });
    }
    const { data: existing } = await supabase.rpc('kreis_club_names', { p_kreis: kreisId });
    const known = new Set(((existing as { name: string }[]) ?? []).map((c) => c.name.toLowerCase()));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = ((data as any)?.clubs ?? []) as Omit<Club, 'selected' | 'exists'>[];
    setClubs(list.map((c) => ({ ...c, teams: c.teams ?? [], selected: true, exists: known.has(c.name.toLowerCase()) })));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setNotes((data as any)?.notes ?? '');
    setBusy(null);
  };

  const save = async () => {
    if (!clubs) return;
    setBusy('save');
    const chosen = clubs.filter((c) => c.selected).map(({ selected: _s, exists: _e, ...c }) => c);
    const { data, error } = await supabase.rpc('import_clubs', { p_kreis: kreisId, p_clubs: chosen, p_staffel: staffel });
    setBusy(null);
    if (error) return setMsg({ text: errorText(error), ok: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = data as any;
    setMsg({ text: `Übernommen: ${r.clubs_new} neue Vereine, ${r.clubs_updated} vorhandene ergänzt, ${r.teams_new} neue Teams.`, ok: true });
    setClubs(null);
    setFile(null);
    setUrl('');
    onDone?.();
  };

  const update = (i: number, patch: Partial<Club>) => setClubs((cs) => cs!.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const canRead = source === 'url' ? /^https?:\/\/\S+\.\S+/.test(url.trim()) : !!file;
  const selected = clubs?.filter((c) => c.selected).length ?? 0;

  return (
    <View style={{ gap: 12 }}>
      <SectionTitle>Vereine importieren</SectionTitle>
      <Card style={{ gap: 12 }}>
        <T size={13} color="textSecondary">
          Lade einen Screenshot (z. B. einer Tabelle oder Staffelübersicht), ein PDF (z. B. Staffeleinteilung) oder einen Link hoch. Die KI
          liest Vereine und Jugendteams aus – du prüfst die Liste, bevor etwas gespeichert wird. Personen werden nie übernommen.
        </T>
        <Wrap>
          <Chip label="Bild" selected={source === 'image'} onPress={() => (setSource('image'), setFile(null))} />
          <Chip label="PDF" selected={source === 'pdf'} onPress={() => (setSource('pdf'), setFile(null))} />
          <Chip label="Weblink" selected={source === 'url'} onPress={() => setSource('url')} />
        </Wrap>
        {source === 'url' ? (
          <>
            <Field label="Link (Vereinsseite, PDF des Kreises …)" value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" placeholder="https://…" />
            <T size={12} color="textSecondary">
              Seiten von fussball.de/DFBnet werden nicht automatisch abgerufen – dafür bitte einen Screenshot oder ein PDF der Seite hochladen.
            </T>
          </>
        ) : Platform.OS === 'web' ? (
          <Row>
            <Button
              title={file ? 'Andere Datei wählen' : source === 'image' ? 'Bild wählen' : 'PDF wählen'}
              variant="secondary"
              onPress={async () => setFile(await pickFile(source === 'image' ? 'image/png,image/jpeg,image/webp' : 'application/pdf'))}
              style={{ flex: 1 }}
            />
          </Row>
        ) : (
          <T size={13} color="textSecondary">
            Datei-Upload ist derzeit in der Web-Version möglich.
          </T>
        )}
        {!!file && (
          <T size={13} weight="600">
            {file.name}
          </T>
        )}
        <Button title={busy === 'read' ? 'Lese aus … (bis zu 1 Minute)' : 'Vereine auslesen'} disabled={!canRead || !!busy} onPress={read} />
      </Card>

      {msg && (
        <Card style={{ borderColor: msg.ok ? theme.success : theme.danger }}>
          <T size={14}>{msg.text}</T>
        </Card>
      )}

      {clubs && (
        <Card style={{ gap: 12, borderColor: theme.primary }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Label color="primary">Gefunden: {clubs.length} Vereine</Label>
            <Pressable onPress={() => setClubs(clubs.map((c) => ({ ...c, selected: !clubs.every((x) => x.selected) })))}>
              <Text style={{ fontFamily: Font.bold, fontSize: 13, color: theme.primary }}>
                {clubs.every((c) => c.selected) ? 'Keine' : 'Alle'} auswählen
              </Text>
            </Pressable>
          </Row>
          {!!notes && (
            <T size={12} color="textSecondary">
              Hinweis: {notes}
            </T>
          )}
          {clubs.map((c, i) => (
            <View key={i} style={{ gap: 6, paddingTop: 10, borderTopWidth: i ? 1 : 0, borderTopColor: theme.border }}>
              <Row style={{ gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Checkbox checked={c.selected} onChange={(v) => update(i, { selected: v })} label="" />
                </View>
                <Text style={{ fontFamily: Font.label, fontSize: 10, letterSpacing: 1, color: c.exists ? theme.textSecondary : theme.success }}>
                  {c.exists ? 'SCHON DA' : 'NEU'}
                </Text>
              </Row>
              <TextInput
                value={c.name}
                onChangeText={(v) => update(i, { name: v })}
                style={{ fontFamily: Font.bold, fontSize: 15, color: theme.text, borderBottomWidth: 1, borderBottomColor: theme.border, paddingVertical: 4 }}
                accessibilityLabel="Vereinsname"
              />
              <Row style={{ gap: 8 }}>
                <TextInput
                  value={c.postal_code ?? ''}
                  onChangeText={(v) => update(i, { postal_code: v || null })}
                  placeholder="PLZ"
                  placeholderTextColor={theme.textSecondary}
                  style={{ width: 56, fontFamily: Font.medium, fontSize: 13, color: theme.text, borderBottomWidth: 1, borderBottomColor: theme.border }}
                />
                <TextInput
                  value={c.city ?? ''}
                  onChangeText={(v) => update(i, { city: v || null })}
                  placeholder="Ort"
                  placeholderTextColor={theme.textSecondary}
                  style={{ flex: 1, minWidth: 0, fontFamily: Font.medium, fontSize: 13, color: theme.text, borderBottomWidth: 1, borderBottomColor: theme.border }}
                />
                <TextInput
                  value={c.dfb_club_number ?? ''}
                  onChangeText={(v) => update(i, { dfb_club_number: v || null })}
                  placeholder="Vereinsnr."
                  placeholderTextColor={theme.textSecondary}
                  style={{ width: 84, fontFamily: Font.medium, fontSize: 13, color: theme.text, borderBottomWidth: 1, borderBottomColor: theme.border }}
                />
              </Row>
              {c.teams.length > 0 && (
                <T size={12} color="textSecondary">
                  Teams: {c.teams.map((t) => `${t.name}${t.age_group ? ` (${t.age_group})` : ''}`).join(' · ')}
                </T>
              )}
            </View>
          ))}

          <View style={{ gap: 8 }}>
            <Label>Teams einer Staffel zuordnen (optional)</Label>
            <Wrap>
              {['E', 'D', 'C', 'B', 'A']
                .filter((a) => staffeln.some((s) => s.age_group === a))
                .map((a) => (
                  <Chip key={a} label={`${a}-Jugend`} selected={ageFilter === a} onPress={() => setAgeFilter(a)} />
                ))}
            </Wrap>
            <Wrap>
              <Chip label="Keine Staffel" selected={staffel === null} onPress={() => setStaffel(null)} />
              {staffeln
                .filter((s) => s.age_group === ageFilter)
                .map((s) => (
                  <Chip key={s.id} label={`${s.name}`} selected={staffel === s.id} onPress={() => setStaffel(s.id)} />
                ))}
            </Wrap>
            <T size={12} color="textSecondary">
              Mit Staffel: Jeder ausgewählte Verein bekommt ein Team in dieser Staffel (Altersklasse und Spielklasse werden gesetzt). Ohne
              Staffel: Teams nur, wenn die Altersklasse in der Quelle stand.
            </T>
          </View>

          <Button
            title={busy === 'save' ? 'Übernehme …' : `${selected} Vereine übernehmen`}
            disabled={!selected || !!busy}
            onPress={save}
          />
          <Button title="Verwerfen" variant="secondary" onPress={() => setClubs(null)} />
        </Card>
      )}
    </View>
  );
}
