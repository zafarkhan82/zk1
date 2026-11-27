import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';

import { InviteBox } from '@/components/invite-form';
import { StatusTag } from '@/components/org-ui';
import { Button, Card, Checkbox, Chip, Field, Label, Row, SectionTitle, T, Wrap } from '@/components/ui';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { errorText, supabase } from '@/lib/supabase';

type Source = 'image' | 'pdf' | 'url';
interface Found {
  name: string;
  selected: boolean;
  exists: boolean;
}
interface KreisClub {
  id: string;
  name: string;
  active: boolean;
  admins: { name: string; email: string }[];
  invites: number;
}

/** Bild im Browser verkleinern und als JPG umwandeln (auch HEIC vom iPhone, große Fotos) */
function compressImage(file: File): Promise<{ data: string; type: string; name: string } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 2000;
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      resolve({ data: dataUrl.slice(dataUrl.indexOf(',') + 1), type: 'image/jpeg', name: file.name || 'Bild.jpg' });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/** Datei im Browser wählen: Bilder werden verkleinert, PDFs als Base64 gelesen */
function pickFile(kind: 'image' | 'pdf'): Promise<{ data: string; type: string; name: string } | null | 'error'> {
  return new Promise((resolve) => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return resolve(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = kind === 'image' ? 'image/*' : 'application/pdf,.pdf';
    input.style.display = 'none';
    document.body.appendChild(input); // iOS Safari öffnet die Auswahl zuverlässiger, wenn das Feld im Dokument ist
    input.onchange = async () => {
      const f = input.files?.[0];
      input.remove();
      if (!f) return resolve(null);
      if (kind === 'image') return resolve((await compressImage(f)) ?? 'error');
      if (f.size > 20 * 1024 * 1024) return resolve('error');
      const r = new FileReader();
      r.onload = () => {
        const s = String(r.result ?? '');
        resolve({ data: s.slice(s.indexOf(',') + 1), type: 'application/pdf', name: f.name });
      };
      r.onerror = () => resolve('error');
      r.readAsDataURL(f);
    };
    input.click();
  });
}

async function fnError(error: unknown) {
  let text = errorText(error);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (error as any).context;
    if (ctx?.json) text = (await ctx.json()).error ?? text;
  } catch {
    /* Standardmeldung */
  }
  return text;
}

