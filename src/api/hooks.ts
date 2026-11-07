import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { toDateStr } from '../../shared/dates.js';
import { api, qs, upload } from './client';
import type {
	AccountDetail,
	AccountSummary,
	Activity,
	Counts,
	HubspotDeal,
	Item,
	ItemDetail,
	ItemList,
	Meta,
	Poc,
	PocAdmin,
	RfpDeadline,
	RfpDocument,
	Settings,
	StalePoc,
	Stats,
	Suggestions,
	WeekDetail,
	WeekSummary,
} from './types';

export type ListView = 'today' | 'upcoming' | 'followups' | 'tasks' | 'poc' | 'trash';

export const useItems = (view: ListView, params: { poc?: number; includePoc?: boolean } = {}) =>
	useQuery({
		queryKey: ['items', view, params],
		queryFn: () => api<ItemList>(`/items?${qs({ view, poc: params.poc, includePoc: params.includePoc })}`),
	});

export const useItem = (id: number | null) =>
	useQuery({ queryKey: ['item', id], queryFn: () => api<ItemDetail>(`/items/${id}`), enabled: id != null, retry: false });

export const useCounts = () => useQuery({ queryKey: ['counts'], queryFn: () => api<Counts>('/counts') });
export const usePocs = () => useQuery({ queryKey: ['pocs'], queryFn: () => api<Poc[]>('/pocs') });
export const usePoc = (id: number) =>
	useQuery({ queryKey: ['poc', id], queryFn: () => api<{ poc: Poc; contacts: PocAdmin[]; activity: Activity[]; account_items: Item[] }>(`/pocs/${id}`), retry: false });
export const useRfpDeadlines = () => useQuery({ queryKey: ['rfp-deadlines'], queryFn: () => api<RfpDeadline[]>('/rfps/deadlines') });
/** Documentación de una RFP. Se refresca al volver a la ventana: lo que se deje en la carpeta desde Finder también sale. */
export const useDocuments = (pocId: number, enabled = true) =>
	useQuery({
		queryKey: ['documents', pocId],
		queryFn: () => api<RfpDocument[]>(`/pocs/${pocId}/documents`),
		enabled,
		staleTime: 0,
	});
export const useStalePocs = () => useQuery({ queryKey: ['stale-pocs'], queryFn: () => api<StalePoc[]>('/pocs/stale') });
export const useAccounts = () => useQuery({ queryKey: ['accounts'], queryFn: () => api<AccountSummary[]>('/accounts') });
export const useAccount = (name: string) =>
	useQuery({
		queryKey: ['account', name],
		queryFn: () => api<AccountDetail>(`/accounts/${encodeURIComponent(name)}`),
		retry: false,
	});
export const useStats = (weeks: number, region: string) =>
	useQuery({
		queryKey: ['stats', weeks, region],
		queryFn: () => api<Stats>(`/stats?${qs({ weeks, region: region === 'all' ? undefined : region })}`),
		placeholderData: (prev) => prev,
	});
export const useWeeks = () => useQuery({ queryKey: ['weeks'], queryFn: () => api<WeekSummary[]>('/weeks') });
export const useWeek = (week: string | undefined) =>
	useQuery({ queryKey: ['week', week], queryFn: () => api<WeekDetail>(`/weeks/${week}`), enabled: !!week });
export const useSearch = (q: string) =>
	useQuery({
		queryKey: ['search', q],
		queryFn: () => api<{ items: Item[]; pocs: Poc[]; accounts: string[] }>(`/search?${qs({ q })}`),
		enabled: q.trim().length > 0,
		placeholderData: (prev) => prev,
	});
/** Buscador del Inicio. Va bajo 'items' para refrescarse con cada cambio en las tareas. */
export const useSearchItems = (q: string) =>
	useQuery({
		queryKey: ['items', 'search', q],
		queryFn: () => api<ItemList>(`/search/items?${qs({ q })}`),
		enabled: q.trim().length > 0,
		placeholderData: (prev) => prev,
	});
export const useSuggestions = () =>
	useQuery({ queryKey: ['suggestions'], queryFn: () => api<Suggestions>('/suggestions'), staleTime: 30_000 });
export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/settings') });
export const useMeta = () => useQuery({ queryKey: ['meta'], queryFn: () => api<Meta>('/meta'), refetchInterval: 60_000 });
export const useHubspotStatus = () =>
	useQuery({ queryKey: ['hubspot-status'], queryFn: () => api<{ connected: boolean }>('/hubspot/status'), staleTime: 60_000 });
export const useHubspotSearch = (q: string, enabled: boolean) =>
	useQuery({
		queryKey: ['hubspot-search', q],
		queryFn: () => api<HubspotDeal[]>(`/hubspot/search?${qs({ q })}`),
		enabled,
		retry: false,
		placeholderData: (prev) => prev,
	});

