import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Share, View } from 'react-native';

import { Button, Card, Checkbox, Chip, Field, H, Label, Progress, Screen, T, Wrap } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useStore } from '@/lib/store';
import { errorText, supabase } from '@/lib/supabase';

interface Landing {
  page: { slug: string; headline: string; bio: string; highlights: string; video_url: string | null; published: boolean } | null;
  earned: number;
  threshold: number;
  unlocked: boolean;
  needs_parent_consent: boolean;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

export const publicUrl = (slug: string) =>
  Platform.OS === 'web' && typeof window !== 'undefined' ? `${window.location.origin}/zk1/p/${slug}` : `https://zafarkhan82.github.io/zk1/p/${slug}`;

/** Eigene Landingpage: ab 300 gesammelten Punkten veröffentlichen */
export default function Seite() {
  const { state, players, isStaff, displayName } = useStore();
  const theme = useTheme();
  const hasPlayer = players.length > 0 && !!state.profile;
  const [asTrainer, setAsTrainer] = useState(!hasPlayer);
  const pid = asTrainer ? null : (state.profile?.id ?? null);
  const [d, setD] = useState<Landing | null>(null);
  const [slug, setSlug] = useState('');
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [hl, setHl] = useState('');
  const [video, setVideo] = useState('');
  const [pub, setPub] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_landing', { p_player: pid });
    if (error) return setMsg({ text: errorText(error), ok: false });
    const l = data as Landing;
    setD(l);
    const base = asTrainer ? (displayName ?? 'trainer') : (state.profile?.nickname ?? 'spieler');
    setSlug(l.page?.slug ?? slugify(`${base}-${Math.random().toString(36).slice(2, 6)}`));
    setHeadline(l.page?.headline ?? '');
    setBio(l.page?.bio ?? '');
    setHl(l.page?.highlights ?? '');
    setVideo(l.page?.video_url ?? '');
    setPub(l.page?.published ?? false);
  }, [pid, asTrainer, displayName, state.profile?.nickname]);
  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setMsg(null);
    const { error } = await supabase.rpc('save_landing', {
      p_player: pid,
      p_slug: slug,
      p_headline: headline,
      p_bio: bio,
      p_highlights: hl,
      p_video: video,
      p_published: pub,
    });
    if (error) return setMsg({ text: errorText(error), ok: false });
    setMsg({ text: pub ? 'Gespeichert und veröffentlicht!' : 'Gespeichert (noch nicht öffentlich).', ok: true });
    load();
  };

  return (
    <Screen>
      <H size={40}>Meine Seite</H>
      {hasPlayer && isStaff && (
        <Wrap>
          <Chip label={state.profile!.nickname} selected={!asTrainer} onPress={() => setAsTrainer(false)} />
          <Chip label="Als Trainer*in" selected={asTrainer} onPress={() => setAsTrainer(true)} />
        </Wrap>
      )}
      <T size={14} color="textSecondary">
        Deine eigene Seite zum Teilen – mit Karte, Bewertungen und deiner Geschichte. Ab {d?.threshold ?? 300} gesammelten Punkten kannst du sie veröffentlichen.
      </T>
      {d && !d.unlocked && (
        <Card style={{ gap: 8 }}>
          <Label color="gold">Noch gesperrt</Label>
          <Progress value={d.earned / d.threshold} color={theme.gold} />
          <T size={13}>
            {d.earned} von {d.threshold} Punkten. Bewerte andere, um Punkte zu sammeln – du kannst die Seite aber schon vorbereiten.
          </T>
          <Button title="Jetzt bewerten" onPress={() => router.push('/bewerten')} />
        </Card>
      )}
      {d?.needs_parent_consent && (
        <Card style={{ borderColor: theme.gold, borderWidth: 1 }}>
          <T size={13}>Veröffentlichen geht erst, wenn die Eltern unter „Ich“ der öffentlichen Sichtbarkeit zugestimmt haben.</T>
        </Card>
      )}
      {d && (
        <Card style={{ gap: 10 }}>
          <Field label="Adresse" value={slug} onChangeText={(v) => setSlug(slugify(v))} autoCapitalize="none" />
          <T size={12} color="textSecondary">
            {publicUrl(slug || '…')}
          </T>
          <Field label="Überschrift" value={headline} onChangeText={setHeadline} maxLength={120} placeholder={asTrainer ? 'Trainer mit Herz für Technik' : 'Flinker Linksaußen mit Torriecher'} />
          <Field label="Über mich" value={bio} onChangeText={setBio} multiline maxLength={1500} />
          <Field label="Erfolge & Highlights" value={hl} onChangeText={setHl} multiline maxLength={1000} placeholder="Kreismeister 2026, Torschützenkönig …" />
          <Field label="Video-Link (https, optional)" value={video} onChangeText={setVideo} autoCapitalize="none" keyboardType="url" />
          {!asTrainer && (
            <T size={11} color="textSecondary">
              Bitte keine Adresse, Schule oder Telefonnummer – die Seite ist öffentlich.
            </T>
          )}
          <Checkbox checked={pub} onChange={setPub} label="Öffentlich sichtbar" />
          {msg && <T size={13} style={{ color: msg.ok ? theme.success : theme.danger }}>{msg.text}</T>}
          <Button title="Speichern" disabled={slug.length < 3} onPress={save} />
          {d.page?.published && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Ansehen" variant="secondary" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/p/[slug]', params: { slug: d.page!.slug } })} />
              <Button
                title="Teilen"
                variant="secondary"
                style={{ flex: 1 }}
                onPress={() => {
                  const url = publicUrl(d.page!.slug);
                  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share) navigator.share({ url }).catch(() => {});
                  else if (Platform.OS === 'web' && typeof navigator !== 'undefined') navigator.clipboard?.writeText(url);
                  else Share.share({ message: url });
                }}
              />
            </View>
          )}
        </Card>
      )}
    </Screen>
  );
}
