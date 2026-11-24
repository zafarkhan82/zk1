import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, Text, View, type ViewStyle } from 'react-native';

import { Icon } from '@/components/icons';
import { Button, Card, Checkbox, Chip, H, Label, Num, Row, Screen, SectionTitle, Stat, T, Wrap } from '@/components/ui';
import { Font } from '@/constants/theme';
import { CATEGORIES } from '@/data/exercises';
import { useTheme } from '@/hooks/use-theme';
import { AGE_GROUP_LABEL, uClass } from '@/lib/age';
import { useAuth } from '@/lib/auth';
import { badges, confirmedXp, levelInfo, overall, skillScores, totalXp } from '@/lib/game';
import { useStore } from '@/lib/store';
import { errorText } from '@/lib/supabase';
import type { Category } from '@/lib/types';

const SHORT: Record<Category, string> = {
  ballkontrolle: 'BAL',
  dribbling: 'DRI',
  passen: 'PAS',
  schiessen: 'SCH',
  koordination: 'KOO',
  athletik: 'ATH',
  kopf: 'KOP',
  torwart: 'TOR',
};
const POS_SHORT: Record<string, string> = { Tor: 'TW', Abwehr: 'AB', Mittelfeld: 'MF', Sturm: 'ST', 'Noch offen': '—' };

