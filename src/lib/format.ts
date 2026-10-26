import { daysBetween, formatDay, parseDate } from '../../shared/dates.js';
import type { Category, Channel, Item } from '../api/types';

export const CATEGORY_LABEL: Record<Category, string> = { followup: 'Follow-up', task: 'Tarea', poc: 'PoC' };

export const CHANNEL_LABEL: Record<Channel, string> = {
	email: 'Email',
	whatsapp: 'WhatsApp',
	call: 'Llamada',
	linkedin: 'LinkedIn',
	meeting: 'Reunión',
};

export const CHANNELS = Object.keys(CHANNEL_LABEL) as Channel[];

/** 'CO' → 🇨🇴 */
export function flagEmoji(cc: string | null) {
	if (!cc || !/^[A-Z]{2}$/.test(cc)) return '';
	return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export const timeOf = (dt: string) => dt.slice(11, 16);

/** "hoy · 09:15", "ayer · 17:00", "vie 16 oct · 09:15" */
export function formatMoment(dt: string, today: string) {
	const diff = daysBetween(dt.slice(0, 10), today);
	const day = diff === 0 ? 'hoy' : diff === 1 ? 'ayer' : formatDay(dt.slice(0, 10), today);
	return `${day} · ${timeOf(dt)}`;
}

export function daysWaiting(item: Pick<Item, 'waiting_since'>, today: string) {
	return item.waiting_since ? Math.max(0, daysBetween(item.waiting_since.slice(0, 10), today)) : 0;
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const MONEY = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
export const money = (n: number | null) => (n == null ? null : MONEY.format(n));

export const longDate = (s: string) =>
	new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(parseDate(s));

export const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');