/** Vereinsnamen per KI aus Bild, PDF oder Link auslesen, prüfen, übernehmen – danach je Verein einen Admin einladen */
export function ClubImport({ kreisId, onDone }: { kreisId: string; onDone?: () => void }) {
  const theme = useTheme();
  const [source, setSource] = useState<Source>('image');
  const [url, setUrl] = useState('');
  const [prompt, setPrompt] = useState('');
  const [file, setFile] = useState<{ data: string; type: string; name: string } | null>(null);
  const [busy, setBusy] = useState<'read' | 'save' | null>(null);
  const [found, setFound] = useState<Found[] | null>(null);
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [clubs, setClubs] = useState<KreisClub[]>([]);
  const [inviteFor, setInviteFor] = useState<string | null>(null);
  const [onlyWithout, setOnlyWithout] = useState(false);
  const [manual, setManual] = useState('');

  const loadClubs = useCallback(async () => {
    const { data } = await supabase.rpc('kreis_clubs_admins', { p_kreis: kreisId });
    setClubs((data as KreisClub[]) ?? []);
  }, [kreisId]);
  useEffect(() => {
    loadClubs();
  }, [loadClubs]);

  const read = async () => {
    setBusy('read');
    setMsg(null);
    setFound(null);
    const base = { kreis_id: kreisId, source, instructions: prompt.trim() || undefined };
    const body = source === 'url' ? { ...base, url } : { ...base, data: file?.data, media_type: file?.type };
    const { data, error } = await supabase.functions.invoke('extract-clubs', { body });
    setBusy(null);
    if (error) return setMsg({ text: await fnError(error), ok: false });
    const known = new Set(clubs.map((c) => c.name.toLowerCase()));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = (((data as any)?.clubs ?? []) as { name: string }[]).map((c) => ({ name: c.name, selected: !known.has(c.name.toLowerCase()), exists: known.has(c.name.toLowerCase()) }));
    setFound(list);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setNotes((data as any)?.notes ?? '');
    if (list.length === 0) setMsg({ text: 'Keine Vereine gefunden. Probier es mit einem schärferen Bild oder einem Hinweis im Prompt.', ok: false });
  };

  const save = async () => {
    if (!found) return;
    setBusy('save');
    const chosen = found.filter((c) => c.selected).map((c) => ({ name: c.name }));
    const { data, error } = await supabase.rpc('import_clubs', { p_kreis: kreisId, p_clubs: chosen });
    setBusy(null);
    if (error) return setMsg({ text: errorText(error), ok: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = data as any;
    setMsg({ text: `${r.clubs_new} neue Vereine angelegt (${r.clubs_total} übernommen). Lade jetzt je Verein einen Admin ein.`, ok: true });
    setFound(null);
    setFile(null);
    setUrl('');
    setOnlyWithout(true);
    await loadClubs();
    onDone?.();
  };

  const canRead = source === 'url' ? /^https?:\/\/\S+\.\S+/.test(url.trim()) : !!file;
  const selected = found?.filter((c) => c.selected).length ?? 0;
  const shownClubs = clubs.filter((c) => !onlyWithout || c.admins.length === 0);

  return (
    <View style={{ gap: 12 }}>
      <SectionTitle>Vereine importieren</SectionTitle>
      <Card style={{ gap: 12 }}>
        <T size={13} color="textSecondary">
          Screenshot, PDF oder Link hochladen – die KI liest nur die Vereinsnamen aus (ohne Mannschaftszusätze wie 2, 3 oder II, jeder
          Verein einmal). Du prüfst die Liste, bevor etwas gespeichert wird.
        </T>
        <Wrap>
          <Chip label="Bild" selected={source === 'image'} onPress={() => (setSource('image'), setFile(null))} />
          <Chip label="PDF" selected={source === 'pdf'} onPress={() => (setSource('pdf'), setFile(null))} />
          <Chip label="Weblink" selected={source === 'url'} onPress={() => setSource('url')} />
        </Wrap>
        {source === 'url' ? (
          <>
            <Field label="Link" value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" placeholder="https://…" />
            <T size={12} color="textSecondary">
              fussball.de/DFBnet-Links ruft Go4Pro nicht automatisch ab – dafür bitte Screenshot oder PDF hochladen.
            </T>
          </>
        ) : Platform.OS === 'web' ? (
          <Button
            title={file ? `Datei: ${file.name} (ändern)` : source === 'image' ? 'Bild wählen' : 'PDF wählen'}
            variant="secondary"
            onPress={async () => {
              const f = await pickFile(source === 'image' ? 'image' : 'pdf');
              if (f === 'error') {
                setFile(null);
                setMsg({ text: source === 'image' ? 'Das Bild konnte nicht gelesen werden. Bitte als Screenshot (PNG/JPG) versuchen.' : 'Das PDF ist zu groß (max. 20 MB) oder beschädigt.', ok: false });
              } else {
                setMsg(null);
                setFile(f);
              }
            }}
          />
        ) : (
          <T size={13} color="textSecondary">
            Datei-Upload ist derzeit in der Web-Version möglich.
          </T>
        )}
        <View style={{ gap: 6 }}>
          <Label>Eigener Prompt (optional)</Label>
          <TextInput
            multiline
            value={prompt}
            onChangeText={setPrompt}
            maxLength={2000}
            placeholder="z. B. „Nur Vereine aus der Tabelle, nicht aus der Spielplanliste“ oder „Abkürzung JFV als Jugendförderverein ausschreiben“"
            placeholderTextColor={theme.textSecondary}
            style={{ minHeight: 80, borderRadius: 14, borderWidth: 1, borderColor: theme.border, padding: 12, color: theme.text, fontFamily: Font.body, fontSize: 14, textAlignVertical: 'top' }}
          />
        </View>
        <Button title={busy === 'read' ? 'Lese aus … (bis zu 1 Minute)' : 'Vereine auslesen'} disabled={!canRead || !!busy} onPress={read} />
      </Card>

      {msg && (
        <Card style={{ borderColor: msg.ok ? theme.success : theme.danger }}>
          <T size={14}>{msg.text}</T>
        </Card>
      )}

      {found && found.length > 0 && (
        <Card style={{ gap: 8, borderColor: theme.primary }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Label color="primary">Gefunden: {found.length} Vereine</Label>
            <Pressable onPress={() => setFound(found.map((c) => ({ ...c, selected: !found.every((x) => x.selected) })))}>
              <Text style={{ fontFamily: Font.bold, fontSize: 13, color: theme.primary }}>{found.every((c) => c.selected) ? 'Keine' : 'Alle'} auswählen</Text>
            </Pressable>
          </Row>
          {!!notes && (
            <T size={12} color="textSecondary">
              Hinweis: {notes}
            </T>
          )}
          {found.map((c, i) => (
            <Row key={i} style={{ gap: 10, paddingVertical: 4, borderTopWidth: i ? 1 : 0, borderTopColor: theme.border }}>
              <Checkbox checked={c.selected} onChange={(v) => setFound(found.map((x, j) => (j === i ? { ...x, selected: v } : x)))} label="" />
              <TextInput
                value={c.name}
                onChangeText={(v) => setFound(found.map((x, j) => (j === i ? { ...x, name: v } : x)))}
                accessibilityLabel="Vereinsname"
                style={{ flex: 1, minWidth: 0, fontFamily: Font.bold, fontSize: 15, color: theme.text, paddingVertical: 6 }}
              />
              <StatusTag text={c.exists ? 'schon da' : 'neu'} tone={c.exists ? 'off' : 'ok'} />
            </Row>
          ))}
          <Button title={busy === 'save' ? 'Übernehme …' : `${selected} Vereine übernehmen`} disabled={!selected || !!busy} onPress={save} />
          <Button title="Verwerfen" variant="secondary" onPress={() => setFound(null)} />
        </Card>
      )}

      <Card style={{ gap: 8 }}>
        <Label>Verein manuell anlegen</Label>
        <Row style={{ gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Field label="Vereinsname" value={manual} onChangeText={setManual} placeholder="z. B. TSV Heusenstamm" maxLength={120} />
          </View>
        </Row>
        <Button
          title={busy === 'save' ? 'Lege an …' : 'Verein anlegen'}
          variant="secondary"
          disabled={manual.trim().length < 3 || !!busy}
          onPress={async () => {
            setBusy('save');
            const { data, error } = await supabase.rpc('import_clubs', { p_kreis: kreisId, p_clubs: [{ name: manual.trim() }] });
            setBusy(null);
            if (error) return setMsg({ text: errorText(error), ok: false });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const c = (data as any)?.clubs?.[0];
            setMsg({ text: c ? (c.new ? `„${c.name}“ angelegt. Lade jetzt einen Admin ein.` : `„${c.name}“ gibt es schon.`) : 'Bitte einen Vereinsnamen eingeben.', ok: !!c });
            setManual('');
            await loadClubs();
            if (c) setInviteFor(c.id);
            onDone?.();
          }}
        />
        <T size={12} color="textSecondary">
          Zusätze wie „II“ oder „2“ werden entfernt; gibt es den Verein im Kreis schon, wird er nicht doppelt angelegt.
        </T>
      </Card>

      <SectionTitle right={<T color="textSecondary">{clubs.length}</T>}>Vereine & Admins</SectionTitle>
      <Wrap>
        <Chip label="Alle" selected={!onlyWithout} onPress={() => setOnlyWithout(false)} />
        <Chip label={`Ohne Admin (${clubs.filter((c) => c.admins.length === 0).length})`} selected={onlyWithout} onPress={() => setOnlyWithout(true)} />
      </Wrap>
      <Card style={{ gap: 0, paddingVertical: 6 }}>
        {shownClubs.length === 0 && <T color="textSecondary">Keine Vereine in dieser Ansicht.</T>}
        {shownClubs.map((c, i) => (
          <View key={c.id} style={{ paddingVertical: 10, gap: 8, borderTopWidth: i ? 1 : 0, borderTopColor: theme.border }}>
            <Row style={{ justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <T weight="700">{c.name}</T>
                <T size={12} color="textSecondary">
                  {c.admins.length > 0
                    ? `Admin: ${c.admins.map((a) => a.name).join(', ')}`
                    : c.invites > 0
                      ? `${c.invites} Einladung offen – wartet auf Bestätigung`
                      : 'Noch kein Admin'}
                </T>
              </View>
              <Button
                title={inviteFor === c.id ? 'Schließen' : 'Admin einladen'}
                variant={c.admins.length ? 'secondary' : 'primary'}
                onPress={() => setInviteFor(inviteFor === c.id ? null : c.id)}
                style={{ minHeight: 36, paddingHorizontal: 12 }}
              />
            </Row>
            {inviteFor === c.id && <InviteBox kind="club_admin" targetId={c.id} label={`Einladung für ${c.name} senden`} compact />}
          </View>
        ))}
      </Card>
    </View>
  );
}
