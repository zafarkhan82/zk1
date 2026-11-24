import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { InviteBox } from '@/components/invite-form';
import { ActiveToggle, PendingClubCard, StatusTag } from '@/components/org-ui';
import { ClubImport } from '@/components/club-import';
import { StaffelAdmin } from '@/components/staffel-admin';
import { UnitLogoImage } from '@/components/unit-logo';
import { Button, Card, Columns, Field, H, Label, Row, Screen, SectionTitle, StripeHeader, T, confirmAction } from '@/components/ui';
import { Font } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CHILD_KIND, KIND_LABEL, useUnitDetail, useUnitLogos } from '@/lib/org';
import { errorText, supabase } from '@/lib/supabase';

/** Eine Ebene (Bundesland, Verband oder Kreis) verwalten */
export default function Gebiet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { detail, error, reload } = useUnitDetail(id);
  const [msg, setMsg] = useState('');
  const [name, setName] = useState('');
  const [short, setShort] = useState('');
  const [regional, setRegional] = useState<string | null>(null);
  const logos = useUnitLogos();
  useEffect(() => {
    if (id) supabase.rpc('unit_regional', { p_unit: id }).then(({ data }) => setRegional((data as string) ?? null));
  }, [id]);

  const call = async (fn: string, args: Record<string, unknown>, ok: string) => {
    const { error: e } = await supabase.rpc(fn, args);
    setMsg(e ? errorText(e) : ok);
    reload();
  };

  if (error)
    return (
      <Screen topInset={false}>
        <Card>
          <T style={{ color: theme.danger }}>{error}</T>
        </Card>
      </Screen>
    );
  if (!detail) return <Screen topInset={false}><T color="textSecondary">Lade …</T></Screen>;

  const u = detail.unit;
  const childKind = CHILD_KIND[u.kind];

  return (
    <Screen
      wide
      topInset={false}
      header={
        <StripeHeader height={170}>
          <Row style={{ gap: 8 }}>
            {!!logos[u.id]?.regional_logo && <UnitLogoImage url={logos[u.id]?.regional_logo} size={22} label={logos[u.id]?.regional ?? ''} />}
            <T size={13} color="textSecondary" style={{ flex: 1 }}>
              {[regional, ...detail.path.map((p) => p.name)].filter(Boolean).join(' › ') || 'Deutschland'}
            </T>
          </Row>
          <Row style={{ gap: 12, alignItems: 'center' }}>
            {!!logos[u.id]?.logo && <UnitLogoImage url={logos[u.id]?.logo} size={56} label={u.name} />}
            <View style={{ flex: 1, minWidth: 0 }}>
              {!!u.short_name && <H size={40}>{u.short_name}</H>}
              <H size={u.short_name ? 20 : 34} numberOfLines={2}>
                {u.name}
              </H>
            </View>
          </Row>
          <Row style={{ gap: 8 }}>
            <StatusTag text={KIND_LABEL[u.kind]} tone="off" />
            <StatusTag text={u.active && u.chain_active ? 'aktiv' : 'deaktiviert'} tone={u.active && u.chain_active ? 'ok' : 'off'} />
          </Row>
        </StripeHeader>
      }>
      {!!msg && (
        <Card style={{ borderColor: theme.primary }}>
          <T size={14}>{msg}</T>
        </Card>
      )}
      {u.can_toggle && (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <T weight="700">{KIND_LABEL[u.kind]} aktiv</T>
              <T size={12} color="textSecondary">
                Deaktiviert sperrt alle Ebenen und Vereine darunter.
              </T>
            </View>
            <ActiveToggle
              active={!!u.active}
              onChange={(v) =>
                v
                  ? call('set_unit_active', { p_unit: u.id, p_active: true }, 'Aktiviert.')
                  : confirmAction(`${u.name} deaktivieren?`, 'Alle Vereine darunter werden gesperrt.', () =>
                      call('set_unit_active', { p_unit: u.id, p_active: false }, 'Deaktiviert.'),
                    'Deaktivieren')
              }
            />
          </Row>
        </Card>
      )}

      <Columns
        left={
          <>
            {detail.pending.length > 0 && <SectionTitle right={<T color="textSecondary">{detail.pending.length}</T>}>Vereinsanfragen</SectionTitle>}
            {detail.pending.map((c) => (
              <PendingClubCard
                key={c.club_id}
                c={c}
                onReview={(a) => call('review_club', { p_club: c.club_id, p_accept: a }, a ? 'Verein freigegeben.' : 'Anfrage abgelehnt.')}
              />
            ))}

            {childKind && (
              <>
                <SectionTitle right={<T color="textSecondary">{detail.children.length}</T>}>
                  {childKind === 'verband' ? 'Verbände' : 'Kreise'}
                </SectionTitle>
                <Card style={{ gap: 0, paddingVertical: 6 }}>
                  {detail.children.length === 0 && <T color="textSecondary">Noch keine angelegt.</T>}
                  {detail.children.map((c, i) => (
                    <Row key={c.id} style={{ justifyContent: 'space-between', gap: 10, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: theme.border }}>
                      {c.kind === 'verband' && <UnitLogoImage url={logos[c.id]?.logo} size={40} label={c.name} />}
                      <View style={{ flex: 1 }}>
                        <Text
                          onPress={() => router.push({ pathname: '/verwaltung/[id]', params: { id: c.id } })}
                          style={{ fontFamily: Font.bold, fontSize: 15, color: theme.text }}>
                          {c.short_name ? `${c.short_name} · ` : ''}
                          {c.name} ›
                        </Text>
                        <T size={12} color="textSecondary">
                          {c.admins} Admin{c.admins === 1 ? '' : 's'} · {c.clubs} Vereine
                        </T>
                      </View>
                      <ActiveToggle
                        active={!!c.active}
                        onChange={(v) => call('set_unit_active', { p_unit: c.id, p_active: v }, v ? 'Aktiviert.' : 'Deaktiviert.')}
                      />
                    </Row>
                  ))}
                </Card>
                <Card style={{ gap: 8 }}>
                  <Label>{childKind === 'verband' ? 'Neuer Verband' : 'Neuer Kreis'}</Label>
                  <Field label="Name" value={name} onChangeText={setName} placeholder={childKind === 'kreis' ? 'z. B. Stuttgart' : 'z. B. Württembergischer Fußballverband'} />
                  {childKind === 'verband' && <Field label="Kürzel" value={short} onChangeText={setShort} placeholder="z. B. WFV" maxLength={20} />}
                  <Button
                    title="Anlegen"
                    variant="secondary"
                    disabled={name.trim().length < 2}
                    onPress={async () => {
                      await call('create_org_unit', { p_kind: childKind, p_parent: u.id, p_name: name, p_short: short || null }, 'Angelegt.');
                      setName('');
                      setShort('');
                    }}
                  />
                </Card>
              </>
            )}

            {u.kind === 'kreis' && <ClubImport kreisId={u.id} onDone={reload} />}
            {u.kind === 'kreis' && <StaffelAdmin kreisId={u.id} />}

            {detail.clubs && (
              <>
                <SectionTitle right={<T color="textSecondary">{detail.clubs.length}</T>}>Vereine</SectionTitle>
                <Card style={{ gap: 0, paddingVertical: 6 }}>
                  {detail.clubs.length === 0 && <T color="textSecondary">Noch keine Vereine.</T>}
                  {detail.clubs.map((c, i) => (
                    <Row key={c.id} style={{ justifyContent: 'space-between', gap: 10, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: theme.border }}>
                      <View style={{ flex: 1 }}>
                        <Text
                          onPress={() => router.push({ pathname: '/verein/[id]', params: { id: c.id } })}
                          style={{ fontFamily: Font.bold, fontSize: 15, color: theme.text }}>
                          {c.name}
                        </Text>
                        <T size={12} color="textSecondary">
                          {[c.city, u.kind === 'verband' ? `Kreis ${c.kreis}` : null, `${c.teams} Teams`, c.status === 'rejected' ? 'abgelehnt' : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </T>
                      </View>
                      {detail.can_toggle_clubs && c.status === 'approved' ? (
                        <ActiveToggle
                          active={!!c.active}
                          onChange={(v) => call('set_club_active', { p_club: c.id, p_active: v }, v ? 'Verein aktiviert.' : 'Verein deaktiviert.')}
                        />
                      ) : (
                        <StatusTag text={c.active ? 'aktiv' : 'deaktiviert'} tone={c.active ? 'ok' : 'off'} />
                      )}
                    </Row>
                  ))}
                </Card>
              </>
            )}
          </>
        }
        right={
          <>
            <SectionTitle right={<T color="textSecondary">{detail.admins.length}</T>}>Admins</SectionTitle>
            <Card style={{ gap: 10 }}>
              {detail.admins.length === 0 && <T color="textSecondary">Noch keine Admins für diese Ebene.</T>}
              {detail.admins.map((a) => (
                <Row key={a.id} style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <T weight="700">{a.name}</T>
                    <T size={12} color="textSecondary">
                      {a.email}
                      {a.me ? ' · du' : ''} · seit {new Date(a.since).toLocaleDateString('de-DE')}
                    </T>
                  </View>
                  <Button
                    title="Entfernen"
                    variant="danger"
                    style={{ minHeight: 34, paddingHorizontal: 12 }}
                    onPress={() =>
                      confirmAction('Admin entfernen?', `${a.email} verliert die Rechte für ${u.name}.`, () =>
                        call('remove_org_admin', { p_admin: a.id }, 'Admin entfernt.'),
                      'Entfernen')
                    }
                  />
                </Row>
              ))}
              <InviteBox kind="org_admin" targetId={u.id} label={`Admin für ${KIND_LABEL[u.kind]} ${u.short_name ?? u.name} einladen`} compact />
            </Card>
            <Card style={{ backgroundColor: theme.primarySoft }}>
              <Label color="primary">Rechte auf dieser Ebene</Label>
              <T size={14}>
                {u.kind === 'bundesland'
                  ? 'Bundesland-Admins legen Verbände an, aktivieren/deaktivieren sie und ernennen Verbands-Admins.'
                  : u.kind === 'verband'
                    ? 'Verbands-Admins legen Kreise an, aktivieren/deaktivieren Kreise und Vereine und ernennen Kreis-Admins.'
                    : 'Kreis-Admins geben Vereinsanfragen frei oder lehnen sie ab. Aktivieren/Deaktivieren von Vereinen macht der Verband.'}
              </T>
            </Card>
          </>
        }
      />
    </Screen>
  );
}
