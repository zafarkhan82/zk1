import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button, Card, Chip, EmptyState, Field, H, Label, Row, Screen, T, Wrap } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { timeAgo } from '@/lib/ratings';
import { useStore } from '@/lib/store';
import { errorText, supabase } from '@/lib/supabase';

interface Listing {
  id: string;
  kind: 'team' | 'spieler';
  title: string;
  pitch: string;
  needs: string | null;
  amount: number | null;
  at: string;
  name: string;
  detail: string | null;
  avatar: string | null;
  rating: number | null;
  offers: number;
  mine: boolean;
}
interface MyListing {
  id: string;
  kind: string;
  title: string;
  status: string;
  offers: { id: string; partner: string; logo: string | null; website: string | null; email: string; message: string; amount: number | null; status: string; at: string }[];
}

/** Sponsoring-Börse: überragende Teams (Ø ≥ 55 oder Platz 1–3) und Talente (ab Gold) suchen Sponsoren */
export default function Sponsoring() {
  const theme = useTheme();
  const [tab, setTab] = useState<'boerse' | 'eigene' | 'neu'>('boerse');
  const [board, setBoard] = useState<Listing[]>([]);
  const [mine, setMine] = useState<MyListing[]>([]);
  const [partners, setPartners] = useState<{ id: string; name: string; status: string }[]>([]);
  const load = useCallback(async () => {
    const [b, m, p] = await Promise.all([supabase.rpc('sponsor_board'), supabase.rpc('my_sponsor_listings'), supabase.rpc('my_partners')]);
    setBoard((b.data as Listing[]) ?? []);
    setMine((m.data as MyListing[]) ?? []);
    setPartners(((p.data as { id: string; name: string; status: string }[]) ?? []).filter((x) => x.status === 'approved'));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <Screen>
      <H size={40}>Sponsoring-Börse</H>
      <T size={14} color="textSecondary">
        Hier präsentieren sich überragende Teams und Talente. Freigegebene Partner können ihnen Angebote machen – der Kontakt wird erst nach Annahme geteilt.
      </T>
      <Wrap>
        <Chip label={`Börse (${board.length})`} selected={tab === 'boerse'} onPress={() => setTab('boerse')} />
        <Chip label={`Meine Gesuche${mine.length ? ` (${mine.length})` : ''}`} selected={tab === 'eigene'} onPress={() => setTab('eigene')} />
        <Chip label="+ Gesuch" selected={tab === 'neu'} onPress={() => setTab('neu')} />
      </Wrap>

      {tab === 'boerse' &&
        (board.length === 0 ? (
          <EmptyState emoji="🤝" title="Noch keine Gesuche" text="Teams ab Ø-Wertung 55 oder Tabellenplatz 1–3 und Spieler*innen ab Gold-Karte können sich hier präsentieren." />
        ) : (
          board.map((l) => <ListingCard key={l.id} l={l} partners={partners} onOffer={load} />)
        ))}

      {tab === 'eigene' &&
        (mine.length === 0 ? (
          <EmptyState emoji="📣" title="Noch kein Gesuch" text="Stelle dein Team oder dein Kind vor, sobald die Wertung stark genug ist." action={<Button title="Gesuch erstellen" onPress={() => setTab('neu')} />} />
        ) : (
          mine.map((m) => (
            <Card key={m.id} style={{ gap: 10 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T weight="800" style={{ flex: 1 }}>
                  {m.title}
                </T>
                <T size={12} color="textSecondary">
                  {m.status}
                </T>
              </Row>
              {m.offers.length === 0 && <T size={13} color="textSecondary">Noch keine Angebote.</T>}
              {m.offers.map((o) => (
                <View key={o.id} style={{ gap: 6, padding: 10, borderRadius: 12, backgroundColor: theme.backgroundSelected }}>
                  <Row style={{ gap: 10 }}>
                    {o.logo ? <Image source={{ uri: o.logo }} style={{ width: 36, height: 36, borderRadius: 8 }} /> : null}
                    <T weight="700" style={{ flex: 1 }}>
                      {o.partner}
                      {o.amount ? ` · ${o.amount} €` : ''}
                    </T>
                  </Row>
                  <T size={13}>{o.message}</T>
                  {o.status === 'offen' ? (
                    <Row style={{ gap: 8 }}>
                      <Button title="Annehmen" style={{ flex: 1, minHeight: 38 }} onPress={async () => (await supabase.rpc('respond_sponsor_offer', { p_offer: o.id, p_accept: true }), load())} />
                      <Button title="Ablehnen" variant="secondary" style={{ flex: 1, minHeight: 38 }} onPress={async () => (await supabase.rpc('respond_sponsor_offer', { p_offer: o.id, p_accept: false }), load())} />
                    </Row>
                  ) : (
                    <T size={12} weight="700" color={o.status === 'angenommen' ? 'success' : 'textSecondary'}>
                      {o.status === 'angenommen' ? `Angenommen – Kontakt: ${o.email}${o.website ? ` · ${o.website}` : ''}` : 'Abgelehnt'}
                    </T>
                  )}
                </View>
              ))}
              {m.status === 'aktiv' && (
                <Button title="Gesuch beenden" variant="secondary" onPress={async () => (await supabase.rpc('close_sponsor_listing', { p_listing: m.id }), load())} />
              )}
            </Card>
          ))
        ))}

      {tab === 'neu' && <NewListing onDone={() => (setTab('eigene'), load())} />}
    </Screen>
  );
}

function ListingCard({ l, partners, onOffer }: { l: Listing; partners: { id: string; name: string }[]; onOffer: () => void }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [partner, setPartner] = useState(partners[0]?.id ?? null);
  const [msg, setMsg] = useState('');
  const [amount, setAmount] = useState('');
  const [res, setRes] = useState('');
  const send = async () => {
    const { error } = await supabase.rpc('make_sponsor_offer', { p_listing: l.id, p_partner: partner, p_message: msg, p_amount: amount ? parseInt(amount, 10) : null });
    setRes(error ? errorText(error) : 'Angebot verschickt!');
    if (!error) {
      setOpen(false);
      onOffer();
    }
  };
  return (
    <Card style={{ gap: 10 }}>
      <Row style={{ gap: 12 }}>
        <Avatar uri={l.avatar} name={l.name} size={48} ring={theme.gold} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T weight="800">{l.title}</T>
          <T size={12} color="textSecondary" numberOfLines={1}>
            {l.kind === 'team' ? '👕 Team' : '⭐ Talent'} · {l.name}
            {l.detail ? ` · ${l.detail}` : ''}
          </T>
        </View>
        {l.rating != null && (
          <View style={{ alignItems: 'center' }}>
            <T size={22} weight="800" color="gold">
              {Math.round(l.rating)}
            </T>
            <T size={10} color="textSecondary">
              {l.kind === 'team' ? 'Ø' : 'GES'}
            </T>
          </View>
        )}
      </Row>
      <T size={14}>{l.pitch}</T>
      {!!l.needs && (
        <T size={13} color="textSecondary">
          Gesucht: {l.needs}
          {l.amount ? ` · ca. ${l.amount} €` : ''}
        </T>
      )}
      <T size={11} color="textSecondary">
        {timeAgo(l.at)} · {l.offers} Angebote
      </T>
      {partners.length > 0 && !l.mine && (
        open ? (
          <View style={{ gap: 8 }}>
            {partners.length > 1 && (
              <Wrap>
                {partners.map((p) => (
                  <Chip key={p.id} label={p.name} selected={partner === p.id} onPress={() => setPartner(p.id)} />
                ))}
              </Wrap>
            )}
            <Field label="Dein Angebot" value={msg} onChangeText={setMsg} multiline maxLength={1000} placeholder="Wir statten das Team mit Trikots aus …" />
            <Field label="Betrag in € (optional)" value={amount} onChangeText={setAmount} keyboardType="number-pad" />
            <Button title="Angebot senden" disabled={msg.trim().length < 10} onPress={send} />
          </View>
        ) : (
          <Button title="Angebot machen" variant="secondary" onPress={() => setOpen(true)} />
        )
      )}
      {!!res && <T size={13}>{res}</T>}
    </Card>
  );
}

function NewListing({ onDone }: { onDone: () => void }) {
  const { players, staff } = useStore();
  const theme = useTheme();
  const targets = useMemo(
    () => [
      ...players.map((p) => ({ kind: 'spieler' as const, id: p.id, label: `⭐ ${p.nickname}` })),
      ...Array.from(new Map(staff.filter((s) => s.teamId && s.membershipStatus === 'approved').map((s) => [s.teamId!, s])).values()).map((s) => ({
        kind: 'team' as const,
        id: s.teamId!,
        label: `👕 ${s.clubName} ${s.teamName}`,
      })),
    ],
    [players, staff],
  );
  const [target, setTarget] = useState(targets[0] ?? null);
  const [elig, setElig] = useState<{ ok: boolean; reason?: string; overall?: number; avg?: number } | null>(null);
  const [title, setTitle] = useState('');
  const [pitch, setPitch] = useState('');
  const [needs, setNeeds] = useState('');
  const [amount, setAmount] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    setElig(null);
    if (!target) return;
    supabase.rpc('sponsor_eligibility', { p_kind: target.kind, p_target: target.id }).then(({ data }) => setElig(data as typeof elig));
  }, [target]);

  if (!targets.length) return <EmptyState emoji="🤝" title="Kein Team, kein Kind" text="Gesuche stellen Eltern für ihr Kind, Spieler*innen ab 16 für sich und Trainer*innen für ihr Team ein." />;

  const save = async () => {
    setErr('');
    const { error } = await supabase.rpc('create_sponsor_listing', {
      p_kind: target!.kind,
      p_target: target!.id,
      p_title: title,
      p_pitch: pitch,
      p_needs: needs,
      p_amount: amount ? parseInt(amount, 10) : null,
    });
    if (error) return setErr(errorText(error));
    onDone();
  };

  return (
    <Card style={{ gap: 10 }}>
      <Label>Für wen?</Label>
      <Wrap>
        {targets.map((t) => (
          <Chip key={t.id} label={t.label} selected={target?.id === t.id} onPress={() => setTarget(t)} />
        ))}
      </Wrap>
      {elig && !elig.ok ? (
        <T size={14} style={{ color: theme.gold }}>
          {elig.reason}
          {elig.overall != null ? ` (aktuell ${elig.overall})` : elig.avg != null ? ` (aktuell Ø ${elig.avg})` : ''}
        </T>
      ) : elig?.ok ? (
        <>
          <Field label="Überschrift" value={title} onChangeText={setTitle} maxLength={100} placeholder="Kreismeister sucht Trikotsponsor" />
          <Field label="Vorstellung" value={pitch} onChangeText={setPitch} multiline maxLength={1200} placeholder="Wer seid ihr, was habt ihr erreicht?" />
          <Field label="Was wird gesucht?" value={needs} onChangeText={setNeeds} maxLength={300} placeholder="Trikots, Bälle, Turnierfahrt …" />
          <Field label="Betrag in € (optional)" value={amount} onChangeText={setAmount} keyboardType="number-pad" />
          <T size={11} color="textSecondary">
            Keine Telefonnummern oder Adressen in den Text. Kontakt gibt es erst, wenn du ein Angebot annimmst.
          </T>
          {!!err && <T style={{ color: theme.danger }}>{err}</T>}
          <Button title="Gesuch veröffentlichen" disabled={title.trim().length < 3 || pitch.trim().length < 10} onPress={save} />
        </>
      ) : null}
    </Card>
  );
}
