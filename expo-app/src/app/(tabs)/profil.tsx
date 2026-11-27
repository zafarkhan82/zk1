import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icons';
import { InviteBox } from '@/components/invite-form';
import { AvatarPicker } from '@/components/avatar';
import { PlayerCard, TierLadder } from '@/components/player-card';
import { Button, Card, Checkbox, Chip, Columns, H, Row, Screen, SectionTitle, Stat, T, Wrap } from '@/components/ui';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { badges, confirmedXp, levelInfo, totalXp } from '@/lib/game';
import { useAdminScope } from '@/lib/org';
import { usePlayerRating } from '@/lib/rating';
import { useStore } from '@/lib/store';
import { errorText } from '@/lib/supabase';

export default function Ich() {
  const { session, signOut } = useAuth();
  const { state, group, players, premium, isAdmin, isStaff, teams, selectPlayer, setPublicConsent, appMode, setPlayerAvatar } = useStore();
  const theme = useTheme();
  const [error, setError] = useState('');
  const profile = state.profile!;
  const rating = usePlayerRating(profile.id, state.logs.length);
  const { scope, hasAny } = useAdminScope();
  const xp = totalXp(state);
  const lvl = levelInfo(xp);
  const list = badges(state, group);
  const earned = list.filter((b) => b.earned).length;
  const confirmed = state.logs.filter((l) => l.status === 'confirmed').length;
  const golds = state.logs.filter((l) => l.level === 'gold' && l.achieved).length;
  const team = teams.find((t) => t.status === 'approved');

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
    <Screen wide>
      {players.length > 1 && (
        <Wrap>
          {players.map((p) => (
            <Chip key={p.id} label={p.nickname} selected={p.id === profile.id} onPress={() => selectPlayer(p.id)} />
          ))}
        </Wrap>
      )}

      <Columns
        left={
          <>
      <Row style={{ gap: 16 }}>
        <AvatarPicker uri={players.find((p) => p.id === profile.id)?.avatar} name={profile.nickname} size={76} onSave={(d) => setPlayerAvatar(profile.id, d)} />
        <View style={{ flex: 1 }}>
          <H size={34} numberOfLines={1}>
            {profile.nickname}
          </H>
          <T size={12} color="textSecondary">
            Profilbild antippen zum Ändern – sichtbar für Team und Bewertungen.
          </T>
        </View>
      </Row>
      <Row style={{ justifyContent: 'space-between' }}>
        <H size={44}>Deine Karte</H>
        {rating && rating.overallWeekAgo != null && rating.overall !== rating.overallWeekAgo && (
          <T weight="700" style={{ color: rating.overall > rating.overallWeekAgo ? theme.success : theme.danger }}>
            {rating.overall > rating.overallWeekAgo ? '▲' : '▼'} {Math.abs(rating.overall - rating.overallWeekAgo)} diese Woche
          </T>
        )}
      </Row>

      {rating ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Karte und QR-Code öffnen" onPress={() => router.push('/karte')}>
          <PlayerCard
            showQr
            data={{
              nickname: profile.nickname,
              position: profile.position,
              club: team?.clubName ?? null,
              team: team?.teamName ?? null,
              jersey: team?.jerseyNumber ?? null,
              overall: rating.overall,
              attributes: rating.attributes,
              go4proId: rating.go4proId,
            }}
          />
        </Pressable>
      ) : (
        <Card>
          <T color="textSecondary">Lade deine Karte …</T>
        </Card>
      )}
      {rating && (
        <Card>
          <TierLadder overall={rating.overall} />
        </Card>
      )}
      <LinkRow label="Karte, QR-Code & Wertung" hint={`Level ${lvl.level} · ${xp.toLocaleString('de-DE')} XP`} onPress={() => router.push('/karte')} highlight />

      <Row>
        <Stat label="Gold" value={String(golds)} />
        <Stat label="Freigaben" value={String(confirmed)} />
        <Stat label="Abzeichen" value={`${earned}/${list.length}`} />
      </Row>

      <LinkRow label="Meine Bewertungen" hint="wer mich wie bewertet hat" onPress={() => router.push('/bewertungen')} highlight />
      <LinkRow label="Punkte & Gutscheine" hint="fürs Bewerten" onPress={() => router.push('/punkte')} />
      <LinkRow label="Meine Seite" hint="ab 300 Punkten" onPress={() => router.push('/seite')} />
      <LinkRow label="Sponsoring-Börse" onPress={() => router.push('/sponsoring')} />
      <LinkRow label="Verlauf" hint={`${state.logs.length + state.diary.length} Einträge`} onPress={() => router.push('/verlauf')} />
      <LinkRow label="Rangliste" hint="Team bis Deutschland" onPress={() => router.push('/rangliste')} />
      <LinkRow label="Tagebuch" hint={`${state.diary.length} Einträge`} onPress={() => router.push('/tagebuch')} />
      <LinkRow label="Challenges" onPress={() => router.push('/challenges')} />
      <LinkRow label={premium ? 'Premium aktiv' : 'Premium für Eltern'} hint={premium ? 'alle Funktionen' : '20 € / Jahr'} highlight={!premium} onPress={() => router.push('/premium')} />

          </>
        }
        right={
          <>
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
      {profile.managedByGuardian && (
        <Card style={{ gap: 10, borderColor: profile.hasOwnAccess ? 'transparent' : theme.primary }}>
          <T weight="700">Eigener Zugang für {profile.nickname}</T>
          {profile.hasOwnAccess ? (
            <T size={13} color="textSecondary">
              {profile.nickname} hat ein eigenes Login, trägt Training selbst ein und kann andere bewerten. Du behältst den Überblick
              und entscheidest über die Veröffentlichung.
            </T>
          ) : (
            <>
              <T size={13} color="textSecondary">
                Damit {profile.nickname} sich selbst trackt und andere bewertet: E-Mail-Adresse deines Kindes eintragen. Es bekommt eine
                Einladung, meldet sich an und bestätigt. Deine Zustimmung gibst du mit dieser Einladung.
              </T>
              <InviteBox kind="player_access" targetId={profile.id} label={`Zugang für ${profile.nickname} einrichten`} compact />
            </>
          )}
        </Card>
      )}
      <Card>
        {profile.isMe && profile.hasGuardian && new Date().getFullYear() - profile.birthYear < 17 ? (
          <T size={13} color="textSecondary">
            Ob du in Ranglisten und der Spielersuche erscheinst, entscheiden deine Eltern.
          </T>
        ) : (
          <Checkbox
            checked={profile.publicConsent}
            onChange={toggleConsent}
            label="Ab der C-Jugend in Ranglisten und der Spielersuche zeigen (Spitzname, Jahrgang, Verein, freigegebene Leistungen). Nur mit Premium."
          />
        )}
        {!!error && (
          <T size={13} style={{ color: theme.danger }}>
            {error}
          </T>
        )}
        <T size={12} color="textSecondary">
          {confirmedXp(state)} Ranglisten-Punkte · Spieler-Code {profile.code}
        </T>
      </Card>
      {appMode !== 'spieler' && !profile.isMe && (
        <LinkRow label={players.length > 1 ? `Kinder (${players.length}) · weiteres anlegen` : 'Weiteres Kind anlegen'} onPress={() => router.push({ pathname: '/onboarding', params: { rolle: 'eltern' } })} />
      )}
      <LinkRow label="Rolle ändern" hint={appMode === 'spieler' ? 'Spieler*in' : appMode === 'trainer' ? 'Trainer*in' : appMode === 'admin' ? 'Admin' : 'Elternteil'} onPress={() => router.push('/rolle')} />
      <LinkRow label="Trainer-Bereich" hint={isStaff ? 'Freigaben & Teams' : undefined} onPress={() => router.push('/trainer')} />
      {hasAny && (
        <LinkRow
          label="Verwaltung"
          hint={scope?.pending ? `${scope.pending} offene Anfragen` : scope?.super ? 'Super-Admin' : 'Verband & Kreis'}
          onPress={() => router.push('/verwaltung')}
          highlight={!!scope?.pending}
        />
      )}
      {isAdmin && <LinkRow label="Admin-Bereich" hint="Zahlungen, Lizenzen, Werbung" onPress={() => router.push('/admin')} />}
      <Card>
        <T size={13} color="textSecondary">
          Angemeldet als {session?.user.email}. Einträge werden nie gelöscht. Auf Wunsch anonymisieren wir ein Profil vollständig (DSGVO).
        </T>
        <Button title="Abmelden" variant="danger" onPress={() => signOut()} />
      </Card>
          </>
        }
      />
    </Screen>
  );
}
