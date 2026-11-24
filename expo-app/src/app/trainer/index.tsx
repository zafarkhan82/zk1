import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Checkbox, Chip, EmptyState, Field, Pill, Row, Screen, SectionTitle, T, useLevelColors, Wrap } from '@/components/ui';
import { getExercise, LEVELS } from '@/data/exercises';
import { useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/lib/game';
import { useOrgUnits } from '@/lib/org';
import { useStore } from '@/lib/store';
import { errorText, supabase } from '@/lib/supabase';
import type { Level, StaffRow } from '@/lib/types';

interface Review {
  entry_id: string;
  nickname: string;
  team_name: string | null;
  exercise_id: string;
  level: Level;
  value: number | null;
  achieved: boolean;
  note: string | null;
  created_at: string;
}

interface TrainerRequest {
  membership_id: string;
  display_name: string;
  email: string;
  license: string | null;
  is_nlz: boolean;
}

const AGE = ['E', 'D', 'C', 'B', 'A'] as const;

function ClubCard({ clubId, rows, onChanged }: { clubId: string; rows: StaffRow[]; onChanged: () => void }) {
  const theme = useTheme();
  const first = rows[0];
  const approved = first.membershipStatus === 'approved' && first.clubStatus === 'approved';
  const teams = rows.filter((r) => r.teamId);
  const [name, setName] = useState('');
  const [age, setAge] = useState<(typeof AGE)[number]>('D');
  const [requests, setRequests] = useState<TrainerRequest[]>([]);
  const [msg, setMsg] = useState('');

  const loadRequests = useCallback(async () => {
    if (first.role !== 'club_admin' || !approved) return;
    const { data } = await supabase.rpc('club_trainer_requests', { p_club: clubId });
    setRequests((data as TrainerRequest[]) ?? []);
  }, [clubId, first.role, approved]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const createTeam = async () => {
    setMsg('');
    const { error } = await supabase.rpc('create_team', { p_club: clubId, p_name: name.trim(), p_age_group: age });
    if (error) return setMsg(errorText(error));
    setName('');
    onChanged();
  };

  const review = async (id: string, accept: boolean) => {
    const { error } = await supabase
      .from('club_memberships')
      .update({ status: accept ? 'approved' : 'rejected' })
      .eq('id', id);
    if (error) return setMsg(errorText(error));
    loadRequests();
  };

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <T weight="800" size={18} style={{ flex: 1 }}>
          🏟️ {first.clubName}
        </T>
        <T size={12} color="textSecondary">
          {first.role === 'club_admin' ? 'Vereins-Admin' : 'Trainer*in'}
        </T>
      </Row>
      {approved && first.role === 'club_admin' && (
        <Button title="⚙️ Vereins-Administration" onPress={() => router.push({ pathname: '/verein/[id]', params: { id: clubId } })} />
      )}
      {!approved && (
        <T size={14} color="textSecondary">
          ⏳ {first.clubStatus !== 'approved' ? 'Der Verein wird gerade von Go4Pro geprüft.' : 'Dein Antrag wartet auf die Freigabe durch den Verein.'}
        </T>
      )}
      {first.licenseUntil && (
        <T size={13} weight="700" style={{ color: theme.primary }}>
          ⭐ Vereinslizenz aktiv bis {new Date(first.licenseUntil).toLocaleDateString('de-DE')}
        </T>
      )}
      {approved &&
        teams.map((t) => (
          <Card key={t.teamId!} onPress={() => router.push({ pathname: '/trainer/team/[id]', params: { id: t.teamId! } })}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <T weight="700">
                  {t.teamName} · {t.ageGroup}-Jugend
                </T>
                <T size={13} color="textSecondary">
                  Saison {t.season} · Code {t.joinCode ?? '—'}
                </T>
              </View>
              {t.pendingMembers > 0 && <Pill text={`${t.pendingMembers} neu`} color={theme.accent} textColor="#1F1700" />}
            </Row>
          </Card>
        ))}
      {approved && (
        <View style={{ gap: 8 }}>
          <T weight="700">Neues Team anlegen</T>
          <Field label="Teamname" placeholder="z. B. U12-1" value={name} onChangeText={setName} maxLength={30} />
          <Wrap>
            {AGE.map((a) => (
              <Chip key={a} label={`${a}-Jugend`} selected={age === a} onPress={() => setAge(a)} />
            ))}
          </Wrap>
          <Button title="Team anlegen" variant="secondary" disabled={name.trim().length < 2} onPress={createTeam} />
        </View>
      )}
      {requests.length > 0 && (
        <View style={{ gap: 8 }}>
          <T weight="700">Trainer-Anfragen</T>
          {requests.map((r) => (
            <Card key={r.membership_id}>
              <T weight="700">{r.display_name}</T>
              <T size={13} color="textSecondary">
                {r.email}
                {r.license ? ` · ${r.license}` : ''}
                {r.is_nlz ? ' · NLZ' : ''}
              </T>
              <Row>
                <Button title="Freigeben" style={{ flex: 1 }} onPress={() => review(r.membership_id, true)} />
                <Button title="Ablehnen" variant="danger" onPress={() => review(r.membership_id, false)} />
              </Row>
            </Card>
          ))}
        </View>
      )}
      {!!msg && (
        <T size={13} style={{ color: theme.danger }}>
          {msg}
        </T>
      )}
    </Card>
  );
}

export default function TrainerHub() {
  const { staff, refreshStaff, isStaff } = useStore();
  const theme = useTheme();
  const levelColors = useLevelColors();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // Verein suchen / vorschlagen
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ id: string; name: string; city: string | null }[]>([]);
  const [license, setLicense] = useState('');
  const [isNlz, setIsNlz] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [club, setClub] = useState({ name: '', city: '', postal: '', verband: '', kreis: '', dfb: '' });
  const orgUnits = useOrgUnits();
  const verbaende = orgUnits.filter((o) => o.kind === 'verband').sort((a, b) => a.name.localeCompare(b.name));
  const kreise = orgUnits.filter((o) => o.kind === 'kreis' && o.parent_id === club.verband).sort((a, b) => a.name.localeCompare(b.name));

  const loadReviews = useCallback(async () => {
    const { data } = await supabase.rpc('trainer_pending_reviews');
    const list = (data as Review[]) ?? [];
    setReviews(list);
    setSelected(Object.fromEntries(list.map((r) => [r.entry_id, true])));
  }, []);

  useEffect(() => {
    refreshStaff();
    loadReviews();
  }, [refreshStaff, loadReviews]);

  const decide = async (accept: boolean) => {
    const ids = reviews.filter((r) => selected[r.entry_id]).map((r) => r.entry_id);
    if (!ids.length) return;
    setBusy(true);
    setMsg('');
    const { data, error } = await supabase.rpc('trainer_review_entries', { p_ids: ids, p_accept: accept });
    setBusy(false);
    if (error) return setMsg(errorText(error));
    setMsg(`✅ ${data} ${accept ? 'freigegeben' : 'abgelehnt'}`);
    loadReviews();
  };

  const search = async () => {
    const q = query.trim();
    if (q.length < 2) return;
    const { data } = await supabase.from('clubs').select('id,name,city').eq('status', 'approved').ilike('name', `%${q}%`).limit(20);
    setResults(data ?? []);
  };

  const joinClub = async (id: string) => {
    setMsg('');
    const { error } = await supabase.rpc('request_club_membership', { p_club: id, p_license: license, p_is_nlz: isNlz });
    if (error) return setMsg(errorText(error));
    setMsg('✅ Antrag gesendet – der Verein gibt dich frei.');
    setResults([]);
    refreshStaff();
  };

  const proposeClub = async () => {
    setMsg('');
    const { error } = await supabase.rpc('request_club', {
      p_name: club.name,
      p_city: club.city,
      p_postal: club.postal,
      p_kreis: club.kreis,
      p_dfb_number: club.dfb,
    });
    if (error) return setMsg(errorText(error));
    setMsg('✅ Verein angemeldet – der Kreis prüft die Anfrage und schaltet dich als Vereins-Admin frei.');
    setShowNew(false);
    refreshStaff();
  };

  const clubs = Array.from(new Set(staff.map((s) => s.clubId)));
  const allSelected = reviews.length > 0 && reviews.every((r) => selected[r.entry_id]);

  return (
    <Screen bottomBar={false} topInset={false}>
      {!!msg && (
        <Card style={{ borderColor: theme.primary }}>
          <T size={14}>{msg}</T>
        </Card>
      )}

      {isStaff && <Button title="Nachricht an dein Team schreiben" variant="secondary" onPress={() => router.push('/nachricht-neu')} />}

      <SectionTitle>Freigaben ({reviews.length})</SectionTitle>
      {reviews.length === 0 ? (
        <EmptyState emoji="✅" title="Alles erledigt" text="Keine offenen Freigaben. Neue Silber- und Gold-Einträge deiner Spieler*innen erscheinen hier." />
      ) : (
        <Card>
          <Checkbox
            checked={allSelected}
            onChange={(v) => setSelected(Object.fromEntries(reviews.map((r) => [r.entry_id, v])))}
            label="Alle auswählen"
          />
          {reviews.map((r) => {
            const ex = getExercise(r.exercise_id);
            const lv = LEVELS.find((l) => l.id === r.level)!;
            return (
              <View key={r.entry_id} style={{ borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 8 }}>
                <Checkbox
                  checked={!!selected[r.entry_id]}
                  onChange={(v) => setSelected((s) => ({ ...s, [r.entry_id]: v }))}
                  label={`${r.nickname}${r.team_name ? ` (${r.team_name})` : ''}: ${ex?.emoji ?? ''} ${ex?.title ?? r.exercise_id} – ${
                    r.value !== null ? `${String(r.value).replace('.', ',')} ${ex?.unit ?? ''}` : 'erledigt'
                  }${r.achieved ? ' ✅ Ziel' : ''}`}
                />
                <Row>
                  <Pill text={lv.label} color={levelColors[r.level].bg} textColor={levelColors[r.level].fg} />
                  <T size={12} color="textSecondary">
                    {formatDate(r.created_at)}
                    {r.note ? ` · „${r.note}“` : ''}
                  </T>
                </Row>
              </View>
            );
          })}
          <Button title={busy ? 'Speichere …' : '✔ Ausgewählte freigeben'} disabled={busy} onPress={() => decide(true)} />
          <Button title="Ausgewählte ablehnen" variant="danger" disabled={busy} onPress={() => decide(false)} />
          <T size={12} color="textSecondary">
            Bitte nur freigeben, was du gesehen hast oder für plausibel hältst. Bei Abhak-Übungen bestätigst du damit auch, dass das
            Ziel erreicht ist.
          </T>
        </Card>
      )}

      <SectionTitle>Meine Vereine & Teams</SectionTitle>
      {clubs.length === 0 && (
        <EmptyState emoji="🧑‍🏫" title="Noch kein Verein" text="Such deinen Verein und beantrage die Freigabe als Trainer*in – oder schlag ihn neu vor." />
      )}
      {clubs.map((id) => (
        <ClubCard key={id} clubId={id} rows={staff.filter((s) => s.clubId === id)} onChanged={refreshStaff} />
      ))}

      <SectionTitle>Verein beitreten</SectionTitle>
      <Card>
        <Field label="Verein suchen" placeholder="z. B. SV Musterstadt" value={query} onChangeText={setQuery} onSubmitEditing={search} />
        <Button title="Suchen" variant="secondary" disabled={query.trim().length < 2} onPress={search} />
        {results.length > 0 && (
          <>
            <Field label="Deine Trainerlizenz (optional)" placeholder="z. B. C-Lizenz" value={license} onChangeText={setLicense} />
            <Checkbox checked={isNlz} onChange={setIsNlz} label="Ich bin Trainer*in in einem Nachwuchsleistungszentrum (NLZ)" />
          </>
        )}
        {results.map((c) => (
          <Row key={c.id} style={{ justifyContent: 'space-between' }}>
            <T style={{ flex: 1 }}>
              {c.name}
              {c.city ? ` · ${c.city}` : ''}
            </T>
            <Button title="Beitreten" style={{ minHeight: 44 }} onPress={() => joinClub(c.id)} />
          </Row>
        ))}
        {!showNew ? (
          <Button title="Verein nicht gefunden? Neu vorschlagen" variant="secondary" onPress={() => setShowNew(true)} />
        ) : (
          <View style={{ gap: 8 }}>
            <Field label="Vereinsname" value={club.name} onChangeText={(v) => setClub({ ...club, name: v })} />
            <Field label="Ort" value={club.city} onChangeText={(v) => setClub({ ...club, city: v })} />
            <Field label="PLZ" keyboardType="number-pad" value={club.postal} onChangeText={(v) => setClub({ ...club, postal: v })} />
            <T size={13} weight="700">
              Verband
            </T>
            <Wrap>
              {verbaende.map((v) => (
                <Chip key={v.id} label={v.short_name ?? v.name} selected={club.verband === v.id} onPress={() => setClub({ ...club, verband: v.id, kreis: '' })} />
              ))}
            </Wrap>
            {!!club.verband && (
              <>
                <T size={13} weight="700">
                  Kreis
                </T>
                {kreise.length === 0 ? (
                  <T size={13} color="textSecondary">
                    Für diesen Verband sind noch keine Kreise angelegt. Bitte wende dich an deinen Verband.
                  </T>
                ) : (
                  <Wrap>
                    {kreise.map((k) => (
                      <Chip key={k.id} label={k.name} selected={club.kreis === k.id} onPress={() => setClub({ ...club, kreis: k.id })} />
                    ))}
                  </Wrap>
                )}
              </>
            )}
            <Field label="DFB-Vereinsnummer (optional)" value={club.dfb} onChangeText={(v) => setClub({ ...club, dfb: v })} />
            <Button title="Verein anmelden" disabled={club.name.trim().length < 3 || !club.kreis} onPress={proposeClub} />
            <T size={12} color="textSecondary">
              Die Anfrage geht an die Admins deines Kreises. Nach der Freigabe bist du Vereins-Admin.
            </T>
          </View>
        )}
      </Card>
    </Screen>
  );
}
