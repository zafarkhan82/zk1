import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { StarInput } from '@/components/stars';
import { Button, Card, Chip, EmptyState, H, Label, Row, Screen, T, Wrap } from '@/components/ui';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CATEGORY, KIND, ROLE, submitRating, useRatingInbox, type Category, type InboxEncounter, type InboxTarget } from '@/lib/ratings';
import { useStore } from '@/lib/store';
import { errorText } from '@/lib/supabase';

const dateDe = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });

/** Bewerten: offene Begegnungen der letzten 7 Tage – Mitspieler*innen, Gegner*innen, als Trainer*in das ganze Team */
export default function Bewerten() {
  const params = useLocalSearchParams<{ als?: string; begegnung?: string }>();
  const { players, state, isStaff, appMode } = useStore();
  const theme = useTheme();
  const canTrainer = isStaff;
  const hasPlayer = players.length > 0 && !!state.profile;
  const [asTrainer, setAsTrainer] = useState(params.als === 'trainer' || (!hasPlayer && canTrainer) || (appMode === 'trainer' && canTrainer));
  const raterPlayer = asTrainer ? null : (state.profile?.id ?? null);
  const inbox = useRatingInbox(raterPlayer, asTrainer || hasPlayer);
  const [sel, setSel] = useState<{ enc: string; target: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const onDone = (enc: InboxEncounter, t: InboxTarget, points: number) => {
    setToast(points ? `+${points} Punkte – danke für deine Bewertung von ${t.nickname}!` : `Bewertung für ${t.nickname} gespeichert.`);
    const next = enc.targets.find((x) => !x.done && x.player_id !== t.player_id);
    setSel(next ? { enc: enc.id, target: next.player_id } : null);
    inbox.reload();
  };

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <H size={44}>Bewerten</H>
        {inbox.open > 0 && (
          <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: theme.primarySoft }}>
            <Text style={{ color: theme.primary, fontFamily: Font.black, fontSize: 14 }}>{inbox.open} offen</Text>
          </View>
        )}
      </Row>
      <T color="textSecondary" size={14}>
        Bewerte nach jeder Begegnung mit 1 bis 6 Sternen. Alle sehen, wer sie wie bewertet hat – also ehrlich und fair. Für jede Bewertung bekommst du 10 Punkte.
      </T>

      {canTrainer && hasPlayer && (
        <Wrap>
          <Chip label={`Als ${state.profile?.nickname}`} selected={!asTrainer} onPress={() => (setAsTrainer(false), setSel(null))} />
          <Chip label="Als Trainer*in" selected={asTrainer} onPress={() => (setAsTrainer(true), setSel(null))} />
        </Wrap>
      )}
      {asTrainer && <Button title="+ Begegnung anlegen" variant="secondary" onPress={() => router.push('/begegnung-neu')} />}

      {toast && (
        <Card style={{ borderColor: theme.gold, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 24 }}>⭐</Text>
          <T weight="700" size={14} style={{ flex: 1 }}>
            {toast}
          </T>
        </Card>
      )}

      {inbox.loading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 30 }} />
      ) : !!inbox.error ? (
        <Card style={{ borderColor: theme.danger }}>
          <T>{inbox.error}</T>
        </Card>
      ) : inbox.items.length === 0 ? (
        <EmptyState
          emoji="⭐"
          title="Gerade nichts zu bewerten"
          text={
            asTrainer
              ? 'Lege nach dem Training oder Spiel eine Begegnung an. Spiele aus dem Spielplan erscheinen automatisch.'
              : 'Sobald dein Team trainiert oder spielt, kannst du hier deine Mitspieler*innen und die Gegner bewerten. Dein Team braucht dafür eine Trainer*in in Go4Pro.'
          }
          action={asTrainer ? undefined : <Button title="Meine Bewertungen ansehen" variant="secondary" onPress={() => router.push('/bewertungen')} />}
        />
      ) : (
        inbox.items.map((e) => (
          <EncounterCard
            key={e.id}
            enc={e}
            raterPlayer={raterPlayer}
            selected={sel?.enc === e.id ? sel.target : null}
            onSelect={(tid) => setSel(tid ? { enc: e.id, target: tid } : null)}
            onDone={(t, p) => onDone(e, t, p)}
          />
        ))
      )}
    </Screen>
  );
}

