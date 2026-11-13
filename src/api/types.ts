export type Category = 'followup' | 'task' | 'poc';
export type Channel = 'email' | 'whatsapp' | 'call' | 'linkedin' | 'meeting';
export type ItemState = 'todo' | 'waiting' | 'done';
/** finished: la prueba terminó y falta la decisión del cliente (luego pasa a ganada o perdida). */
export type PocStatus = 'active' | 'paused' | 'finished' | 'won' | 'lost';
/** Una PoC o una RFP: comparten tabla, tareas, contactos e historial. */
export type PocKind = 'poc' | 'rfp';
/** Etapa de una RFP (sale de status, submitted_at y close_reason; ver shared/pocs.js). */
export type RfpStage = 'preparing' | 'submitted' | 'won' | 'lost' | 'declined';

export interface Item {
	id: number;
	category: Category;
	poc_id: number | null;
	parent_id: number | null;
	title: string;
	notes: string | null;
	company: string | null;
	contact: string | null;
	channel: Channel | null;
	state: ItemState;
	due_date: string | null;
	remind_at: string | null;
	notified_at: string | null;
	waiting_since: string | null;
	touch_count: number;
	last_touch_at: string | null;
	message_template: string | null;
	flagged: boolean;
	/** En una PoC con partner: si va al partner. NULL = al cliente. */
	audience: 'client' | 'partner' | null;
	sort_order: number;
	created_at: string;
	updated_at: string;
	completed_at: string | null;
	deleted_at: string | null;
	poc_name: string | null;
	poc_color: string | null;
	poc_status: PocStatus | null;
	/** Si su proyecto es una PoC o una RFP. */
	poc_kind: PocKind | null;
	parent_title: string | null;
	/** Enlace a la empresa en HubSpot de la cuenta de la tarea (su empresa o la de su PoC). */
	account_hubspot_url: string | null;
	/** Solo en el buscador: trozo de nota o del historial donde aparece lo buscado. */
	snippet?: string | null;
	sub_total: number;
	sub_done: number;
	/** En las listas: sus subtareas, para enseñarlas debajo con su contador. */
	subs?: Item[];
}

export type ActivityKind =
	| 'created'
	| 'touch'
	| 'reply'
	| 'note'
	| 'done'
	| 'rescheduled'
	| 'paused'
	| 'resumed'
	| 'finished'
	| 'won'
	| 'lost'
	| 'submitted'
	| 'declined';

export interface Activity {
	id: number;
	item_id: number | null;
	poc_id: number | null;
	kind: ActivityKind;
	channel: Channel | null;
	body: string | null;
	meta: { from?: string; to?: string; until?: string | null; next_date?: string | null } | null;
	occurred_at: string;
	/** Notas sueltas de una empresa (sin tarea ni PoC): a qué cuenta van. */
	company?: string | null;
	item_title?: string | null;
	item_parent_id?: number | null;
	poc_name?: string | null;
	/** En una PoC: viene de una tarea de su cuenta que no está metida en la PoC. */
	from_account?: boolean;
	/** Si lo que cambia de estado es una PoC o una RFP (para decir «RFP adjudicada» y no «PoC ganada»). */
	poc_kind?: PocKind | null;
}

export interface ItemList {
	items: Item[];
	done: Item[];
	/** Solo en Hoy: lo que no tiene fecha y te toca a ti. */
	undated?: Item[];
}

export interface ItemDetail {
	item: Item;
	subtasks: Item[];
	activity: Activity[];
}

export interface Poc {
	id: number;
	kind: PocKind;
	name: string;
	company: string | null;
	country: string | null;
	status: PocStatus;
	paused_until: string | null;
	color: string | null;
	hubspot_deal_id: string | null;
	hubspot_url: string | null;
	hubspot_name: string | null;
	hubspot_stage: string | null;
	hubspot_amount: number | null;
	hubspot_currency: string | null;
	hubspot_close_date: string | null;
	hubspot_synced_at: string | null;
	notes: string | null;
	sort_order: number;
	created_at: string;
	updated_at: string;
	closed_at: string | null;
	/** Cuándo terminó la prueba (se conserva al ganarla o perderla). */
	finished_at: string | null;
	owner: string | null;
	partner: string | null;
	start_date: string | null;
	amount: number | null;
	currency: string | null;
	/** Solo RFPs: fechas clave, portal de licitación, nº de expediente y cómo terminó. */
	submission_deadline: string | null;
	questions_deadline: string | null;
	award_date: string | null;
	submitted_at: string | null;
	portal_url: string | null;
	tender_ref: string | null;
	close_reason: 'declined' | null;
	admin_count: number;
	/** Desde cuándo espera respuesta lo más antiguo del partner y del cliente (PoC y su cuenta). */
	partner_waiting_since: string | null;
	client_waiting_since: string | null;
	total: number;
	done: number;
	waiting: number;
	last_activity_at: string | null;
	next: Item | null;
}

export type ContactKind = 'main' | 'admin' | 'partner';

/** Persona de una PoC (la tabla se llama poc_admins por historia; kind dice qué es). */
export interface PocAdmin {
	id: number;
	poc_id: number;
	kind: ContactKind;
	name: string;
	email: string | null;
	role: string | null;
	sort_order: number;
	created_at: string;
}

