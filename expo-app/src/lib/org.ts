import { useCallback, useEffect, useState } from 'react';

import { errorText, supabase } from './supabase';

export type UnitKind = 'bundesland' | 'verband' | 'kreis';

export const KIND_LABEL: Record<UnitKind, string> = { bundesland: 'Bundesland', verband: 'Verband', kreis: 'Kreis' };
export const CHILD_KIND: Record<UnitKind, UnitKind | null> = { bundesland: 'verband', verband: 'kreis', kreis: null };

export interface UnitRef {
  id: string;
  kind: UnitKind;
  name: string;
  short_name?: string | null;
  active?: boolean;
  parent?: string | null;
  children?: number;
}

export interface AdminScope {
  super: boolean;
  units: UnitRef[];
  bundeslaender: UnitRef[] | null;
  pending: number;
}

export interface PendingClub {
  club_id: string;
  name: string;
  city: string | null;
  postal: string | null;
  dfb: string | null;
  kreis: string | null;
  verband: string | null;
  requested_by: string | null;
  at: string;
}

export interface UnitDetail {
  unit: UnitRef & { chain_active: boolean; can_toggle: boolean };
  path: UnitRef[];
  children: (UnitRef & { admins: number; clubs: number })[];
  admins: { id: string; email: string; name: string; me: boolean; since: string }[];
  clubs: { id: string; name: string; city: string | null; status: string; active: boolean; kreis: string; teams: number }[] | null;
  can_toggle_clubs: boolean;
  pending: PendingClub[];
}

/** Bereiche, die die angemeldete Person verwaltet (Super-Admin, Bundesland, Verband, Kreis) */
export function useAdminScope() {
  const [scope, setScope] = useState<AdminScope | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.rpc('my_admin_scope');
    setScope((data as AdminScope) ?? null);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { scope, reload: load, hasAny: !!scope && (scope.super || scope.units.length > 0) };
}

export function useUnitDetail(id: string | undefined) {
  const [detail, setDetail] = useState<UnitDetail | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!id) return;
    const { data, error: e } = await supabase.rpc('org_unit_detail', { p_unit: id });
    if (e) return setError(errorText(e));
    setError('');
    setDetail(data as UnitDetail);
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);
  return { detail, error, reload: load };
}

/** Alle aktiven Bundesländer, Verbände und Kreise (für die Vereinsanmeldung) */
export function useOrgUnits() {
  const [units, setUnits] = useState<(UnitRef & { parent_id: string | null })[]>([]);
  useEffect(() => {
    supabase.rpc('list_org_units').then(({ data }) => setUnits((data as (UnitRef & { parent_id: string | null })[]) ?? []));
  }, []);
  return units;
}
