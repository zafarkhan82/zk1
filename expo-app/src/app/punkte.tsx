import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, View } from 'react-native';

import { Button, Card, Chip, EmptyState, H, Label, Num, Progress, Row, Screen, T, Wrap, confirmAction } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { pointLevel, timeAgo, usePoints } from '@/lib/ratings';
import { useStore } from '@/lib/store';
import { errorText, supabase } from '@/lib/supabase';

interface Voucher {
  id: string;
  title: string;
  description: string;
  points_cost: number;
  valid_until: string | null;
  partner: string;
  partner_logo: string | null;
  category: string;
  website: string | null;
  left: number | null;
}
interface Redemption {
  code: string;
  points: number;
  at: string;
  title: string;
  partner: string;
  website: string | null;
}

/** Punkte: fürs Bewerten gesammelt, einlösbar gegen Gutscheine der Partner */
export default function Punkte() {
  const { state, players, isStaff } = useStore();
  const theme = useTheme();
  const hasPlayer = players.length > 0 && !!state.profile;
  const [own, setOwn] = useState(!hasPlayer);
  const pid = own ? null : (state.profile?.id ?? null);
  const [tick, setTick] = useState(0);
  const { info } = usePoints(pid, tick);
  const [shop, setShop] = useState<Voucher[]>([]);
  const [mine, setMine] = useState<Redemption[]>([]);
  const [cat, setCat] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    const [s, r] = await Promise.all([supabase.rpc('voucher_shop'), supabase.rpc('my_redemptions', { p_player: pid })]);
    setShop((s.data as Voucher[]) ?? []);
    setMine((r.data as Redemption[]) ?? []);
  }, [pid]);
  useEffect(() => {
    load();
  }, [load, tick]);

  const balance = info?.balance ?? 0;
  const earned = info?.earned ?? 0;
  const { cur, next } = pointLevel(earned);
  const cats = [...new Set(shop.map((v) => v.category))];

  const redeem = (v: Voucher) =>
    confirmAction('Gutschein einlösen?', `${v.title} von ${v.partner} für ${v.points_cost} Punkte.`, async () => {
      setMsg(null);
      const { data, error } = await supabase.rpc('redeem_voucher', { p_voucher: v.id, p_player: pid });
      if (error) return setMsg({ text: errorText(error), ok: false });
      setMsg({ text: `Eingelöst! Dein Code: ${(data as { code: string }).code}`, ok: true });
      setTick((t) => t + 1);
    }, 'Einlösen');

  return (
    <Screen>
      <H size={44}>Punkte</H>
      {hasPlayer && isStaff && (
        <Wrap>
          <Chip label={state.profile!.nickname} selected={!own} onPress={() => setOwn(false)} />
          <Chip label="Mein Trainer-Konto" selected={own} onPress={() => setOwn(true)} />
        </Wrap>
      )}

      <Card style={{ gap: 10, borderColor: theme.gold, borderWidth: 1 }}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View>
            <Label>Guthaben</Label>
            <Num size={60} color="gold">
              {balance}
            </Num>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Label color="primary">{cur.label}</Label>
            <T size={12} color="textSecondary">
              {earned} gesammelt
            </T>
          </View>
        </Row>
        {next && (
          <>
            <Progress value={(earned - cur.min) / (next.min - cur.min)} color={theme.gold} />
            <T size={12} color="textSecondary">
              Noch {next.min - earned} Punkte bis {next.label}
              {next.unlock ? ` – dann schaltest du frei: ${next.unlock}` : ''}
            </T>
          </>
        )}
        <T size={13}>Jede Bewertung bringt 10 Punkte (bis zu 30 pro Tag). Gutscheine kosten Punkte – gesammelte Punkte für Stufen bleiben.</T>
        <Row style={{ gap: 8 }}>
          <Button title="Jetzt bewerten" onPress={() => router.push('/bewerten')} style={{ flex: 1 }} />
          {earned >= 300 && <Button title="Meine Seite" variant="secondary" onPress={() => router.push('/seite')} style={{ flex: 1 }} />}
        </Row>
      </Card>

      {msg && (
        <Card style={{ borderColor: msg.ok ? theme.success : theme.danger, borderWidth: 1.5 }}>
          <T weight="700" style={{ fontSize: msg.ok ? 18 : 14 }}>
            {msg.text}
          </T>
        </Card>
      )}

      <Label>Gutscheine unserer Partner</Label>
      {cats.length > 1 && (
        <Wrap>
          <Chip label="Alle" selected={!cat} onPress={() => setCat(null)} />
          {cats.map((c) => (
            <Chip key={c} label={c[0].toUpperCase() + c.slice(1)} selected={cat === c} onPress={() => setCat(c)} />
          ))}
        </Wrap>
      )}
      {shop.length === 0 ? (
        <EmptyState emoji="🎁" title="Bald gibt es Gutscheine" text="Sportgeschäfte, Camps und mehr stellen hier Gutscheine bereit. Du kennst einen Partner? Er kann sich unter Partner werden anmelden." />
      ) : (
        shop
          .filter((v) => !cat || v.category === cat)
          .map((v) => {
            const can = balance >= v.points_cost && v.left !== 0;
            return (
              <Card key={v.id} style={{ gap: 10 }}>
                <Row style={{ gap: 12 }}>
                  {v.partner_logo ? (
                    <Image source={{ uri: v.partner_logo }} style={{ width: 48, height: 48, borderRadius: 12 }} />
                  ) : (
                    <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: theme.backgroundSelected, alignItems: 'center', justifyContent: 'center' }}>
                      <T size={22}>🎁</T>
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T weight="800">{v.title}</T>
                    <T size={12} color="textSecondary">
                      {v.partner}
                      {v.valid_until ? ` · bis ${new Date(v.valid_until).toLocaleDateString('de-DE')}` : ''}
                      {v.left != null ? ` · noch ${v.left}` : ''}
                    </T>
                  </View>
                  <Num size={26} color="gold">
                    {v.points_cost}
                  </Num>
                </Row>
                {!!v.description && <T size={13}>{v.description}</T>}
                <Button
                  title={v.left === 0 ? 'Vergriffen' : can ? `Für ${v.points_cost} Punkte einlösen` : `Noch ${v.points_cost - balance} Punkte`}
                  variant={can ? 'primary' : 'secondary'}
                  disabled={!can}
                  onPress={() => redeem(v)}
                />
              </Card>
            );
          })
      )}

      {mine.length > 0 && (
        <>
          <Label>Deine Gutscheine</Label>
          {mine.map((r, i) => (
            <Card key={i} style={{ gap: 4 }}>
              <T weight="700">
                {r.title} · {r.partner}
              </T>
              <T size={20} weight="800" color="primary" style={{ letterSpacing: 1 }}>
                {r.code}
              </T>
              <T size={12} color="textSecondary">
                {timeAgo(r.at)} · {r.points} Punkte {r.website ? `· ${r.website}` : ''}
              </T>
            </Card>
          ))}
        </>
      )}

      {!!info?.history.length && (
        <>
          <Label>Verlauf</Label>
          <Card style={{ gap: 8 }}>
            {info.history.slice(0, 20).map((h, i) => (
              <Row key={i} style={{ justifyContent: 'space-between' }}>
                <T size={13} style={{ flex: 1 }} numberOfLines={1}>
                  {h.reason}
                </T>
                <T size={13} weight="800" color={h.amount > 0 ? 'gold' : 'textSecondary'}>
                  {h.amount > 0 ? '+' : ''}
                  {h.amount}
                </T>
              </Row>
            ))}
          </Card>
        </>
      )}

      <Row style={{ gap: 8 }}>
        <Button title="Partner werden" variant="secondary" onPress={() => router.push('/partner')} style={{ flex: 1 }} />
        <Button title="Sponsoring-Börse" variant="secondary" onPress={() => router.push('/sponsoring')} style={{ flex: 1 }} />
      </Row>
    </Screen>
  );
}
