import { useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { FussballdePanel } from '@/components/fussballde-panel';
import { Button, Card, Chip, confirmAction, EmptyState, Field, Pill, Row, Screen, SectionTitle, T, Wrap } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useStore } from '@/lib/store';
import { errorText, supabase } from '@/lib/supabase';

type Tab = 'teams' | 'trainer' | 'spieler' | 'historie' | 'fussballde';
const AGE = ['E', 'D', 'C', 'B', 'A'] as const;

interface TeamRow {
  team_id: string;
  name: string;
  age_group: string;
  season: string;
  active: boolean;
  join_code: string | null;
  players: number;
  pending: number;
  trainers: string | null;
}
interface TrainerRow {
  membership_id: string;
  user_id: string;
  display_name: string;
  email: string;
  role: 'trainer' | 'club_admin';
  status: 'pending' | 'approved' | 'rejected';
  license: string | null;
  is_nlz: boolean;
  valid_from: string;
  valid_to: string | null;
  teams: string | null;
}
interface PlayerRow {
  member_id: string;
  player_id: string;
  nickname: string;
  birth_year: number;
  team_id: string;
  team_name: string;
  season: string;
  age_group: string;
  status: 'pending' | 'approved' | 'rejected';
  jersey_number: number | null;
  from_date: string;
  to_date: string | null;
}
interface HistoryRow {
  season: string;
  age_group: string;
  team_id: string | null;
  team_name: string;
  players: number;
  entries: number;
  confirmed: number;
  gold: number;
  points: number;
}
interface HistoryPlayer {
  player_id: string;
  nickname: string;
  entries: number;
  confirmed: number;
  gold: number;
  points: number;
  still_in_club: boolean;
}

const d = (s: string | null) => (s ? new Date(s).toLocaleDateString('de-DE') : '');