/** Hoy según el servidor (cambia a medianoche aunque la app siga abierta). */
export function useToday() {
	const { data } = useMeta();
	return data?.today ?? toDateStr(new Date());
}

type ItemInput = Partial<Omit<Item, 'flagged'>> & { flagged?: boolean };

/** Todas las escrituras. Tras cada una se refresca todo (la app es pequeña) y los errores salen en un toast. */
export function useActions() {
	const qc = useQueryClient();
	return useMemo(() => {
		const run = async <T>(p: Promise<T>): Promise<T> => {
			try {
				return await p;
			} catch (e) {
				toast.error((e as Error).message);
				throw e;
			} finally {
				qc.invalidateQueries();
			}
		};
		const post = <T>(path: string, body?: unknown) => run(api<T>(path, { method: 'POST', body: body ?? {} }));
		return {
			create: (data: ItemInput) => post<Item>('/items', data),
			update: (id: number, data: ItemInput) => run(api<Item>(`/items/${id}`, { method: 'PATCH', body: data })),
			complete: (id: number) => post<Item>(`/items/${id}/complete`),
			reopen: (id: number) => post<Item>(`/items/${id}/reopen`),
			touch: (id: number, body: { channel?: string | null; body?: string; next_date?: string | null }) =>
				post<{ item: Item; activity_id: number }>(`/items/${id}/touch`, body),
			reply: (id: number, body: { body?: string; complete?: boolean }) =>
				post<{ item: Item; activity_id: number }>(`/items/${id}/reply`, body),
			note: (id: number, body: string) => post<Activity>(`/items/${id}/note`, { body }),
			/** Nota para el historial de una PoC o, sin PoC, de una empresa. */
			addNote: (data: { body: string; poc_id?: number | null; company?: string | null }) => post<Activity>('/notes', data),
			remove: (id: number) => post<Item>(`/items/${id}/delete`),
			restore: (id: number) => post<Item>(`/items/${id}/restore`),
			purge: (id: number) => run(api(`/items/${id}`, { method: 'DELETE' })),
			emptyTrash: () => post<{ deleted: number }>('/trash/empty'),
			reorder: (ids: number[]) => post('/items/reorder', { ids }),
			deleteActivity: (id: number) => run(api(`/activity/${id}`, { method: 'DELETE' })),
			createPoc: (data: Partial<Poc> & { hubspot?: string; use_template?: boolean }) => post<Poc>('/pocs', data),
			updatePoc: (id: number, data: Partial<Poc> & { hubspot?: string | null }) =>
				run(api<Poc>(`/pocs/${id}`, { method: 'PATCH', body: data })),
			setPocStatus: (id: number, body: { status: string; paused_until?: string | null; body?: string; date?: string | null }) =>
				post<Poc>(`/pocs/${id}/status`, body),
			deletePoc: (id: number) => run(api(`/pocs/${id}`, { method: 'DELETE' })),
			pocNote: (id: number, body: string) => post<Activity>(`/pocs/${id}/note`, { body }),
			snoozeStale: (id: number, until: string | null) => post(`/pocs/${id}/stale-snooze`, { until }),
			addAdmin: (pocId: number, data: Partial<PocAdmin>) => post<PocAdmin>(`/pocs/${pocId}/admins`, data),
			updateAdmin: (id: number, data: Partial<PocAdmin>) =>
				run(api<PocAdmin>(`/poc-admins/${id}`, { method: 'PATCH', body: data })),
			deleteAdmin: (id: number) => run(api(`/poc-admins/${id}`, { method: 'DELETE' })),
			syncHubspot: (id: number) => post<Poc>(`/pocs/${id}/hubspot/sync`),
			/** Sube varios archivos a la documentación de una RFP, uno detrás de otro. */
			uploadDocuments: (pocId: number, files: File[]) =>
				run(
					(async () => {
						const out: RfpDocument[] = [];
						for (const f of files) out.push(await upload<RfpDocument>(`/pocs/${pocId}/documents`, f));
						return out;
					})(),
				),
			deleteDocument: (pocId: number, name: string) =>
				run(api(`/pocs/${pocId}/documents/${encodeURIComponent(name)}`, { method: 'DELETE' })),
			setAccountHubspot: (name: string, hubspot: string | null) =>
				run(api(`/accounts/${encodeURIComponent(name)}/hubspot`, { method: 'PUT', body: { hubspot } })),
			saveSettings: (patch: Partial<Settings>) => run(api<Settings>('/settings', { method: 'PATCH', body: patch })),
		};
	}, [qc]);
}