export interface Counts {
	today: number;
	undated: number;
	overdue: number;
	upcoming: number;
	followups: number;
	followups_due: number;
	tasks: number;
	trash: number;
	pocs: Pick<
		Poc,
		| 'id'
		| 'kind'
		| 'name'
		| 'color'
		| 'status'
		| 'paused_until'
		| 'country'
		| 'total'
		| 'done'
		| 'waiting'
		| 'submitted_at'
		| 'submission_deadline'
		| 'close_reason'
	>[];
}

export interface WeekSummary {
	week: string;
	done: number;
	touches: number;
	replies: number;
}

export interface WeekLogEntry {
	week: string;
	id: number;
	kind: ActivityKind;
	channel: Channel | null;
	body: string | null;
	occurred_at: string;
	item_id: number | null;
	title: string | null;
	category: Category | null;
	company: string | null;
	contact: string | null;
	parent_id: number | null;
	poc_id: number | null;
	poc_name: string | null;
	poc_kind: PocKind | null;
}

export interface WeekDetail {
	week: string;
	start: string;
	end: string;
	done: Item[];
	touches: WeekLogEntry[];
	replies: WeekLogEntry[];
	poc_events: WeekLogEntry[];
}

export type Appearance = 'system' | 'light' | 'dark';

export interface Settings {
	fup_days: number;
	digest_time: string;
	shortcut: string;
	open_at_login: boolean;
	poc_template: string;
	rfp_template: string;
	hubspot_portal_id: string;
	appearance: Appearance;
	theme: string;
}

export interface AccountSummary {
	key: string;
	name: string;
	followups: number;
	waiting: number;
	tasks: number;
	poc_items: number;
	overdue: number;
	next_due: string | null;
	pocs: Pick<Poc, 'id' | 'kind' | 'name' | 'color' | 'status'>[];
	last_activity_at: string | null;
	touches_30d: number;
	hubspot_company_id: string | null;
	hubspot_url: string | null;
}

export interface AccountDetail extends AccountSummary {
	open: Item[];
	done: Item[];
	pocs: Poc[];
	contacts: {
		name: string;
		email: string | null;
		role: string | null;
		poc: string | null;
		kind: ContactKind | null;
		partner: string | null;
		tasks: number;
	}[];
	activity: Activity[];
	stats: { touches_30d: number; replies_30d: number; avg_response_days: number | null };
}

export type RegionKey = 'iberia' | 'latam' | 'none';
export interface MoneySum {
	currency: string;
	value: number;
}
export interface PocSummary {
	active: number;
	paused: number;
	finished: number;
	won: number;
	lost: number;
	win_rate: number | null;
	/** Duración media de la prueba en las PoCs terminadas (finalizadas, ganadas o perdidas), y en cuántas se basa. */
	avg_days: number | null;
	ended: number;
	amounts: MoneySum[];
	won_amounts: MoneySum[];
}

export interface Stats {
	weeks: number;
	region: 'all' | 'iberia' | 'latam';
	activity_by_region: { region: RegionKey; touches: number; done: number; replies: number }[];
	regions: (PocSummary & { region: RegionKey })[];
	countries: { country: string; region: RegionKey; n: number; amounts: MoneySum[] }[];
	poc_days: { id: number; name: string; color: string | null; country: string | null; region: RegionKey; days: number }[];
	closes: { month: string; iberia: number; latam: number; none: number; amounts: MoneySum[] }[];
	closes_earlier: number;
	from: string;
	to: string;
	totals: { done: number; touches: number; replies: number };
	previous: { done: number; touches: number; replies: number };
	response: { touched: number; answered: number; rate: number | null; avg_days: number | null };
	now: { mine: number; waiting: number; overdue: number };
	weekly: { week: string; done: number; touches: number; replies: number }[];
	waiting_buckets: { label: string; level: 'ok' | 'warn' | 'late' | 'cold'; n: number }[];
	channels: { channel: Channel | 'none'; n: number }[];
	accounts: { name: string; touches: number; done: number; replies: number; total: number }[];
	pocs: PocSummary;
}

/** PoC activa sin nada nuevo desde hace `days` días (en ella o en su cuenta). */
export interface StalePoc {
	id: number;
	name: string;
	color: string | null;
	company: string | null;
	last_change_at: string | null;
	/** Fecha desde la que se cuenta: el último cambio, su creación o su fecha de inicio. */
	since: string;
	days: number;
}

/** Fecha límite de una RFP sin presentar que vence en los próximos días (o ya vencida, si es la entrega). */
export interface RfpDeadline {
	id: number;
	name: string;
	color: string | null;
	company: string | null;
	what: 'questions' | 'submission';
	date: string;
	/** Días que faltan (negativo: vencida). */
	days: number;
}

/** Un archivo adjunto a una PoC o RFP. */
export interface PocDocument {
	name: string;
	size: number;
	modified_at: string;
	/** Cuándo se adjuntó (fecha de creación del archivo en su carpeta). */
	added_at: string;
	/** Si es un enlace (un .webloc o .url de la carpeta): adónde lleva. */
	url?: string;
}

export interface Suggestions {
	companies: string[];
	contacts: { value: string; company: string | null }[];
	owners: string[];
	partners: string[];
}

export interface Meta {
	dbPath?: string;
	backupsDir?: string;
	version?: string;
	dev?: boolean;
	today: string;
}

export interface HubspotDeal {
	id: string;
	name: string | null;
	stage: string | null;
	amount: number | null;
	currency: string | null;
	closeDate: string | null;
	url: string | null;
}
