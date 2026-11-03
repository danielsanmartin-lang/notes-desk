// Fechas en hora local, como cadenas: 'YYYY-MM-DD' para días y 'YYYY-MM-DDTHH:MM:SS' para instantes.
// Lo usan el servidor, el renderer y los tests, así que no depende de nada.

const pad = (n) => String(n).padStart(2, '0');
const DAY_MS = 86400000;

export const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const toDateTimeStr = (d) =>
	`${toDateStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/** 'YYYY-MM-DD' (o el principio de un 'YYYY-MM-DDTHH:MM:SS') → Date a medianoche local. */
export function parseDate(s) {
	const [y, m, d] = s.slice(0, 10).split('-').map(Number);
	return new Date(y, m - 1, d);
}

/** 'YYYY-MM-DDTHH:MM:SS' → Date local. */
export function parseDateTime(s) {
	const d = parseDate(s);
	const [h = 0, mi = 0, se = 0] = (s.slice(11) || '').split(':').map(Number);
	d.setHours(h, mi, se, 0);
	return d;
}

export function addDays(s, n) {
	const d = parseDate(s);
	d.setDate(d.getDate() + n);
	return toDateStr(d);
}

/** Días de a a b (b - a). Redondea para absorber los cambios de hora. */
export const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / DAY_MS);

/** Si cae en sábado o domingo, lo pasa al lunes: un follow-up no se manda en fin de semana. */
export function skipWeekend(s) {
	const dow = parseDate(s).getDay();
	if (dow === 6) return addDays(s, 2);
	if (dow === 0) return addDays(s, 1);
	return s;
}

/** n días laborables después de s (sin contar sábados ni domingos). */
export function addBusinessDays(s, n) {
	let d = s;
	for (let left = n; left > 0; ) {
		d = addDays(d, 1);
		if (parseDate(d).getDay() % 6 !== 0) left--;
	}
	return d;
}

/** Día de la semana ISO: lunes = 1 … domingo = 7. */
export const isoDow = (s) => ((parseDate(s).getDay() + 6) % 7) + 1;

/** Próximo día de la semana (ISO 1-7) estrictamente posterior a s. */
export function nextDow(s, dow) {
	const diff = (dow - isoDow(s) + 7) % 7 || 7;
	return addDays(s, diff);
}

export function isoWeek(s) {
	const d = parseDate(s);
	d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 3); // jueves de esa semana
	const year = d.getFullYear();
	const firstThu = new Date(year, 0, 4);
	firstThu.setDate(firstThu.getDate() - ((firstThu.getDay() + 6) % 7) + 3);
	const week = 1 + Math.round((d - firstThu) / (7 * DAY_MS));
	return `${year}-W${pad(week)}`;
}

/** '2026-W44' → { start: '2026-10-26', end: '2026-11-01' } (lunes a domingo). */
export function weekRange(week) {
	const [y, n] = week.split('-W').map(Number);
	const monday = new Date(y, 0, 4);
	monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + (n - 1) * 7);
	const start = toDateStr(monday);
	return { start, end: addDays(start, 6) };
}

export const isValidWeek = (w) => /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(w);
export const isValidDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseDate(s).getTime());
export const isValidDateTime = (s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s);

const fmt = (opts) => new Intl.DateTimeFormat('es-ES', opts);
const WEEKDAY = fmt({ weekday: 'long' });
const SHORT = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
const SHORT_YEAR = fmt({ day: 'numeric', month: 'short', year: 'numeric' });
const DAY_MONTH = fmt({ day: 'numeric', month: 'short' });

const clean = (s) => s.replace(/\./g, '');

/** "vie 30 oct", o "30 oct 2027" si no es de este año. */
export function formatDay(s, today) {
	const d = parseDate(s);
	if (today && d.getFullYear() !== parseDate(today).getFullYear()) return clean(SHORT_YEAR.format(d));
	return clean(SHORT.format(d)).replace(',', '');
}

export const formatDayMonth = (s) => clean(DAY_MONTH.format(parseDate(s)));

/** Etiqueta para una fecha de vencimiento: Hoy, Mañana, Ayer, "viernes", "hace 3 días", "vie 30 oct". */
export function relativeDay(s, today) {
	const diff = daysBetween(today, s);
	if (diff === 0) return 'Hoy';
	if (diff === 1) return 'Mañana';
	if (diff === -1) return 'Ayer';
	if (diff > 1 && diff < 7) return WEEKDAY.format(parseDate(s));
	if (diff < -1 && diff > -15) return `hace ${-diff} días`;
	return formatDay(s, today);
}

/** "W44 · 26 oct – 1 nov" */
export function weekLabel(week) {
	const { start, end } = weekRange(week);
	return `W${week.split('-W')[1]} · ${formatDayMonth(start)} – ${formatDayMonth(end)}`;
}

/** Color del contador de espera: verde los primeros días, ámbar después, rojo cuando ya es largo. */
export function waitingLevel(days) {
	if (days <= 3) return 'ok';
	if (days <= 7) return 'warn';
	return 'late';
}
