import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { TeamSchedule } from '@/components/fussballde-panel';
import { Icon } from '@/components/icons';
import { LeagueTable } from '@/components/league-table';
import { TIER_STYLE } from '@/components/player-card';
import { Button, Card, Field, H, Label, Num, Pill, Row, Screen, StripeHeader, T } from '@/components/ui';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { SCOPES, useRoster } from '@/lib/ranking';
import { tierFor } from '@/lib/rating';
import { useStore } from '@/lib/store';
import { errorText, supabase } from '@/lib/supabase';

interface History {
  club_name: string;
  team_name: string;
  season: string;
  age_group: string;
  from_date: string;
  to_date: string | null;
  jersey_number: number | null;
}

const initials = (s: string) =>
  s
    .replace(/[^A-Za-zÄÖÜäöüß0-9 ]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

export default function Team() {
  const { teams, joinTeam, state, isStaff } = useStore();
  const theme = useTheme();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [history, setHistory] = useState<History[]>([]);
  const team = teams.find((t) => t.status === 'approved');
  const pending = teams.filter((t) => t.status === 'pending');
  const { rows: roster, error: rosterError } = useRoster(team?.teamId);

  useEffect(() => {
    if (!state.profile) return;
    supabase.rpc('my_club_history', { p_player: state.profile.id }).then(({ data }) => setHistory((data as History[]) ?? []));
  }, [state.profile, teams]);

  const join = async () => {
    setBusy(true);
    setMsg('');
    try {
      await joinTeam(code);
      setCode('');
      setMsg('Anfrage gesendet! Der Trainer muss sie noch bestätigen.');
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      header={
        <StripeHeader height={team ? 200 : 150}>
          {team && (
            <View style={{ width: 64, height: 64, borderRadius: 999, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: theme.primaryText, fontFamily: Font.black, fontSize: 18 }}>{initials(team.clubName)}</Text>
            </View>
          )}
          <H size={44}>{team ? `${team.clubName} ${team.teamName}` : 'Dein Team'}</H>
          {team?.jerseyNumber != null && (
            <View style={{ alignSelf: 'flex-start', borderWidth: 1, borderColor: theme.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}>
              <Label color="text">Rückennummer {team.jerseyNumber}</Label>
            </View>
          )}
        </StripeHeader>
      }>
      {!team && (
        <Card style={{ gap: 12 }}>
          <H size={26}>Team beitreten</H>
          <T size={14} color="textSecondary">
            Frag deinen Trainer nach dem 6-stelligen Team-Code. Danach siehst du Spielplan und Team-Challenges, und dein Trainer kann
            deine Leistungen freigeben.
          </T>
          <Field label="Team-Code" placeholder="z. B. AB12CD" autoCapitalize="characters" value={code} onChangeText={(v) => setCode(v.toUpperCase())} maxLength={6} />
          <Button title={busy ? 'Sende …' : 'Beitreten'} onPress={join} disabled={code.trim().length !== 6 || busy} />
          {!!msg && <T size={14}>{msg}</T>}
        </Card>
      )}

      {pending.map((t) => (
        <Card key={t.memberId}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T weight="700">
              {t.clubName} · {t.teamName}
            </T>
            <Pill text="wartet" color={theme.backgroundSelected} textColor={theme.text} />
          </Row>
          <T size={13} color="textSecondary">
            Dein Trainer muss die Anfrage noch bestätigen.
          </T>
        </Card>
      ))}

      {team && <TeamSchedule teamId={team.teamId} />}
      {team && <LeagueTable teamId={team.teamId} />}

      {team && (
        <Card style={{ gap: 12 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Label>Ranglisten</Label>
            <T size={12} color="textSecondary">
              {team.league ?? 'ohne Spielklasse'}
            </T>
          </Row>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SCOPES.map((s) => (
              <Pressable
                key={s.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/rangliste', params: { scope: s.id } })}
                style={({ pressed }) => ({
                  flexGrow: 1,
                  flexBasis: '45%',
                  minHeight: 54,
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: theme.backgroundSelected,
                  opacity: pressed ? 0.85 : 1,
                })}>
                <Text style={{ color: theme.text, fontFamily: Font.bold, fontSize: 15 }}>{s.label}</Text>
                <Icon.Chevron color={theme.primary} />
              </Pressable>
            ))}
          </View>
        </Card>
      )}

      {team && roster.length > 0 && (
        <Card style={{ gap: 6 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Label>Kader · {roster.length} Spieler*innen</Label>
            <T size={12} color="textSecondary">
              Rating · Punkte
            </T>
          </Row>
          {roster.map((p, i) => (
            <Row
              key={p.playerId}
              style={{
                gap: 12,
                paddingVertical: 8,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: theme.border,
              }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: p.isMine ? theme.primary : theme.backgroundSelected,
                }}>
                <Text style={{ fontFamily: Font.number, fontSize: 15, color: p.isMine ? theme.primaryText : theme.text }}>
                  {p.jerseyNumber ?? '–'}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <T weight="700" numberOfLines={1} color={p.isMine ? 'primary' : 'text'}>
                  {p.nickname}
                </T>
                <T size={12} color="textSecondary">
                  {p.position ?? 'Position offen'} · {p.entries} Übungen
                </T>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <View
                  style={{
                    minWidth: 40,
                    paddingHorizontal: 6,
                    borderRadius: 8,
                    alignItems: 'center',
                    backgroundColor: TIER_STYLE[tierFor(p.rating).id].chip,
                    borderWidth: 1,
                    borderColor: TIER_STYLE[tierFor(p.rating).id].edge,
                  }}>
                  <Text style={{ fontFamily: Font.number, fontSize: 20, color: TIER_STYLE[tierFor(p.rating).id].chipText }}>{p.rating}</Text>
                </View>
                <T size={11} color="textSecondary">
                  {p.points.toLocaleString('de-DE')} Pkt.
                </T>
              </View>
            </Row>
          ))}
        </Card>
      )}
      {!!rosterError && (
        <T size={13} style={{ color: theme.danger }}>
          {rosterError}
        </T>
      )}

      {team && <Button title="Team-Challenges" variant="secondary" onPress={() => router.push('/challenges')} />}

      {history.length > 0 && (
        <Card>
          <Label>Vereinshistorie</Label>
          {history.map((h, i) => (
            <Row key={i} style={{ justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: 6 }}>
              <View style={{ flex: 1 }}>
                <T weight="700" color={h.to_date ? 'textSecondary' : 'text'}>
                  {h.club_name} · {h.team_name}
                </T>
                <T size={13} color="textSecondary">
                  {h.season} · {h.age_group}-Jugend{h.jersey_number ? ` · #${h.jersey_number}` : ''}
                </T>
              </View>
              <T size={12} color={h.to_date ? 'textSecondary' : 'primary'} weight="700">
                {h.to_date ? `bis ${new Date(h.to_date).toLocaleDateString('de-DE')}` : 'aktuell'}
              </T>
            </Row>
          ))}
        </Card>
      )}

      {team && (
        <Card>
          <Label>Anderes Team</Label>
          <Field label="Team-Code" placeholder="z. B. AB12CD" autoCapitalize="characters" value={code} onChangeText={(v) => setCode(v.toUpperCase())} maxLength={6} />
          <Button title={busy ? 'Sende …' : 'Beitreten'} variant="secondary" onPress={join} disabled={code.trim().length !== 6 || busy} />
          {!!msg && <T size={14}>{msg}</T>}
          <T size={12} color="textSecondary">
            Ein Vereinswechsel wird dokumentiert. Deine bisherigen Leistungen bleiben erhalten.
          </T>
        </Card>
      )}

      {isStaff && <Button title="Trainer-Bereich" variant="secondary" onPress={() => router.push('/trainer')} />}
    </Screen>
  );
}
