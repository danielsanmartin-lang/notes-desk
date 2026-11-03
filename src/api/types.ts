export type Category = 'followup' | 'task' | 'poc';
export type Channel = 'email' | 'whatsapp' | 'call' | 'linkedin' | 'meeting';
export type ItemState = 'todo' | 'waiting' | 'done';
export type PocStatus = 'active' | 'paused' | 'won' | 'lost';

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
	| 'won'
	| 'lost';

export interface Activity {
	id: number;
	item_id: number | null;
	poc_id: number | null;
	kind: ActivityKind;
	channel: Channel | null;
	body: string | null;
	meta: { from?: string; to?: string; until?: string | null; next_date?: string | null } | null;
	occurred_at: string;
	item_title?: string | null;
	item_parent_id?: number | null;
	poc_name?: string | null;
	/** En una PoC: viene de una tarea de su cuenta que no está metida en la PoC. */
	from_account?: boolean;
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
	owner: string | null;
	partner: string | null;
	start_date: string | null;
	amount: number | null;
	currency: string | null;
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
	pocs: Pick<Poc, 'id' | 'name' | 'color' | 'status' | 'paused_until' | 'country' | 'total' | 'done' | 'waiting'>[];
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
	pocs: Pick<Poc, 'id' | 'name' | 'color' | 'status'>[];
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
	won: number;
	lost: number;
	win_rate: number | null;
	avg_days: number | null;
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
