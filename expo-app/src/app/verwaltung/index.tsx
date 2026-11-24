import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { AddByEmail, PendingClubCard, StatusTag } from '@/components/org-ui';
import { UnitLogoImage } from '@/components/unit-logo';
import { Button, Card, Columns, Field, H, Label, Row, Screen, SectionTitle, StripeHeader, T } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { KIND_LABEL, useAdminScope, useUnitLogos, type PendingClub } from '@/lib/org';
import { errorText, supabase } from '@/lib/supabase';

/** Verwaltung: Super-Admins, Bundesländer, eigene Bereiche und offene Vereinsanfragen */
export default function Verwaltung() {
  const theme = useTheme();
  const { scope, reload } = useAdminScope();
  const logos = useUnitLogos();
  const [pending, setPending] = useState<PendingClub[]>([]);
  const [supers, setSupers] = useState<{ id: string; email: string; name: string; me: boolean }[]>([]);
  const [newBl, setNewBl] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const [p, s] = await Promise.all([supabase.rpc('pending_club_requests'), supabase.rpc('super_admins')]);
    setPending((p.data as PendingClub[]) ?? []);
    setSupers((s.data as typeof supers) ?? []);
    reload();
  }, [reload]);
  useEffect(() => {
    load();
  }, [load]);

  const review = async (id: string, accept: boolean) => {
    const { error } = await supabase.rpc('review_club', { p_club: id, p_accept: accept });
    setMsg(error ? errorText(error) : accept ? 'Verein freigegeben.' : 'Anfrage abgelehnt.');
    load();
  };

  if (!scope) return <Screen topInset={false}><T color="textSecondary">Lade …</T></Screen>;
  if (!scope.super && scope.units.length === 0)
    return (
      <Screen topInset={false}>
        <Card>
          <T>Du hast noch keine Verwaltungsrolle. Admins von Bundesland, Verband oder Kreis werden von der Ebene darüber ernannt.</T>
        </Card>
      </Screen>
    );

  return (
    <Screen
      wide
      topInset={false}
      header={
        <StripeHeader height={150}>
          <H size={48}>Verwaltung</H>
          <T size={14} color="textSecondary">
            {scope.super ? 'Super-Admin · alle Ebenen' : scope.units.map((u) => `${KIND_LABEL[u.kind]} ${u.short_name ?? u.name}`).join(' · ')}
          </T>
        </StripeHeader>
      }>
      {!!msg && (
        <Card style={{ borderColor: theme.primary }}>
          <T size={14}>{msg}</T>
        </Card>
      )}
      <Columns
        left={
          <>
            <SectionTitle right={<T color="textSecondary">{pending.length}</T>}>Vereinsanfragen</SectionTitle>
            {pending.length === 0 ? (
              <Card>
                <T color="textSecondary">Keine offenen Anfragen. Vereine melden sich im Trainer-Bereich mit Verband und Kreis an.</T>
              </Card>
            ) : (
              pending.map((c) => <PendingClubCard key={c.club_id} c={c} onReview={(a) => review(c.club_id, a)} />)
            )}

            {scope.units.length > 0 && <SectionTitle>Deine Bereiche</SectionTitle>}
            {scope.units.map((u) => (
              <Card key={u.id} onPress={() => router.push({ pathname: '/verwaltung/[id]', params: { id: u.id } })}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Label>{KIND_LABEL[u.kind]}</Label>
                  <StatusTag text={u.active ? 'aktiv' : 'deaktiviert'} tone={u.active ? 'ok' : 'off'} />
                </Row>
                <Row style={{ gap: 12 }}>
                  {!!logos[u.id]?.logo && <UnitLogoImage url={logos[u.id]?.logo} size={40} label={u.name} />}
                  <View style={{ flex: 1 }}>
                    <T weight="700">{u.name}</T>
                    {!!u.parent && (
                      <T size={13} color="textSecondary">
                        {u.parent}
                      </T>
                    )}
                  </View>
                </Row>
              </Card>
            ))}
          </>
        }
        right={
          scope.super ? (
            <>
              <SectionTitle right={<T color="textSecondary">{scope.bundeslaender?.length ?? 0}</T>}>Bundesländer</SectionTitle>
              <Card style={{ gap: 0, paddingVertical: 6 }}>
                {(scope.bundeslaender ?? []).map((b, i) => (
                  <Row
                    key={b.id}
                    style={{ justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: theme.border }}>
                    <View style={{ flex: 1 }}>
                      <T weight="700">{b.name}</T>
                      <T size={12} color="textSecondary">
                        {b.children} {b.children === 1 ? 'Verband' : 'Verbände'}
                      </T>
                    </View>
                    <Button
                      title="Öffnen"
                      variant="secondary"
                      onPress={() => router.push({ pathname: '/verwaltung/[id]', params: { id: b.id } })}
                      style={{ minHeight: 36, paddingHorizontal: 14 }}
                    />
                  </Row>
                ))}
              </Card>
              <Card style={{ gap: 8 }}>
                <Field label="Neues Bundesland" value={newBl} onChangeText={setNewBl} />
                <Button
                  title="Anlegen"
                  variant="secondary"
                  disabled={newBl.trim().length < 2}
                  onPress={async () => {
                    const { error } = await supabase.rpc('create_org_unit', { p_kind: 'bundesland', p_parent: null, p_name: newBl, p_short: null });
                    setMsg(error ? errorText(error) : 'Bundesland angelegt.');
                    if (!error) setNewBl('');
                    load();
                  }}
                />
              </Card>

              <SectionTitle right={<T color="textSecondary">{supers.length}</T>}>Super-Admins</SectionTitle>
              <Card style={{ gap: 10 }}>
                {supers.map((s) => (
                  <Row key={s.id} style={{ justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <T weight="700">{s.name}</T>
                      <T size={12} color="textSecondary">
                        {s.email}
                        {s.me ? ' · du' : ''}
                      </T>
                    </View>
                    {!s.me && (
                      <Button
                        title="Entfernen"
                        variant="danger"
                        style={{ minHeight: 34, paddingHorizontal: 12 }}
                        onPress={async () => {
                          const { error } = await supabase.rpc('set_super_admin', { p_email: s.email, p_on: false });
                          setMsg(error ? errorText(error) : 'Super-Admin entfernt.');
                          load();
                        }}
                      />
                    )}
                  </Row>
                ))}
                <AddByEmail
                  label="Weitere*n Super-Admin ernennen"
                  onAdd={async (email) => {
                    const { error } = await supabase.rpc('set_super_admin', { p_email: email, p_on: true });
                    load();
                    return error ? errorText(error) : null;
                  }}
                />
              </Card>
            </>
          ) : (
            <Card style={{ backgroundColor: theme.primarySoft }}>
              <Label color="primary">So funktioniert die Verwaltung</Label>
              <T size={14}>
                Bundesländer aktivieren Verbände, Verbände aktivieren Kreise und Vereine, Kreise geben Vereinsanfragen frei. Admins
                ernennst du für deine Ebene und die Ebenen darunter.
              </T>
            </Card>
          )
        }
      />
    </Screen>
  );
}
