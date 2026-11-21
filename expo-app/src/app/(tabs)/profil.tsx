import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Checkbox, Chip, Progress, Row, Screen, SectionTitle, T, Wrap } from '@/components/ui';
import { CATEGORIES } from '@/data/exercises';
import { useTheme } from '@/hooks/use-theme';
import { AGE_GROUP_LABEL, uClass } from '@/lib/age';
import { useAuth } from '@/lib/auth';
import { badges, confirmedXp, levelInfo, overall, skillScores, totalXp } from '@/lib/game';
import { useStore } from '@/lib/store';
import { errorText } from '@/lib/supabase';

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const { state, group, players, premium, isAdmin, teams, selectPlayer, setPublicConsent } = useStore();
  const theme = useTheme();
  const [error, setError] = useState('');
  const profile = state.profile!;
  const scores = skillScores(state, group);
  const xp = totalXp(state);
  const lvl = levelInfo(xp);
  const list = badges(state, group);
  const earned = list.filter((b) => b.earned).length;
  const confirmed = state.logs.filter((l) => l.status === 'confirmed').length;
  const team = teams.find((t) => t.status === 'approved') ?? teams[0];

  const toggleConsent = async (v: boolean) => {
    setError('');
    try {
      await setPublicConsent(v);
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <Screen>
      {players.length > 1 && (
        <Wrap>
          {players.map((p) => (
            <Chip key={p.id} label={p.nickname} selected={p.id === profile.id} onPress={() => selectPlayer(p.id)} />
          ))}
        </Wrap>
      )}

      <Card style={{ alignItems: 'center' }}>
        <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }}>
          <T size={34} weight="800" color="primaryText">
            {overall(scores, profile.position === 'Tor')}
          </T>
        </View>
        <Row>
          <T size={24} weight="800">
            {profile.nickname}
          </T>
          {premium && <T size={20}>⭐</T>}
        </Row>
        <T color="textSecondary" size={14} style={{ textAlign: 'center' }}>
          {AGE_GROUP_LABEL[group]} (U{uClass(profile.birthYear)}) · {profile.position}
          {team ? ` · ${team.clubName}` : ''}
        </T>
        <T weight="700">
          Level {lvl.level} · {lvl.title} · {xp} XP
        </T>
        <T size={12} color="textSecondary">
          Spieler-Code: {profile.code}
        </T>
      </Card>

      <Row>
        <Card style={{ flex: 1 }} onPress={() => router.push('/team')}>
          <T size={22}>👥</T>
          <T weight="700">{team ? team.teamName : 'Team beitreten'}</T>
          <T size={12} color="textSecondary">
            {team ? (team.status === 'approved' ? team.clubName : 'wartet auf Trainer') : 'mit Code vom Trainer'}
          </T>
        </Card>
        <Card style={{ flex: 1, borderColor: premium ? theme.primary : theme.accent }} onPress={() => router.push('/premium')}>
          <T size={22}>⭐</T>
          <T weight="700">{premium ? 'Premium aktiv' : 'Premium'}</T>
          <T size={12} color="textSecondary">
            {premium ? 'alle Funktionen' : '20 € / Jahr'}
          </T>
        </Card>
      </Row>

      <SectionTitle>Skills</SectionTitle>
      <Card>
        {CATEGORIES.filter((c) => c.id !== 'torwart' || profile.position === 'Tor' || scores.torwart > 0).map((c) => (
          <View key={c.id} style={{ gap: 4 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T size={14} weight="600">
                {c.emoji} {c.label}
              </T>
              <T size={14} weight="800">
                {scores[c.id]}
              </T>
            </Row>
            <Progress value={scores[c.id] / 99} />
          </View>
        ))}
      </Card>

      <SectionTitle right={<T color="textSecondary">{earned}/{list.length}</T>}>Abzeichen</SectionTitle>
      <Wrap>
        {list.map((b) => (
          <Card
            key={b.id}
            style={{
              width: '31%',
              minWidth: 96,
              flexGrow: 1,
              alignItems: 'center',
              borderStyle: b.earned ? 'solid' : 'dashed',
              backgroundColor: b.earned ? theme.backgroundElement : theme.background,
            }}>
            <T size={28} style={{ opacity: b.earned ? 1 : 0.4 }}>
              {b.emoji}
            </T>
            <T size={13} weight="700" style={{ textAlign: 'center' }}>
              {b.title}
            </T>
            <T size={11} color="textSecondary" style={{ textAlign: 'center' }}>
              {b.description}
            </T>
          </Card>
        ))}
      </Wrap>

      <SectionTitle>Bestätigte Leistungen</SectionTitle>
      <Card>
        <T weight="700">
          {confirmed} bestätigt · {confirmedXp(state)} Ranglisten-Punkte
        </T>
        <T size={13} color="textSecondary">
          Bestätigt heißt: Spieler bzw. Eltern und Trainer haben den Eintrag per E-Mail bestätigt.
        </T>
      </Card>

      <SectionTitle>Privatsphäre</SectionTitle>
      <Card>
        <Checkbox
          checked={profile.publicConsent}
          onChange={toggleConsent}
          label="In öffentlichen Ranglisten und in der Spielersuche zeigen (Spitzname, Jahrgang, Verein, bestätigte Leistungen). Nur mit Premium sichtbar."
        />
        {!profile.managedByGuardian && (
          <T size={12} color="textSecondary">
            Eigenes Spielerkonto (ab 16).
          </T>
        )}
        {!!error && (
          <T size={13} style={{ color: theme.danger }}>
            {error}
          </T>
        )}
      </Card>

      <SectionTitle>Konto</SectionTitle>
      <Card>
        <T size={13} color="textSecondary">
          Angemeldet als {session?.user.email}
        </T>
        <Button title="+ Weiteres Kind anlegen" variant="secondary" onPress={() => router.push('/onboarding')} />
        <Button title="🧑‍🏫 Trainer-Bereich" variant="secondary" onPress={() => router.push('/trainer')} />
        {isAdmin && <Button title="🛠️ Admin-Bereich" variant="secondary" onPress={() => router.push('/admin')} />}
        <Button title="Abmelden" variant="danger" onPress={() => signOut()} />
        <T size={12} color="textSecondary">
          Einträge werden nie gelöscht. Auf Wunsch anonymisieren wir ein Profil vollständig (DSGVO) – schreib uns dazu.
        </T>
      </Card>
    </Screen>
  );
}
