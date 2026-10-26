// Región, importe, filtros y orden de las PoCs. Todo en el cliente: son decenas, no miles.

import { useState } from 'react';
import { pocAmount as sharedPocAmount, regionOf, sumByCurrency } from '../../shared/pocs.js';
import { fold } from '../../shared/quickparse.js';
import type { Poc } from '../api/types';
import { money } from './format';

export type Region = 'iberia' | 'latam' | 'none';

export const region = (country: string | null): Region => regionOf(country);
export const REGION_LABEL: Record<Region, string> = { iberia: 'Iberia', latam: 'LATAM', none: 'Sin país' };
export const REGIONS: Region[] = ['iberia', 'latam', 'none'];

const REGION_NAMES = (() => {
	try {
		return new Intl.DisplayNames(['es'], { type: 'region' });
	} catch {
		return null;
	}
})();
export const countryName = (cc: string) => REGION_NAMES?.of(cc) ?? cc;

export interface Amount {
	value: number;
	currency: string;
	source: 'hubspot' | 'manual';
}

/** El importe del deal de HubSpot si lo hay; si no, el que pusiste a mano. */
export const pocAmount = (p: Pick<Poc, 'hubspot_deal_id' | 'hubspot_amount' | 'hubspot_currency' | 'amount' | 'currency'>): Amount | null =>
	sharedPocAmount(p) as Amount | null;

export const formatAmount = (a: Amount | null) => (a ? money(a.value, a.currency) : null);

/** "47.500 € · 5.000 US$": sin mezclar monedas. */
export const formatSums = (sums: { currency: string; value: number }[]) => sums.map((x) => money(x.value, x.currency)).join(' · ') || null;
export const totalsByCurrency = (pocs: Poc[]) => formatSums(sumByCurrency(pocs));

export type StatusFilter = 'all' | 'active' | 'paused' | 'won' | 'lost';

export interface PocFilterState {
	q: string;
	status: StatusFilter;
	country: string;
	owner: string;
}

export const EMPTY_FILTERS: PocFilterState = { q: '', status: 'all', country: '', owner: '' };
export const hasFilters = (f: PocFilterState) => !!(f.q || f.status !== 'all' || f.country || f.owner);

export function filterPocs(pocs: Poc[], f: PocFilterState) {
	const q = fold(f.q.trim());
	return pocs.filter(
		(p) =>
			(f.status === 'all' || p.status === f.status) &&
			(!f.country || p.country === f.country) &&
			(!f.owner || (p.owner ?? '') === f.owner) &&
			(!q || fold(`${p.name} ${p.company ?? ''} ${p.owner ?? ''}`).includes(q)),
	);
}

export type SortKey = 'amount' | 'start' | 'created' | 'close' | 'progress' | 'activity' | 'name';
export interface PocSort {
	key: SortKey;
	dir: 'asc' | 'desc';
}

export const SORT_LABEL: Record<SortKey, string> = {
	amount: 'Importe',
	start: 'Fecha de inicio',
	created: 'Fecha de creación',
	close: 'Cierre previsto',
	progress: 'Progreso',
	activity: 'Último movimiento',
	name: 'Nombre',
};

/** Dirección natural al elegir cada orden (lo más grande / reciente primero, salvo nombre y cierre). */
export const DEFAULT_DIR: Record<SortKey, 'asc' | 'desc'> = {
	amount: 'desc',
	start: 'desc',
	created: 'desc',
	close: 'asc',
	progress: 'desc',
	activity: 'desc',
	name: 'asc',
};

const sortValue = (p: Poc, key: SortKey): number | string | null => {
	switch (key) {
		case 'amount':
			return pocAmount(p)?.value ?? null;
		case 'start':
			return p.start_date;
		case 'created':
			return p.created_at;
		case 'close':
			return p.hubspot_close_date;
		case 'progress':
			return p.total ? p.done / p.total : null;
		case 'activity':
			return p.last_activity_at;
		case 'name':
			return fold(p.name);
	}
};

/** Ordena dejando siempre al final lo que no tiene valor (sin importe, sin fecha…). */
export function sortPocs(pocs: Poc[], s: PocSort) {
	const sign = s.dir === 'asc' ? 1 : -1;
	return [...pocs].sort((a, b) => {
		const va = sortValue(a, s.key);
		const vb = sortValue(b, s.key);
		if (va == null && vb == null) return a.name.localeCompare(b.name);
		if (va == null) return 1;
		if (vb == null) return -1;
		return (va < vb ? -1 : va > vb ? 1 : 0) * sign || a.name.localeCompare(b.name);
	});
}

/** useState que se recuerda entre sesiones (si el almacenamiento falla, se queda en memoria). */
export function usePersistentState<T>(key: string, initial: T) {
	const [value, setValue] = useState<T>(() => {
		try {
			const raw = localStorage.getItem(key);
			return raw ? { ...initial, ...JSON.parse(raw) } : initial;
		} catch {
			return initial;
		}
	});
	const set = (v: T) => {
		setValue(v);
		try {
			localStorage.setItem(key, JSON.stringify(v));
		} catch {
			// Sin almacenamiento: no se recuerda.
		}
	};
	return [value, set] as const;
}