export default function ClubAdmin() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { staff, refreshStaff } = useStore();
  const theme = useTheme();
  const clubName = staff.find((s) => s.clubId === id)?.clubName ?? 'Verein';
  const [tab, setTab] = useState<Tab>('teams');
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [trainers, setTrainers] = useState<TrainerRow[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyPlayers, setHistoryPlayers] = useState<Record<string, HistoryPlayer[]>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // Formulare
  const [newTeam, setNewTeam] = useState({ name: '', age: 'D' as (typeof AGE)[number] });
  const [rollover, setRollover] = useState<Record<string, { name: string; age: (typeof AGE)[number] }>>({});
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [moveFor, setMoveFor] = useState<string | null>(null);
  const [jersey, setJersey] = useState<Record<string, string>>({});
  const [trainerTeams, setTrainerTeams] = useState<{ user_id: string; team_id: string; name: string; season: string }[]>([]);
  const [playerFilter, setPlayerFilter] = useState<'aktiv' | 'anfragen' | 'ehemalig'>('aktiv');

  const load = useCallback(async () => {
    const [t, tr, p, h, tt] = await Promise.all([
      supabase.rpc('club_teams', { p_club: id }),
      supabase.rpc('club_trainers', { p_club: id }),
      supabase.rpc('club_players', { p_club: id }),
      supabase.rpc('club_history', { p_club: id }),
      supabase.rpc('club_trainer_teams', { p_club: id }),
    ]);
    setTrainerTeams((tt.data as { user_id: string; team_id: string; name: string; season: string }[]) ?? []);
    const err = t.error ?? tr.error ?? p.error ?? h.error;
    if (err) setMsg(errorText(err));
    setTeams((t.data as TeamRow[]) ?? []);
    setTrainers((tr.data as TrainerRow[]) ?? []);
    setPlayers((p.data as PlayerRow[]) ?? []);
    setHistory((h.data as HistoryRow[]) ?? []);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => PromiseLike<{ error: unknown }>, ok: string) => {
    setBusy(true);
    setMsg('');
    const { error } = await fn();
    setBusy(false);
    if (error) return setMsg('❌ ' + errorText(error));
    setMsg('✅ ' + ok);
    await load();
    refreshStaff();
  };

  const activeTeams = teams.filter((t) => t.active);
  const seasons = useMemo(() => Array.from(new Set(teams.map((t) => t.season))), [teams]);
  const pendingTrainers = trainers.filter((t) => t.status === 'pending' && !t.valid_to);
  const activeTrainers = trainers.filter((t) => t.status === 'approved' && !t.valid_to);
  const formerTrainers = trainers.filter((t) => !!t.valid_to || t.status === 'rejected');
  const playerRows = players.filter((p) =>
    playerFilter === 'aktiv' ? p.status === 'approved' && !p.to_date : playerFilter === 'anfragen' ? p.status === 'pending' && !p.to_date : !!p.to_date,
  );
  const pendingCount = players.filter((p) => p.status === 'pending' && !p.to_date).length;

  return (
    <Screen bottomBar={false} topInset={false}>
      <Stack.Screen options={{ title: clubName }} />
      <Wrap>
        <Chip label="👥 Teams" selected={tab === 'teams'} onPress={() => setTab('teams')} />
        <Chip label={`🧑‍🏫 Trainer${pendingTrainers.length ? ` (${pendingTrainers.length})` : ''}`} selected={tab === 'trainer'} onPress={() => setTab('trainer')} />
        <Chip label={`⚽ Spieler${pendingCount ? ` (${pendingCount})` : ''}`} selected={tab === 'spieler'} onPress={() => setTab('spieler')} />
        <Chip label="📜 Historie" selected={tab === 'historie'} onPress={() => setTab('historie')} />
        <Chip label="🔗 fussball.de" selected={tab === 'fussballde'} onPress={() => setTab('fussballde')} />
      </Wrap>

      {!!msg && (
        <Card style={{ borderColor: msg.startsWith('❌') ? theme.danger : theme.primary }}>
          <T size={14}>{msg}</T>
        </Card>
      )}

      {/* ───────── Teams ───────── */}
      {tab === 'teams' && (
        <>
          {seasons.map((season) => (
            <View key={season} style={{ gap: 12 }}>
              <SectionTitle>Saison {season}</SectionTitle>
              {teams
                .filter((t) => t.season === season)
                .map((t) => (
                  <Card key={t.team_id} style={!t.active ? { opacity: 0.75 } : undefined}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <T weight="800" style={{ flex: 1 }}>
                        {t.name} · {t.age_group}-Jugend
                      </T>
                      {!t.active && <Pill text="archiviert" color={theme.backgroundSelected} textColor={theme.text} />}
                      {t.pending > 0 && <Pill text={`${t.pending} neu`} color={theme.accent} textColor="#1F1700" />}
                    </Row>
                    <T size={13} color="textSecondary">
                      {t.players} Spieler*innen · Trainer: {t.trainers ?? '—'}
                      {t.join_code ? ` · Code ${t.join_code}` : ''}
                    </T>
                    {t.active && (
                      <>
                        {rollover[t.team_id] ? (
                          <View style={{ gap: 8 }}>
                            <T weight="700">In die nächste Saison übernehmen</T>
                            <Field
                              label="Name in der neuen Saison"
                              value={rollover[t.team_id].name}
                              onChangeText={(v) => setRollover((r) => ({ ...r, [t.team_id]: { ...r[t.team_id], name: v } }))}
                            />
                            <Wrap>
                              {AGE.map((a) => (
                                <Chip
                                  key={a}
                                  label={`${a}-Jugend`}
                                  selected={rollover[t.team_id].age === a}
                                  onPress={() => setRollover((r) => ({ ...r, [t.team_id]: { ...r[t.team_id], age: a } }))}
                                />
                              ))}
                            </Wrap>
                            <Button
                              title="Saisonwechsel durchführen"
                              disabled={busy || rollover[t.team_id].name.trim().length < 2}
                              onPress={() =>
                                confirmAction(
                                  'Saisonwechsel',
                                  `${t.name} wird archiviert. Alle ${t.players} Spieler*innen und Trainer*innen wechseln in „${rollover[t.team_id].name}“ der nächsten Saison. Die bisherige Saison bleibt in der Historie.`,
                                  () =>
                                    run(
                                      () =>
                                        supabase.rpc('club_rollover_team', {
                                          p_team: t.team_id,
                                          p_name: rollover[t.team_id].name,
                                          p_age_group: rollover[t.team_id].age,
                                        }),
                                      'Saisonwechsel durchgeführt',
                                    ),
                                )
                              }
                            />
                          </View>
                        ) : (
                          <Row>
                            <Button
                              title="↪ Neue Saison"
                              variant="secondary"
                              style={{ flex: 1 }}
                              onPress={() =>
                                setRollover((r) => ({
                                  ...r,
                                  [t.team_id]: { name: t.name, age: AGE[Math.min(AGE.indexOf(t.age_group as (typeof AGE)[number]) + 1, 4)] },
                                }))
                              }
                            />
                            <Button
                              title="Archivieren"
                              variant="danger"
                              onPress={() =>
                                confirmAction(
                                  'Team archivieren?',
                                  'Alle Spieler*innen und Trainer*innen werden vom Team abgemeldet. Die Historie bleibt erhalten.',
                                  () => run(() => supabase.rpc('club_archive_team', { p_team: t.team_id }), 'Team archiviert'),
                                )
                              }
                            />
                          </Row>
                        )}
                      </>
                    )}
                  </Card>
                ))}
            </View>
          ))}
          <SectionTitle>Neues Team</SectionTitle>
          <Card>
            <Field label="Teamname" placeholder="z. B. U12-1" value={newTeam.name} onChangeText={(v) => setNewTeam({ ...newTeam, name: v })} />
            <Wrap>
              {AGE.map((a) => (
                <Chip key={a} label={`${a}-Jugend`} selected={newTeam.age === a} onPress={() => setNewTeam({ ...newTeam, age: a })} />
              ))}
            </Wrap>
            <Button
              title="Team anlegen"
              disabled={busy || newTeam.name.trim().length < 2}
              onPress={() =>
                run(async () => {
                  const r = await supabase.rpc('create_team', { p_club: id, p_name: newTeam.name.trim(), p_age_group: newTeam.age });
                  if (!r.error) setNewTeam({ name: '', age: newTeam.age });
                  return r;
                }, 'Team angelegt')
              }
            />
          </Card>
        </>
      )}

      {/* ───────── Trainer ───────── */}
      {tab === 'trainer' && (
        <>
          {pendingTrainers.length > 0 && <SectionTitle>Anfragen ({pendingTrainers.length})</SectionTitle>}
          {pendingTrainers.map((t) => (
            <Card key={t.membership_id}>
              <T weight="800">{t.display_name}</T>
              <T size={13} color="textSecondary">
                {t.email}
                {t.license ? ` · ${t.license}` : ''}
                {t.is_nlz ? ' · NLZ' : ''}
              </T>
              <Row>
                <Button
                  title="Anmelden"
                  style={{ flex: 1 }}
                  disabled={busy}
                  onPress={() => run(() => supabase.from('club_memberships').update({ status: 'approved' }).eq('id', t.membership_id), 'Trainer*in angemeldet')}
                />
                <Button
                  title="Ablehnen"
                  variant="danger"
                  disabled={busy}
                  onPress={() => run(() => supabase.from('club_memberships').update({ status: 'rejected' }).eq('id', t.membership_id), 'Anfrage abgelehnt')}
                />
              </Row>
            </Card>
          ))}

          <SectionTitle>Aktiv ({activeTrainers.length})</SectionTitle>
          {activeTrainers.length === 0 && <EmptyState emoji="🧑‍🏫" title="Noch niemand" text="Trainer*innen stellen über den Trainer-Bereich eine Anfrage an euren Verein." />}
          {activeTrainers.map((t) => (
            <Card key={t.membership_id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T weight="800" style={{ flex: 1 }}>
                  {t.display_name}
                </T>
                <Pill text={t.role === 'club_admin' ? 'Admin' : 'Trainer*in'} color={theme.primarySoft} textColor={theme.text} />
              </Row>
              <T size={13} color="textSecondary">
                {t.email} · seit {d(t.valid_from)}
                {t.license ? ` · ${t.license}` : ''}
              </T>
              <T size={13} color="textSecondary">
                Teams {trainerTeams.some((x) => x.user_id === t.user_id) ? '(✕ zum Entfernen)' : ''}
              </T>
              <Wrap>
                {trainerTeams.filter((x) => x.user_id === t.user_id).length === 0 && <T size={13}>—</T>}
                {trainerTeams
                  .filter((x) => x.user_id === t.user_id)
                  .map((x) => (
                    <Chip
                      key={x.team_id}
                      label={`${x.name} (${x.season})  ✕`}
                      accessibilityLabel={`${x.name} entfernen`}
                      onPress={() =>
                        confirmAction(`${x.name} entfernen?`, `${t.display_name} ist dann nicht mehr Trainer*in von ${x.name}. Die Historie bleibt erhalten.`, () =>
                          run(() => supabase.rpc('club_unassign_trainer', { p_team: x.team_id, p_user: t.user_id }), 'Team-Zuordnung entfernt'),
                        'Entfernen')
                      }
                    />
                  ))}
              </Wrap>
              {assignFor === t.membership_id ? (
                <Wrap>
                  {activeTeams.filter((team) => !trainerTeams.some((x) => x.user_id === t.user_id && x.team_id === team.team_id)).map((team) => (
                    <Chip
                      key={team.team_id}
                      label={`${team.name} (${team.season})`}
                      onPress={() => {
                        setAssignFor(null);
                        run(() => supabase.rpc('club_assign_trainer', { p_team: team.team_id, p_user: t.user_id }), 'Team zugeordnet');
                      }}
                    />
                  ))}
                </Wrap>
              ) : (
                <Row>
                  {t.role === 'trainer' && (
                    <Button title="Team zuordnen" variant="secondary" style={{ flex: 1 }} onPress={() => setAssignFor(t.membership_id)} />
                  )}
                  {t.role === 'trainer' && (
                    <Button
                      title="Zum Admin"
                      variant="secondary"
                      onPress={() =>
                        confirmAction('Zum Vereins-Admin machen?', `${t.display_name} kann dann Trainer und Spieler verwalten.`, () =>
                          run(() => supabase.rpc('club_make_admin', { p_membership: t.membership_id }), 'Admin-Rechte vergeben'),
                        )
                      }
                    />
                  )}
                </Row>
              )}
              <Button
                title="Abmelden"
                variant="danger"
                onPress={() =>
                  confirmAction(
                    'Abmelden?',
                    `${t.display_name} wird aus dem Verein und allen Teams abgemeldet. Bereits freigegebene Leistungen bleiben erhalten.`,
                    () => run(() => supabase.rpc('club_remove_trainer', { p_membership: t.membership_id }), 'Abgemeldet'),
                  )
                }
              />
            </Card>
          ))}

          {formerTrainers.length > 0 && <SectionTitle>Ehemalige ({formerTrainers.length})</SectionTitle>}
          {formerTrainers.map((t) => (
            <Card key={t.membership_id} style={{ opacity: 0.8 }}>
              <T weight="700">{t.display_name}</T>
              <T size={13} color="textSecondary">
                {t.status === 'rejected' ? 'Anfrage abgelehnt' : `${d(t.valid_from)} – ${d(t.valid_to)}`} · {t.role === 'club_admin' ? 'Admin' : 'Trainer*in'}
              </T>
            </Card>
          ))}
        </>
      )}

      {/* ───────── Spieler ───────── */}
      {tab === 'spieler' && (
        <>
          <Wrap>
            <Chip label="Aktiv" selected={playerFilter === 'aktiv'} onPress={() => setPlayerFilter('aktiv')} />
            <Chip label={`Anfragen${pendingCount ? ` (${pendingCount})` : ''}`} selected={playerFilter === 'anfragen'} onPress={() => setPlayerFilter('anfragen')} />
            <Chip label="Ehemalige" selected={playerFilter === 'ehemalig'} onPress={() => setPlayerFilter('ehemalig')} />
          </Wrap>
          {playerRows.length === 0 && (
            <EmptyState
              emoji="⚽"
              title={playerFilter === 'anfragen' ? 'Keine Anfragen' : playerFilter === 'ehemalig' ? 'Noch keine Ehemaligen' : 'Noch keine Spieler*innen'}
              text="Eltern treten mit dem Team-Code bei. Danach erscheinen die Anfragen hier."
            />
          )}
          {playerRows.map((p) => (
            <Card key={p.member_id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T weight="800" style={{ flex: 1 }}>
                  {p.jersey_number ? `#${p.jersey_number} ` : ''}
                  {p.nickname}
                </T>
                <T size={13} color="textSecondary">
                  Jg. {p.birth_year}
                </T>
              </Row>
              <T size={13} color="textSecondary">
                {p.team_name} · {p.age_group}-Jugend · {p.season} · {d(p.from_date)}
                {p.to_date ? ` – ${d(p.to_date)}` : ''}
              </T>
              {playerFilter === 'anfragen' && (
                <>
                  <Field
                    label="Rückennummer (optional)"
                    keyboardType="number-pad"
                    maxLength={2}
                    value={jersey[p.member_id] ?? ''}
                    onChangeText={(v) => setJersey((j) => ({ ...j, [p.member_id]: v }))}
                  />
                  <Row>
                    <Button
                      title="Anmelden"
                      style={{ flex: 1 }}
                      disabled={busy}
                      onPress={() =>
                        run(
                          () =>
                            supabase.rpc('club_review_member', {
                              p_member: p.member_id,
                              p_accept: true,
                              p_jersey: jersey[p.member_id] ? Number(jersey[p.member_id]) : null,
                            }),
                          `${p.nickname} angemeldet`,
                        )
                      }
                    />
                    <Button
                      title="Ablehnen"
                      variant="danger"
                      disabled={busy}
                      onPress={() => run(() => supabase.rpc('club_review_member', { p_member: p.member_id, p_accept: false }), 'Abgelehnt')}
                    />
                  </Row>
                </>
              )}
              {playerFilter === 'aktiv' &&
                (moveFor === p.member_id ? (
                  <Wrap>
                    {activeTeams
                      .filter((t) => t.team_id !== p.team_id)
                      .map((t) => (
                        <Chip
                          key={t.team_id}
                          label={`${t.name} (${t.season})`}
                          onPress={() => {
                            setMoveFor(null);
                            run(() => supabase.rpc('club_move_player', { p_member: p.member_id, p_new_team: t.team_id }), `${p.nickname} umgesetzt`);
                          }}
                        />
                      ))}
                  </Wrap>
                ) : (
                  <Row>
                    <Button title="Team wechseln" variant="secondary" style={{ flex: 1 }} onPress={() => setMoveFor(p.member_id)} />
                    <Button
                      title="Abmelden"
                      variant="danger"
                      onPress={() =>
                        confirmAction(
                          'Abmelden?',
                          `${p.nickname} wird aus ${p.team_name} abgemeldet. Alle bisherigen Leistungen bleiben in eurer Vereinshistorie.`,
                          () => run(() => supabase.rpc('club_remove_player', { p_member: p.member_id }), `${p.nickname} abgemeldet`),
                        )
                      }
                    />
                  </Row>
                ))}
            </Card>
          ))}
        </>
      )}

      {tab === 'fussballde' && <FussballdePanel clubId={id} teams={teams} onSynced={load} />}

      {/* ───────── Historie ───────── */}
      {tab === 'historie' && (
        <>
          <T size={13} color="textSecondary">
            Jede Leistung bleibt dem Verein, Team, der Jugend und Saison zugeordnet, in der sie entstanden ist – auch wenn
            Spieler*innen später wechseln.
          </T>
          {history.length === 0 && <EmptyState emoji="📜" title="Noch keine Historie" text="Sobald Spieler*innen eurer Teams trainieren, entsteht hier die Vereinsgeschichte." />}
          {Array.from(new Set(history.map((h) => h.season))).map((season) => (
            <View key={season} style={{ gap: 12 }}>
              <SectionTitle>Saison {season}</SectionTitle>
              {history
                .filter((h) => h.season === season)
                .map((h) => (
                  <Card
                    key={`${h.season}-${h.team_id}`}
                    onPress={
                      h.team_id
                        ? async () => {
                            if (historyPlayers[h.team_id!]) {
                              setHistoryPlayers(({ [h.team_id!]: _, ...rest }) => rest);
                              return;
                            }
                            const { data } = await supabase.rpc('club_history_players', { p_team: h.team_id });
                            setHistoryPlayers((x) => ({ ...x, [h.team_id!]: (data as HistoryPlayer[]) ?? [] }));
                          }
                        : undefined
                    }>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <T weight="800">
                        {h.team_name} · {h.age_group}-Jugend
                      </T>
                      <T weight="800" style={{ color: theme.primary }}>
                        {h.points} P.
                      </T>
                    </Row>
                    <T size={13} color="textSecondary">
                      {h.players} Spieler*innen · {h.entries} Einträge · {h.confirmed} freigegeben · {h.gold}× Gold
                    </T>
                    {h.team_id &&
                      historyPlayers[h.team_id]?.map((p) => (
                        <Row key={p.player_id} style={{ justifyContent: 'space-between' }}>
                          <T size={14} style={{ flex: 1 }}>
                            {p.nickname}
                            {!p.still_in_club ? ' (gewechselt)' : ''}
                          </T>
                          <T size={13} color="textSecondary">
                            {p.confirmed}/{p.entries} · {p.points} P.
                          </T>
                        </Row>
                      ))}
                    {h.team_id && !historyPlayers[h.team_id] && (
                      <T size={12} color="textSecondary">
                        Antippen für Spieler*innen-Bilanz
                      </T>
                    )}
                  </Card>
                ))}
            </View>
          ))}
        </>
      )}
    </Screen>
  );
}