function EncounterCard({
  enc,
  raterPlayer,
  selected,
  onSelect,
  onDone,
}: {
  enc: InboxEncounter;
  raterPlayer: string | null;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onDone: (t: InboxTarget, points: number) => void;
}) {
  const theme = useTheme();
  const done = enc.targets.filter((t) => t.done).length;
  const target = enc.targets.find((t) => t.player_id === selected) ?? null;
  const own = enc.targets.filter((t) => t.role !== 'gegner');
  const opp = enc.targets.filter((t) => t.role === 'gegner');

  return (
    <Card style={{ gap: 12 }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Label color="primary">
            {KIND[enc.kind].emoji} {KIND[enc.kind].label} · {dateDe(enc.date)}
          </Label>
          <T weight="800" size={17}>
            {enc.title}
          </T>
          {!!enc.opponent && (
            <T size={13} color="textSecondary">
              {enc.team} – {enc.opponent}
            </T>
          )}
        </View>
        <T size={13} weight="700" color={done === enc.targets.length ? 'success' : 'textSecondary'}>
          {done}/{enc.targets.length}
        </T>
      </Row>

      {[
        { title: 'Dein Team', list: own },
        { title: 'Gegner', list: opp },
      ]
        .filter((g) => g.list.length)
        .map((g) => (
          <View key={g.title} style={{ gap: 8 }}>
            {opp.length > 0 && <Label>{g.title}</Label>}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {g.list.map((t) => {
                const active = t.player_id === selected;
                return (
                  <Pressable
                    key={t.player_id}
                    accessibilityRole="button"
                    accessibilityLabel={`${t.nickname} ${t.done ? 'bewertet' : 'bewerten'}`}
                    onPress={() => onSelect(active ? null : t.player_id)}
                    style={({ pressed }) => ({
                      width: 76,
                      alignItems: 'center',
                      gap: 4,
                      paddingVertical: 8,
                      borderRadius: 14,
                      backgroundColor: active ? theme.primarySoft : theme.backgroundSelected,
                      borderWidth: 1.5,
                      borderColor: active ? theme.primary : 'transparent',
                      opacity: pressed ? 0.8 : t.done && !active ? 0.55 : 1,
                    })}>
                    <View>
                      <Avatar uri={t.avatar} name={t.nickname} size={44} />
                      {t.done && (
                        <View style={{ position: 'absolute', right: -4, bottom: -4, width: 20, height: 20, borderRadius: 10, backgroundColor: theme.success, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: '#fff', fontSize: 12, fontFamily: Font.black }}>✓</Text>
                        </View>
                      )}
                    </View>
                    <Text numberOfLines={1} style={{ color: theme.text, fontFamily: Font.bold, fontSize: 12, maxWidth: 70 }}>
                      {t.jersey ? `${t.jersey} ` : ''}
                      {t.nickname}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

      {target &&
        (target.done ? (
          <T size={13} color="textSecondary">
            {target.nickname} hast du in dieser Begegnung schon bewertet.
          </T>
        ) : (
          <RateForm key={target.player_id} enc={enc} target={target} raterPlayer={raterPlayer} onDone={(p) => onDone(target, p)} />
        ))}
    </Card>
  );
}

function RateForm({ enc, target, raterPlayer, onDone }: { enc: InboxEncounter; target: InboxTarget; raterPlayer: string | null; onDone: (points: number) => void }) {
  const theme = useTheme();
  const [scores, setScores] = useState<Partial<Record<Category, number>>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const complete = useMemo(() => target.categories.every((c) => (scores[c] ?? 0) >= 1), [scores, target]);

  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await submitRating(enc.id, target.player_id, raterPlayer, scores);
      onDone(r.points);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 14, padding: 14, borderRadius: 16, backgroundColor: theme.background }}>
      <Row style={{ gap: 12 }}>
        <Avatar uri={target.avatar} name={target.nickname} size={48} ring={theme.primary} />
        <View style={{ flex: 1 }}>
          <T weight="800" size={17}>
            {target.nickname}
          </T>
          <T size={12} color="textSecondary">
            Du bewertest als {ROLE[target.role]} · sichtbar mit deinem Namen
          </T>
        </View>
      </Row>
      {target.categories.map((c) => (
        <StarInput key={c} label={CATEGORY[c].label} hint={CATEGORY[c].hint} value={scores[c] ?? 0} onChange={(v) => setScores((s) => ({ ...s, [c]: v }))} />
      ))}
      {!!err && <T size={13} style={{ color: theme.danger }}>{err}</T>}
      <Button title={busy ? 'Speichere …' : complete ? 'Bewertung abschicken · +10 Punkte' : `Noch ${target.categories.filter((c) => !scores[c]).length} Kategorien`} disabled={!complete || busy} onPress={save} />
    </View>
  );
}
