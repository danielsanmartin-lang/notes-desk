import { zd } from '../lib/bridge';

const token = zd?.token ?? null;
// Cada ventana se identifica para no refrescarse dos veces con sus propios cambios.
export const clientId = Math.random().toString(36).slice(2);

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
	const res = await fetch(`/api${path}`, {
		method: opts.method ?? 'GET',
		headers: {
			'Content-Type': 'application/json',
			'X-ZD-Client': clientId,
			...(token ? { 'X-ZD-Token': token } : {}),
		},
		body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
	return data as T;
}

/** Sube un archivo tal cual (sin JSON ni cargarlo en memoria): el servidor lo guarda en streaming. */
export async function upload<T>(path: string, file: File): Promise<T> {
	const res = await fetch(`/api${path}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/octet-stream',
			'X-Filename': encodeURIComponent(file.name),
			'X-ZD-Client': clientId,
			...(token ? { 'X-ZD-Token': token } : {}),
		},
		body: file,
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
	return data as T;
}

/** URL de la API con el token de la sesión (para abrir un archivo en el navegador). */
export const apiUrl = (path: string) => `/api${path}${token ? `${path.includes('?') ? '&' : '?'}t=${encodeURIComponent(token)}` : ''}`;

/** Avisa cuando otra ventana (o el proceso principal) cambia algo. */
export function subscribe(onChange: () => void) {
	const es = new EventSource(`/api/events${token ? `?t=${encodeURIComponent(token)}` : ''}`);
	es.addEventListener('change', (ev) => {
		try {
			if (JSON.parse((ev as MessageEvent).data).client !== clientId) onChange();
		} catch {
			onChange();
		}
	});
	return () => es.close();
}

export const qs = (params: Record<string, string | number | boolean | undefined | null>) =>
	new URLSearchParams(
		Object.entries(params)
			.filter(([, v]) => v !== undefined && v !== null && v !== false)
			.map(([k, v]) => [k, v === true ? '1' : String(v)]),
	).toString();
