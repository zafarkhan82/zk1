import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Checkbox, Chip, Field, Label, Row, Screen, SectionTitle, T, Wrap, confirmAction } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { NEWS_KIND, relativeTime, type NewsKind } from '@/lib/home';
import { useStore } from '@/lib/store';
import { errorText, supabase } from '@/lib/supabase';

interface Target {
  key: string;
  scope: 'global' | 'club' | 'team';
  id: string | null;
  label: string;
}

interface Own {
  id: string;
  title: string;
  author_label: string;
  published_at: string;
  archived_at: string | null;
}

export default function NachrichtNeu() {
  const { isAdmin, staff } = useStore();
  const theme = useTheme();

  const targets = useMemo<Target[]>(() => {
    const list: Target[] = [];
    if (isAdmin) list.push({ key: 'global', scope: 'global', id: null, label: 'Alle (Go4Pro)' });
    const ok = staff.filter((s) => s.membershipStatus === 'approved' && s.clubStatus === 'approved');
    ok.filter((s) => s.role === 'club_admin').forEach((s) => {
      if (!list.some((t) => t.key === `club:${s.clubId}`)) list.push({ key: `club:${s.clubId}`, scope: 'club', id: s.clubId, label: `Verein ${s.clubName}` });
    });
    ok.filter((s) => s.teamId).forEach((s) => {
      if (!list.some((t) => t.key === `team:${s.teamId}`))
        list.push({ key: `team:${s.teamId}`, scope: 'team', id: s.teamId, label: `${s.clubName} ${s.teamName}` });
    });
    return list;
  }, [isAdmin, staff]);

  const [target, setTarget] = useState<string>('');
  const [kind, setKind] = useState<NewsKind>('info');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [pinned, setPinned] = useState(false);
  const [days, setDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [own, setOwn] = useState<Own[]>([]);

  const t = targets.find((x) => x.key === target) ?? targets[0];

  const loadOwn = useCallback(async () => {
    const { data } = await supabase.rpc('manageable_news');
    setOwn((data as Own[]) ?? []);
  }, []);
  useEffect(() => {
    loadOwn();
  }, [loadOwn]);

  const linkOk = !link.trim() || /^https:\/\/\S+$/.test(link.trim());

  const send = async () => {
    if (!t) return;
    setBusy(true);
    setMsg('');
    const { error } = await supabase.rpc('post_news', {
      p_scope: t.scope,
      p_target: t.id,
      p_kind: kind,
      p_title: title,
      p_body: body,
      p_link: link.trim() || null,
      p_pinned: pinned,
      p_days: days ? Number(days) : null,
    });
    setBusy(false);
    if (error) return setMsg(errorText(error));
    setTitle('');
    setBody('');
    setLink('');
    setPinned(false);
    setDays('');
    setMsg('Gesendet! Die Nachricht ist jetzt sichtbar.');
    loadOwn();
  };

  const archive = (id: string) =>
    confirmAction('Nachricht ausblenden?', 'Sie bleibt gespeichert, wird aber nicht mehr angezeigt.', async () => {
      const { error } = await supabase.rpc('archive_news', { p_news: id });
      if (error) setMsg(errorText(error));
      loadOwn();
    }, 'Ausblenden');

  if (targets.length === 0)
    return (
      <Screen bottomBar={false} topInset={false}>
        <Card>
          <T>Nachrichten schreiben können freigeschaltete Trainer*innen, Vereins-Admins und Go4Pro.</T>
        </Card>
      </Screen>
    );

  return (
    <Screen bottomBar={false} topInset={false}>
      <Card style={{ gap: 12 }}>
        <Label>An wen?</Label>
        <Wrap>
          {targets.map((x) => (
            <Chip key={x.key} label={x.label} selected={t?.key === x.key} onPress={() => setTarget(x.key)} />
          ))}
        </Wrap>
        <Label>Art</Label>
        <Wrap>
          {(Object.keys(NEWS_KIND) as NewsKind[]).map((k) => (
            <Chip key={k} label={`${NEWS_KIND[k].emoji} ${NEWS_KIND[k].label}`} selected={kind === k} onPress={() => setKind(k)} />
          ))}
        </Wrap>
        <Field label="Überschrift" value={title} onChangeText={setTitle} maxLength={120} placeholder="z. B. Training fällt aus" />
        <Field label="Text" value={body} onChangeText={setBody} maxLength={2000} multiline style={{ minHeight: 110, textAlignVertical: 'top' }} />
        <Field label="Link (optional, https://…)" value={link} onChangeText={setLink} autoCapitalize="none" keyboardType="url" />
        {!linkOk && <T size={13} style={{ color: theme.danger }}>Bitte einen Link mit https:// eingeben.</T>}
        <Field label="Anzeigen für Tage (leer = unbegrenzt)" value={days} onChangeText={(v) => setDays(v.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={3} />
        <Checkbox checked={pinned} onChange={setPinned} label="Als wichtig oben anheften" />
        <Button title={busy ? 'Sende …' : 'Nachricht senden'} disabled={busy || title.trim().length < 2 || !linkOk} onPress={send} />
        {!!msg && <T size={14}>{msg}</T>}
        <T size={12} color="textSecondary">
          Kinder lesen mit: freundlich bleiben, keine Namen von Kindern in Verbindung mit Kritik, keine Telefonnummern. Links öffnen
          Kinder nur nach einer Eltern-Abfrage.
        </T>
      </Card>

      {own.length > 0 && <SectionTitle>Gesendet</SectionTitle>}
      <View style={{ gap: 8 }}>
        {own.map((n) => (
          <Card key={n.id} style={{ opacity: n.archived_at ? 0.5 : 1 }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <T weight="700">{n.title}</T>
                <T size={12} color="textSecondary">
                  {n.author_label} · {relativeTime(n.published_at)}
                  {n.archived_at ? ' · ausgeblendet' : ''}
                </T>
              </View>
              {!n.archived_at && <Button title="Ausblenden" variant="secondary" onPress={() => archive(n.id)} style={{ minHeight: 36, paddingHorizontal: 12 }} />}
            </Row>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
