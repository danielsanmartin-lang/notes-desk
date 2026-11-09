// Región, importe, filtros y orden de las PoCs y RFPs. Todo en el cliente: son decenas, no miles.

import { useState } from 'react';
import { pocAmount as sharedPocAmount, regionOf, rfpStage as sharedRfpStage, sumByCurrency } from '../../shared/pocs.js';
import { daysBetween } from '../../shared/dates.js';
import { fold } from '../../shared/quickparse.js';
import type { Item, Poc, PocKind, RfpStage } from '../api/types';
import { money } from './format';

export type Region = 'iberia' | 'latam' | 'none';

/** Cómo se llama cada tipo en la interfaz. */
export const KIND_LABEL: Record<PocKind, string> = { poc: 'PoC', rfp: 'RFP' };
export const kindLabel = (kind: PocKind | null | undefined) => KIND_LABEL[kind ?? 'poc'];

/** Etapa de una RFP: en preparación, presentada, adjudicada, perdida o descartada. */
export const rfpStage = (p: Pick<Poc, 'status' | 'submitted_at' | 'close_reason'>): RfpStage => sharedRfpStage(p) as RfpStage;
export const RFP_STAGE_LABEL: Record<RfpStage, string> = {
	preparing: 'En preparación',
	submitted: 'Presentada',
	won: 'Adjudicada',
	lost: 'Perdida',
	declined: 'Descartada',
};

/** En curso: activa, en pausa o finalizada (la prueba terminó, pero el cliente aún no ha decidido). */
export const isOpenPoc = (p: Pick<Poc, 'status'>) => p.status === 'active' || p.status === 'paused' || p.status === 'finished';

/** Concluida: ganada o perdida (en una RFP, también descartada, que se guarda como perdida). */
export const isClosed = (p: Pick<Poc, 'status'>) => p.status === 'won' || p.status === 'lost';

/**
 * Cuenta atrás de la entrega de una RFP mientras no esté presentada: «Entrega en 5 días», «Entrega hoy»,
 * «Entrega vencida hace 2 días». Null si no tiene fecha, ya se presentó o está concluida.
 */
export function deadlineInfo(p: Pick<Poc, 'submission_deadline' | 'submitted_at' | 'status'>, today: string) {
	if (!p.submission_deadline || p.submitted_at || p.status !== 'active') return null;
	const d = daysBetween(today, p.submission_deadline);
	const label =
		d < 0
			? `Entrega vencida hace ${-d} ${d === -1 ? 'día' : 'días'}`
			: d === 0
				? 'Entrega hoy'
				: d === 1
					? 'Entrega mañana'
					: `Entrega en ${d} días`;
	const tone: 'danger' | 'warn' | 'neutral' = d <= 0 ? 'danger' : d <= 7 ? 'warn' : 'neutral';
	return { days: d, label, short: d < 0 ? 'Vencida' : d === 0 ? 'Hoy' : `${d} d`, tone };
}

export const region = (country: string | null): Region => regionOf(country);
/** Divisa por defecto según el país: euros en Iberia, dólares en LATAM. */
export const defaultCurrency = (country: string | null) => (region(country) === 'latam' ? 'USD' : 'EUR');

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

/**
 * Cuántos días lleva abierta: desde su fecha de inicio (o desde que se creó, si no tiene). Si aún no ha
 * empezado, cuánto falta; si está finalizada o concluida, cuánto duró la prueba.
 */