export default function Ich() {
  const { session, signOut } = useAuth();
  const { state, group, players, premium, isAdmin, isStaff, teams, selectPlayer, setPublicConsent } = useStore();
  const theme = useTheme();
  const [error, setError] = useState('');
  const profile = state.profile!;
  const scores = skillScores(state, group);
  const isGk = profile.position === 'Tor';
  const xp = totalXp(state);
  const lvl = levelInfo(xp);
  const list = badges(state, group);
  const earned = list.filter((b) => b.earned).length;
  const confirmed = state.logs.filter((l) => l.status === 'confirmed').length;
  const golds = state.logs.filter((l) => l.level === 'gold' && l.achieved).length;
  const team = teams.find((t) => t.status === 'approved');
  const attrs = CATEGORIES.filter((c) => (isGk ? c.id !== 'kopf' : c.id !== 'torwart')).slice(0, 6);

  const cardBg =
    Platform.OS === 'web'
      ? ({ backgroundImage: `linear-gradient(160deg, #103A46 0%, ${theme.backgroundElement} 70%)` } as unknown as ViewStyle)
      : { backgroundColor: theme.backgroundElement };

  const toggleConsent = async (v: boolean) => {
    setError('');
    try {
      await setPublicConsent(v);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const LinkRow = ({ label, hint, onPress, highlight }: { label: string; hint?: string; onPress: () => void; highlight?: boolean }) => (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 60,
        paddingHorizontal: 18,
        borderRadius: 18,
        backgroundColor: highlight ? 'transparent' : theme.backgroundElement,
        borderWidth: highlight ? 1.5 : 0,
        borderColor: theme.primary,
        opacity: pressed ? 0.85 : 1,
      })}>
      <Text style={{ color: theme.text, fontFamily: Font.bold, fontSize: 16 }}>{label}</Text>
      <Row style={{ gap: 6 }}>
        {!!hint && <Text style={{ color: highlight ? theme.primary : theme.textSecondary, fontFamily: Font.medium, fontSize: 14 }}>{hint}</Text>}
        <Icon.Chevron color={highlight ? theme.primary : theme.textSecondary} />
      </Row>
    </Pressable>
  );

  return (
    <Screen>
      {players.length > 1 && (
        <Wrap>
          {players.map((p) => (
            <Chip key={p.id} label={p.nickname} selected={p.id === profile.id} onPress={() => selectPlayer(p.id)} />
          ))}
        </Wrap>
      )}

      <H size={44}>Deine Karte</H>

      <View style={[{ borderRadius: 28, padding: 22, gap: 14, borderWidth: 1.5, borderColor: theme.primary }, cardBg]}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Num size={72} color="primary" style={{ lineHeight: 70 }}>
              {overall(scores, isGk)}
            </Num>
            <Label color="text">{POS_SHORT[profile.position] ?? '—'}</Label>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            {team?.jerseyNumber != null && <Num size={40}>#{team.jerseyNumber}</Num>}
            <T size={13} color="textSecondary">
              {team ? `${team.clubName} · ` : ''}
              {AGE_GROUP_LABEL[group]} (U{uClass(profile.birthYear)})
            </T>
          </View>
        </Row>
        <Row style={{ alignItems: 'baseline', justifyContent: 'space-between' }}>
          <H size={40} numberOfLines={1} style={{ flex: 1 }}>
            {profile.nickname}
          </H>
          {premium && <Label color="primary">Premium</Label>}
        </Row>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 }}>
          {attrs.map((c) => (
            <View key={c.id} style={{ width: '33.33%', flexDirection: 'row', alignItems: 'baseline', gap: 6 }} accessibilityLabel={`${c.label} ${scores[c.id]}`}>
              <Num size={26}>{scores[c.id]}</Num>
              <Label>{SHORT[c.id]}</Label>
            </View>
          ))}
        </View>
        <T size={13} color="textSecondary">
          Level {lvl.level} · {lvl.title} · {xp.toLocaleString('de-DE')} XP
        </T>
      </View>

      <Row>
        <Stat label="Gold" value={String(golds)} />
        <Stat label="Freigaben" value={String(confirmed)} />
        <Stat label="Abzeichen" value={`${earned}/${list.length}`} />
      </Row>

      <LinkRow label="Verlauf" hint={`${state.logs.length + state.diary.length} Einträge`} onPress={() => router.push('/verlauf')} />
      <LinkRow label="Rangliste" hint="Team bis Deutschland" onPress={() => router.push('/rangliste')} />
      <LinkRow label="Tagebuch" hint={`${state.diary.length} Einträge`} onPress={() => router.push('/tagebuch')} />
      <LinkRow label="Challenges" onPress={() => router.push('/challenges')} />
      <LinkRow label={premium ? 'Premium aktiv' : 'Premium für Eltern'} hint={premium ? 'alle Funktionen' : '20 € / Jahr'} highlight={!premium} onPress={() => router.push('/premium')} />

      <SectionTitle right={<T color="textSecondary">{earned}/{list.length}</T>}>Abzeichen</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {list.map((b) => (
          <Card
            key={b.id}
            style={{
              width: '31%',
              minWidth: 96,
              flexGrow: 1,
              alignItems: 'center',
              borderColor: b.earned ? theme.primary : theme.border,
              borderStyle: b.earned ? 'solid' : 'dashed',
              backgroundColor: b.earned ? theme.backgroundElement : 'transparent',
            }}>
            <T size={26} style={{ opacity: b.earned ? 1 : 0.35 }}>
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
      </View>

      <SectionTitle>Einstellungen</SectionTitle>
      <Card>
        <Checkbox
          checked={profile.publicConsent}
          onChange={toggleConsent}
          label="Ab der C-Jugend in Ranglisten und der Spielersuche zeigen (Spitzname, Jahrgang, Verein, freigegebene Leistungen). Nur mit Premium."
        />
        {!!error && (
          <T size={13} style={{ color: theme.danger }}>
            {error}
          </T>
        )}
        <T size={12} color="textSecondary">
          {confirmedXp(state)} Ranglisten-Punkte · Spieler-Code {profile.code}
        </T>
      </Card>
      <LinkRow label="Weiteres Kind anlegen" onPress={() => router.push('/onboarding')} />
      <LinkRow label="Trainer-Bereich" hint={isStaff ? 'Freigaben & Teams' : undefined} onPress={() => router.push('/trainer')} />
      {isAdmin && <LinkRow label="Admin-Bereich" onPress={() => router.push('/admin')} />}
      <Card>
        <T size={13} color="textSecondary">
          Angemeldet als {session?.user.email}. Einträge werden nie gelöscht. Auf Wunsch anonymisieren wir ein Profil vollständig (DSGVO).
        </T>
        <Button title="Abmelden" variant="danger" onPress={() => signOut()} />
      </Card>
    </Screen>
  );
}
