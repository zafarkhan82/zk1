import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, Card, Chip, Field, Label, Row, T, Wrap } from '@/components/ui';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { errorText, supabase } from '@/lib/supabase';

interface Options {
  trainer: boolean;
  own_trainer?: boolean;
  raters: { id: string; nickname: string }[];
  nickname?: string;
}

/** Bewerten über die Go4Pro-ID: als Trainer*in (eigene oder fremde) oder als Spieler*in */
export function RatingForms({ code }: { code: string }) {
  const [opts, setOpts] = useState<Options | null>(null);
  useEffect(() => {
    supabase.rpc('rating_options', { p_code: code }).then(({ data }) => setOpts((data as Options) ?? null));
  }, [code]);
  if (!opts || (!opts.trainer && opts.raters.length === 0)) return null;
  return (
    <View style={{ gap: 12 }}>
      {opts.trainer && <TrainerForm code={code} own={!!opts.own_trainer} />}
      {opts.raters.length > 0 && <PeerForm code={code} raters={opts.raters} />}
    </View>
  );
}

function Scale({ label, value, onChange, max = 5 }: { label: string; value: number; onChange: (v: number) => void; max?: number }) {
  const theme = useTheme();
  return (
    <Row style={{ justifyContent: 'space-between', gap: 8 }}>
      <T size={14} weight="600" style={{ width: 80 }}>
        {label}
      </T>
      <Row style={{ gap: 6 }}>
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <Pressable
            key={n}
            accessibilityRole="button"
            accessibilityLabel={`${label} ${n} von ${max}`}
            accessibilityState={{ selected: value === n }}
            onPress={() => onChange(n)}
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: n <= value ? theme.primary : theme.backgroundSelected,
            }}>
            <Text style={{ fontFamily: Font.number, fontSize: 17, color: n <= value ? theme.primaryText : theme.textSecondary }}>{n}</Text>
          </Pressable>
        ))}
      </Row>
    </Row>
  );
}

const CONTEXTS = [
  { id: 'training', label: 'Training' },
  { id: 'spiel', label: 'Spiel' },
  { id: 'turnier', label: 'Turnier' },
  { id: 'sichtung', label: 'Sichtung' },
];

function TrainerForm({ code, own }: { code: string; own: boolean }) {
  const theme = useTheme();
  const [ctx, setCtx] = useState('spiel');
  const [v, setV] = useState({ technik: 3, taktik: 3, athletik: 3, einsatz: 3, fairplay: 3 });
  const [comment, setComment] = useState('');
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    setMsg('');
    const { error } = await supabase.rpc('submit_trainer_rating', {
      p_code: code,
      p_context: ctx,
      p_technik: v.technik,
      p_taktik: v.taktik,
      p_athletik: v.athletik,
      p_einsatz: v.einsatz,
      p_fairplay: v.fairplay,
      p_comment: comment || null,
    });
    setBusy(false);
    if (error) return setMsg(errorText(error));
    setDone(true);
  };

  if (done)
    return (
      <Card style={{ borderColor: theme.success }}>
        <T weight="700">Danke für deine Bewertung!</T>
        <T size={13} color="textSecondary">
          Sie fließt in die Gesamtwertung ein. Nächste Bewertung dieses Spielers frühestens in 30 Tagen.
        </T>
      </Card>
    );

  return (
    <Card style={{ gap: 12 }}>
      <Label color="primary">{own ? 'Als Trainer*in bewerten' : 'Als fremde*r Trainer*in bewerten'}</Label>
      <Wrap>
        {CONTEXTS.map((c) => (
          <Chip key={c.id} label={c.label} selected={ctx === c.id} onPress={() => setCtx(c.id)} />
        ))}
      </Wrap>
      <Scale label="Technik" value={v.technik} onChange={(n) => setV({ ...v, technik: n })} />
      <Scale label="Taktik" value={v.taktik} onChange={(n) => setV({ ...v, taktik: n })} />
      <Scale label="Athletik" value={v.athletik} onChange={(n) => setV({ ...v, athletik: n })} />
      <Scale label="Einsatz" value={v.einsatz} onChange={(n) => setV({ ...v, einsatz: n })} />
      <Scale label="Fairplay" value={v.fairplay} onChange={(n) => setV({ ...v, fairplay: n })} />
      <Field label="Kurzes Feedback (optional, sieht das Kind)" value={comment} onChangeText={setComment} maxLength={300} placeholder="z. B. Starker linker Fuß, bleib dran!" />
      <T size={12} color="textSecondary">
        1 = noch am Anfang · 3 = altersgerecht gut · 5 = herausragend. Bitte fair und ermutigend formulieren.
      </T>
      <Button title={busy ? 'Sende …' : 'Bewertung abgeben'} disabled={busy} onPress={send} />
      {!!msg && <T size={13} style={{ color: theme.danger }}>{msg}</T>}
    </Card>
  );
}

function PeerForm({ code, raters }: { code: string; raters: { id: string; nickname: string }[] }) {
  const theme = useTheme();
  const [rater, setRater] = useState(raters[0].id);
  const [v, setV] = useState({ technik: 3, einsatz: 4, fairplay: 4 });
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    setMsg('');
    const { error } = await supabase.rpc('submit_peer_rating', {
      p_rater: rater,
      p_code: code,
      p_technik: v.technik,
      p_fairplay: v.fairplay,
      p_einsatz: v.einsatz,
    });
    setBusy(false);
    if (error) return setMsg(errorText(error));
    setDone(true);
  };

  if (done)
    return (
      <Card style={{ borderColor: theme.success }}>
        <T weight="700">Danke! Deine Sterne sind angekommen.</T>
        <T size={13} color="textSecondary">
          Bewertungen von Spieler*innen sind anonym und erscheinen erst als Durchschnitt ab 3 Stimmen.
        </T>
      </Card>
    );

  return (
    <Card style={{ gap: 12 }}>
      <Label color="primary">Als Spieler*in Sterne vergeben</Label>
      {raters.length > 1 && (
        <Wrap>
          {raters.map((r) => (
            <Chip key={r.id} label={r.nickname} selected={rater === r.id} onPress={() => setRater(r.id)} />
          ))}
        </Wrap>
      )}
      <Scale label="Technik" value={v.technik} onChange={(n) => setV({ ...v, technik: n })} />
      <Scale label="Einsatz" value={v.einsatz} onChange={(n) => setV({ ...v, einsatz: n })} />
      <Scale label="Fairplay" value={v.fairplay} onChange={(n) => setV({ ...v, fairplay: n })} />
      <T size={12} color="textSecondary">
        Anonym, ohne Texte. Ein*e Spieler*in kann dieselbe Person höchstens einmal im Monat bewerten.
      </T>
      <Button title={busy ? 'Sende …' : 'Sterne vergeben'} disabled={busy} onPress={send} />
      {!!msg && <T size={13} style={{ color: theme.danger }}>{msg}</T>}
    </Card>
  );
}