export function openSince(p: Pick<Poc, 'start_date' | 'created_at' | 'status' | 'closed_at' | 'finished_at'>, today: string) {
	const start = p.start_date ?? p.created_at.slice(0, 10);
	// Finalizada: la prueba duró hasta que terminó, aunque el cliente aún no haya decidido.
	const end = p.status === 'finished' ? p.finished_at : p.status === 'won' || p.status === 'lost' ? (p.finished_at ?? p.closed_at) : null;
	if (end) {
		const d = Math.max(0, daysBetween(start, end.slice(0, 10)));
		return { days: d, label: `${d} ${d === 1 ? 'día' : 'días'} de PoC`, future: false };
	}
	const d = daysBetween(start, today);
	if (d < 0) return { days: null, label: d === -1 ? 'Empieza mañana' : `Empieza en ${-d} días`, future: true };
	return { days: d, label: d === 0 ? 'Abierta hoy' : `${d} ${d === 1 ? 'día abierta' : 'días abierta'}`, future: false };
}

/**
 * Las PoCs vivas (activas o finalizadas y, con `paused`, también en pausa) de una cuenta, sin acentos ni mayúsculas.
 * Con `kind`, solo las de ese tipo (PoC o RFP).
 */
export function pocsOfAccount<P extends Pick<Poc, 'company' | 'status' | 'kind'>>(
	pocs: P[],
	company: string | null | undefined,
	{ paused = false, kind }: { paused?: boolean; kind?: PocKind } = {},
) {
	const key = fold(company ?? '').trim();
	if (!key) return [];
	return pocs.filter(
		(p) => (!kind || p.kind === kind) && (p.status === 'active' || p.status === 'finished' || (paused && p.status === 'paused')) && fold(p.company ?? '').trim() === key,
	);
}

/** El partner con el que va una tarea: el de su PoC o, si es de la cuenta, el de una PoC viva de esa cuenta. */
export function partnerOf(pocs: Poc[], item: Pick<Item, 'poc_id' | 'company'>) {
	if (item.poc_id) return pocs.find((p) => p.id === item.poc_id)?.partner ?? null;
	return pocsOfAccount(pocs, item.company, { paused: true }).find((p) => p.partner)?.partner ?? null;
}

/** Estado de una PoC o etapa de una RFP. */
export type StatusFilter = 'all' | 'active' | 'paused' | 'finished' | 'won' | 'lost' | 'preparing' | 'submitted' | 'declined';

/** Estado con el que se filtra: el de la PoC o la etapa de la RFP (una descartada no es «perdida»). */
const stateOf = (p: Poc): StatusFilter => (p.kind === 'rfp' ? rfpStage(p) : p.status);

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
			(f.status === 'all' || stateOf(p) === f.status) &&
			(!f.country || p.country === f.country) &&
			(!f.owner || (p.owner ?? '') === f.owner) &&
			(!q || fold(`${p.name} ${p.company ?? ''} ${p.partner ?? ''} ${p.owner ?? ''} ${p.tender_ref ?? ''}`).includes(q)),
	);
}

export type SortKey = 'amount' | 'start' | 'deadline' | 'award' | 'created' | 'close' | 'progress' | 'activity' | 'name';
export interface PocSort {
	key: SortKey;
	dir: 'asc' | 'desc';
}

export const SORT_LABEL: Record<SortKey, string> = {
	amount: 'Importe',
	start: 'Fecha de inicio',
	deadline: 'Fecha de entrega',
	award: 'Adjudicación prevista',
	created: 'Fecha de creación',
	close: 'Cierre previsto',
	progress: 'Progreso',
	activity: 'Último movimiento',
	name: 'Nombre',
};

/** Órdenes que tienen sentido en cada tablero. */
export const SORTS: Record<PocKind, SortKey[]> = {
	poc: ['amount', 'start', 'created', 'close', 'progress', 'activity', 'name'],
	rfp: ['deadline', 'amount', 'award', 'created', 'close', 'progress', 'activity', 'name'],
};

/** Dirección natural al elegir cada orden (lo más grande / reciente primero, salvo nombre y cierre). */
export const DEFAULT_DIR: Record<SortKey, 'asc' | 'desc'> = {
	amount: 'desc',
	start: 'desc',
	deadline: 'asc',
	award: 'asc',
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
		case 'deadline':
			return p.submission_deadline;
		case 'award':
			return p.award_date;
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
