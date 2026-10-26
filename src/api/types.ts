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
	sort_order: number;
	created_at: string;
	updated_at: string;
	completed_at: string | null;
	deleted_at: string | null;
	poc_name: string | null;
	poc_color: string | null;
	poc_status: PocStatus | null;
	parent_title: string | null;
	sub_total: number;
	sub_done: number;
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
}

export interface ItemList {
	items: Item[];
	done: Item[];
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
	hubspot_close_date: string | null;
	hubspot_synced_at: string | null;
	notes: string | null;
	sort_order: number;
	created_at: string;
	updated_at: string;
	closed_at: string | null;
	total: number;
	done: number;
	waiting: number;
	last_activity_at: string | null;
	next: Item | null;
}

export interface Counts {
	today: number;
	overdue: number;
	upcoming: number;
	followups: number;
	followups_due: number;
	tasks: number;
	trash: number;
	pocs: Pick<Poc, 'id' | 'name' | 'color' | 'status' | 'paused_until' | 'total' | 'done' | 'waiting'>[];
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

export interface Settings {
	fup_days: number;
	digest_time: string;
	shortcut: string;
	open_at_login: boolean;
	poc_template: string;
	hubspot_portal_id: string;
}

export interface Suggestions {
	companies: string[];
	contacts: { value: string; company: string | null }[];
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
	closeDate: string | null;
	url: string | null;
}
