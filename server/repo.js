// Lógica de negocio sobre la base de datos: listas, flujo de follow-ups (toques y respuestas),
// PoCs, semanas, búsqueda y ajustes. Todo síncrono (better-sqlite3); el reloj se inyecta para los tests.

import {
	addDays,
	daysBetween,
	isoWeek,
	isValidDate,
	isValidDateTime,
	isValidWeek,
	parseDate,
	skipWeekend,
	toDateStr,
	toDateTimeStr,
	weekRange,
} from '../shared/dates.js';
import { parseHubspotRef } from '../shared/hubspot.js';
import { isCountry } from '../shared/countries.js';
import { regionOf, sumByCurrency } from '../shared/pocs.js';

export class HttpError extends Error {
	constructor(status, message) {
		super(message);
		this.status = status;
	}
}

const bad = (message) => new HttpError(400, message);
const notFound = (what) => new HttpError(404, `${what} no existe`);

export const CATEGORIES = ['followup', 'task', 'poc'];
export const CHANNELS = ['email', 'whatsapp', 'call', 'linkedin', 'meeting'];
export const POC_STATUSES = ['active', 'paused', 'won', 'lost'];
export const POC_COLORS = ['#142CD1', '#1D9E75', '#D85A30', '#7F77DD', '#D4537E', '#BA7517', '#0E9AA7', '#639922'];

export const DEFAULT_SETTINGS = {
	fup_days: 3,
	digest_time: '09:00',
	shortcut: 'Alt+Space',
	open_at_login: false,
	poc_template: [
		'Kickoff con el cliente',
		'Configurar el entorno de la PoC',
		'Lanzar la PoC',
		'Revisar resultados con el cliente',
		'Enviar propuesta',
	].join('\n'),
	digest_last: '',
	hubspot_portal_id: '',
};

// Campos que guarda un toque o una respuesta para poder deshacerlos.
const PREV_FIELDS = ['state', 'due_date', 'waiting_since', 'touch_count', 'last_touch_at', 'channel', 'completed_at'];

const ITEM_SELECT = `
	SELECT i.*, p.name AS poc_name, p.color AS poc_color, p.status AS poc_status,
	       par.title AS parent_title,
	       (SELECT COUNT(*) FROM items s WHERE s.parent_id = i.id AND s.deleted_at IS NULL) AS sub_total,
	       (SELECT COUNT(*) FROM items s WHERE s.parent_id = i.id AND s.deleted_at IS NULL AND s.state = 'done') AS sub_done
	FROM items i
	LEFT JOIN pocs  p   ON p.id = i.poc_id
	LEFT JOIN items par ON par.id = i.parent_id`;

// Visible: no está en la papelera, y si es subtarea, su tarea madre tampoco (ni está completada).
const VISIBLE = `i.deleted_at IS NULL AND (par.id IS NULL OR (par.deleted_at IS NULL AND par.state <> 'done'))`;
// Las tareas de una PoC pausada, ganada o perdida desaparecen de Hoy y de Próximos.
const ACTIVE_POC = `(p.id IS NULL OR p.status = 'active')`;
const OPEN = `i.state <> 'done'`;
// Una tarea con subtareas abiertas cede su contador (fecha, espera, toques) a cada subtarea: en Hoy y
// Próximos salen las subtareas, no la tarea madre.
const HAS_OPEN_SUBS = `EXISTS (SELECT 1 FROM items s WHERE s.parent_id = i.id AND s.deleted_at IS NULL AND s.state <> 'done')`;
const TODAY_COND = `${VISIBLE} AND ${ACTIVE_POC} AND ${OPEN}
	AND ((i.due_date IS NOT NULL AND i.due_date <= @today AND NOT ${HAS_OPEN_SUBS}) OR (i.flagged = 1 AND i.parent_id IS NULL))`;
const UPCOMING_COND = `${VISIBLE} AND ${ACTIVE_POC} AND ${OPEN} AND i.due_date > @today AND i.due_date <= @horizon AND NOT ${HAS_OPEN_SUBS}`;
const FOLLOWUPS_COND = `${VISIBLE} AND ${OPEN} AND i.parent_id IS NULL
	AND (i.category = 'followup' OR (@includePoc = 1 AND i.category = 'poc' AND i.state = 'waiting' AND ${ACTIVE_POC}))`;
const TASKS_COND = `${VISIBLE} AND ${OPEN} AND i.parent_id IS NULL AND i.category = 'task'`;
// En Hoy también sale lo que no tiene fecha y te toca a ti (lo que espera respuesta sin fecha, no).
const UNDATED_COND = `${VISIBLE} AND ${ACTIVE_POC} AND i.state = 'todo' AND i.parent_id IS NULL AND i.due_date IS NULL AND i.flagged = 0`;
// La cuenta de una tarea es su empresa o, si no tiene, la empresa de su PoC.
const ACCOUNT_EXPR = `coalesce(nullif(i.company, ''), p.company)`;

const emptyToNull = (v) => {
	if (v == null) return null;
	const s = String(v).trim();
	return s === '' ? null : s;
};

/** 12500, "12.500", "12.500,50" o "9000.5" → número; vacío → null. */
function parseAmount(v) {
	if (v == null || v === '') return null;
	if (typeof v === 'number') return v;
	let s = String(v).replace(/[\s€$]|US/g, '');
	if (!s) return null;
	if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
	else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
	return Number(s);
}

const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]));

const itemOut = (row) => row && { ...row, flagged: !!row.flagged };
const activityOut = (row) => row && { ...row, meta: row.meta ? JSON.parse(row.meta) : null };

const fold = (s) =>
	String(s ?? '')
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase();

export function createRepo(db, { now = () => new Date() } = {}) {
	const ts = () => toDateTimeStr(now());
	const today = () => toDateStr(now());
	const weekStart = () => weekRange(isoWeek(today())).start;

	db.function('fold', { deterministic: true }, (v) => (v == null ? null : fold(v)));
	db.function('region', { deterministic: true }, (country) => regionOf(country));

	const get = (sql, params = {}) => db.prepare(sql).get(params);
	const all = (sql, params = {}) => db.prepare(sql).all(params);
	const run = (sql, params = {}) => db.prepare(sql).run(params);

	const rawItem = (id) => get('SELECT * FROM items WHERE id = @id', { id });
	const rawPoc = (id) => get('SELECT * FROM pocs WHERE id = @id', { id });
	const itemRow = (id) => itemOut(get(`${ITEM_SELECT} WHERE i.id = @id`, { id }));

	function requireItem(id) {
		const it = rawItem(id);
		if (!it) throw notFound('La tarea');
		return it;
	}

	function requirePoc(id) {
		const p = rawPoc(id);
		if (!p) throw notFound('La PoC');
		return p;
	}

	function logActivity({ item_id = null, poc_id = null, kind, channel = null, body = null, meta = null, at }) {
		return Number(
			run(
				`INSERT INTO activity (item_id, poc_id, kind, channel, body, meta, occurred_at)
				 VALUES (@item_id, @poc_id, @kind, @channel, @body, @meta, @at)`,
				{ item_id, poc_id, kind, channel, body: emptyToNull(body), meta: meta ? JSON.stringify(meta) : null, at: at ?? ts() },
			).lastInsertRowid,
		);
	}

	function updateRow(table, id, fields) {
		const keys = Object.keys(fields);
		if (!keys.length) return;
		run(`UPDATE ${table} SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`, { ...fields, id });
	}

	// ── Ajustes ────────────────────────────────────────────────────────────────

	function getSettings() {
		const out = { ...DEFAULT_SETTINGS };
		for (const { key, value } of all('SELECT key, value FROM settings')) {
			if (key in DEFAULT_SETTINGS) {
				try {
					out[key] = JSON.parse(value);
				} catch {
					out[key] = value;
				}
			}
		}
		return out;
	}

	function setSettings(patch) {
		const clean = {};
		for (const [k, v] of Object.entries(patch ?? {})) {
			if (!(k in DEFAULT_SETTINGS)) continue;
			if (k === 'fup_days') {
				const n = Number(v);
				if (!Number.isInteger(n) || n < 1 || n > 60) throw bad('El intervalo de follow-up va de 1 a 60 días');
				clean[k] = n;
			} else if (k === 'digest_time') {
				if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v))) throw bad('Hora no válida');
				clean[k] = String(v);
			} else if (k === 'open_at_login') {
				clean[k] = !!v;
			} else {
				clean[k] = String(v ?? '');
			}
		}
		const stmt = db.prepare(
			'INSERT INTO settings (key, value) VALUES (@k, @v) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
		);
		db.transaction(() => {
			for (const [k, v] of Object.entries(clean)) stmt.run({ k, v: JSON.stringify(v) });
		})();
		return getSettings();
	}

	// ── Items ──────────────────────────────────────────────────────────────────

	function normalizeItem(data) {
		const out = {};
		if ('title' in data) {
			const t = String(data.title ?? '').trim();
			if (!t) throw bad('El título no puede estar vacío');
			out.title = t.slice(0, 500);
		}
		for (const k of ['notes', 'company', 'contact', 'message_template']) if (k in data) out[k] = emptyToNull(data[k]);
		if ('channel' in data) {
			const c = emptyToNull(data.channel);
			if (c && !CHANNELS.includes(c)) throw bad('Canal no válido');
			out.channel = c;
		}
		if ('category' in data) {
			if (!CATEGORIES.includes(data.category)) throw bad('Categoría no válida');
			out.category = data.category;
		}
		if ('poc_id' in data) out.poc_id = data.poc_id == null || data.poc_id === '' ? null : Number(data.poc_id);
		if ('parent_id' in data) out.parent_id = data.parent_id ? Number(data.parent_id) : null;
		if ('due_date' in data) {
			const v = emptyToNull(data.due_date);
			if (v && !isValidDate(v)) throw bad('Fecha no válida');
			out.due_date = v;
		}
		if ('remind_at' in data) {
			let v = emptyToNull(data.remind_at);
			if (v && !isValidDateTime(v)) throw bad('Recordatorio no válido');
			if (v && v.length === 16) v += ':00';
			out.remind_at = v;
		}
		if ('flagged' in data) out.flagged = data.flagged ? 1 : 0;
		if ('state' in data) {
			if (!['todo', 'waiting'].includes(data.state)) throw bad('Estado no válido');
			out.state = data.state;
		}
		return out;
	}

	function nextSort(category, pocId, parentId) {
		return get(
			`SELECT coalesce(max(sort_order), 0) + 1 AS s FROM items
			 WHERE category = @category AND coalesce(poc_id, 0) = @poc AND coalesce(parent_id, 0) = @parent`,
			{ category, poc: pocId ?? 0, parent: parentId ?? 0 },
		).s;
	}

	function createItem(data) {
		const d = normalizeItem(data ?? {});
		if (!d.title) throw bad('Falta el título');
		if (d.parent_id) {
			const parent = requireItem(d.parent_id);
			if (parent.parent_id) throw bad('Las subtareas solo tienen un nivel');
			d.category = parent.category;
			d.poc_id = parent.poc_id;
		}
		if (!d.category) d.category = d.poc_id ? 'poc' : 'task';
		if (d.category === 'poc') {
			if (!d.poc_id) throw bad('Elige la PoC');
			requirePoc(d.poc_id);
		} else {
			d.poc_id = null;
		}
		const t = ts();
		const state = d.state ?? 'todo';
		const row = {
			notes: null,
			company: null,
			contact: null,
			channel: null,
			due_date: null,
			remind_at: null,
			message_template: null,
			flagged: 0,
			parent_id: null,
			...d,
			state,
			waiting_since: state === 'waiting' ? t : null,
			sort_order: nextSort(d.category, d.poc_id, d.parent_id),
			created_at: t,
			updated_at: t,
		};
		const cols = Object.keys(row);
		return db.transaction(() => {
			const id = Number(
				run(`INSERT INTO items (${cols.join(', ')}) VALUES (${cols.map((c) => '@' + c).join(', ')})`, row)
					.lastInsertRowid,
			);
			if (!row.parent_id) logActivity({ item_id: id, kind: 'created', at: t });
			return itemRow(id);
		})();
	}

	function getItem(id) {
		const item = itemRow(id);
		if (!item) throw notFound('La tarea');
		const subtasks = all(`${ITEM_SELECT} WHERE i.parent_id = @id AND i.deleted_at IS NULL ORDER BY i.sort_order, i.id`, {
			id,
		}).map(itemOut);
		const activity = all(
			`SELECT a.*, i.title AS item_title, i.parent_id AS item_parent_id
			 FROM activity a JOIN items i ON i.id = a.item_id
			 WHERE a.item_id = @id OR (i.parent_id = @id AND a.kind = 'done')
			 ORDER BY a.occurred_at DESC, a.id DESC`,
			{ id },
		).map(activityOut);
		return { item, subtasks, activity };
	}

	function updateItem(id, data) {
		const it = requireItem(id);
		const d = normalizeItem(data ?? {});
		delete d.parent_id;
		const t = ts();

		let moved = false;
		if ('category' in d || 'poc_id' in d) {
			let category = d.category ?? it.category;
			let pocId = 'poc_id' in d ? d.poc_id : it.poc_id;
			if (d.poc_id && !d.category) category = 'poc';
			if (category === 'poc') {
				if (!pocId) throw bad('Elige la PoC');
				requirePoc(pocId);
			} else {
				pocId = null;
			}
			if (category !== it.category || pocId !== it.poc_id) {
				if (it.parent_id) throw bad('Mueve la tarea madre, no la subtarea');
				d.category = category;
				d.poc_id = pocId;
				d.sort_order = nextSort(category, pocId, null);
				moved = true;
			} else {
				delete d.category;
				delete d.poc_id;
			}
		}
		if ('state' in d) {
			if (d.state === 'waiting' && it.state !== 'waiting') d.waiting_since = t;
			if (d.state === 'todo') d.waiting_since = null;
			if (it.state === 'done') d.completed_at = null;
		}
		if ('remind_at' in d && d.remind_at !== it.remind_at) d.notified_at = null;

		db.transaction(() => {
			updateRow('items', id, { ...d, updated_at: t });
			if (moved) run('UPDATE items SET category = @c, poc_id = @p WHERE parent_id = @id', { c: d.category, p: d.poc_id, id });
			if ('due_date' in d && it.due_date && d.due_date && d.due_date > it.due_date && !it.parent_id && it.state !== 'done') {
				logActivity({ item_id: id, kind: 'rescheduled', meta: { from: it.due_date, to: d.due_date }, at: t });
			}
		})();
		return itemRow(id);
	}

	function completeItem(id) {
		const it = requireItem(id);
		if (it.state !== 'done') {
			const t = ts();
			db.transaction(() => {
				updateRow('items', id, { state: 'done', completed_at: t, updated_at: t });
				logActivity({ item_id: id, kind: 'done', at: t });
			})();
		}
		return itemRow(id);
	}

	function reopenItem(id) {
		const it = requireItem(id);
		if (it.state === 'done') {
			db.transaction(() => {
				updateRow('items', id, {
					state: it.waiting_since ? 'waiting' : 'todo',
					completed_at: null,
					updated_at: ts(),
				});
				run(
					`DELETE FROM activity WHERE id = (
					   SELECT id FROM activity WHERE item_id = @id AND kind = 'done' ORDER BY id DESC LIMIT 1)`,
					{ id },
				);
			})();
		}
		return itemRow(id);
	}

	/** Registrar un toque: queda en espera y se programa el siguiente follow-up. */
	function touchItem(id, { channel, body, next_date } = {}) {
		const it = requireItem(id);
		const ch = emptyToNull(channel);
		if (ch && !CHANNELS.includes(ch)) throw bad('Canal no válido');
		let next = next_date === undefined ? skipWeekend(addDays(today(), getSettings().fup_days)) : emptyToNull(next_date);
		if (next && !isValidDate(next)) throw bad('Fecha no válida');
		const t = ts();
		const keepSince = it.state === 'waiting' && it.waiting_since;
		return db.transaction(() => {
			updateRow('items', id, {
				state: 'waiting',
				waiting_since: keepSince ? it.waiting_since : t,
				touch_count: it.touch_count + 1,
				last_touch_at: t,
				due_date: next,
				channel: ch ?? it.channel,
				completed_at: null,
				updated_at: t,
			});
			const activityId = logActivity({
				item_id: id,
				kind: 'touch',
				channel: ch ?? it.channel,
				body,
				meta: { prev: pick(it, PREV_FIELDS), next_date: next },
				at: t,
			});
			return { item: itemRow(id), activity_id: activityId };
		})();
	}

	/** Han respondido: la pelota vuelve a mi tejado (o se da por cerrado). */
	function replyItem(id, { body, complete = false } = {}) {
		const it = requireItem(id);
		const t = ts();
		return db.transaction(() => {
			updateRow('items', id, {
				state: complete ? 'done' : 'todo',
				waiting_since: null,
				due_date: complete ? it.due_date : today(),
				completed_at: complete ? t : null,
				updated_at: t,
			});
			const doneId = complete ? logActivity({ item_id: id, kind: 'done', at: t }) : null;
			const activityId = logActivity({
				item_id: id,
				kind: 'reply',
				body,
				meta: { prev: pick(it, PREV_FIELDS), done_id: doneId },
				at: t,
			});
			return { item: itemRow(id), activity_id: activityId };
		})();
	}

	function addNote({ item_id = null, poc_id = null, body }) {
		if (!emptyToNull(body)) throw bad('La nota está vacía');
		if (item_id) requireItem(item_id);
		else if (poc_id) requirePoc(poc_id);
		else throw bad('Falta la tarea o la PoC');
		const id = logActivity({ item_id, poc_id, kind: 'note', body });
		return activityOut(get('SELECT * FROM activity WHERE id = @id', { id }));
	}

	/** Borra una entrada de la bitácora. Si es el último toque o respuesta, deshace su efecto. */
	function deleteActivity(activityId) {
		const a = get('SELECT * FROM activity WHERE id = @id', { id: activityId });
		if (!a) throw notFound('La entrada');
		db.transaction(() => {
			if ((a.kind === 'touch' || a.kind === 'reply') && a.meta && a.item_id) {
				const latest = get(
					`SELECT id FROM activity WHERE item_id = @item AND kind IN ('touch', 'reply') ORDER BY id DESC LIMIT 1`,
					{ item: a.item_id },
				);
				const meta = JSON.parse(a.meta);
				if (latest?.id === a.id && meta.prev) {
					updateRow('items', a.item_id, { ...pick(meta.prev, PREV_FIELDS), updated_at: ts() });
					if (meta.done_id) run('DELETE FROM activity WHERE id = @id', { id: meta.done_id });
				}
			}
			run('DELETE FROM activity WHERE id = @id', { id: activityId });
		})();
		return a.item_id ? itemRow(a.item_id) : null;
	}

	function deleteItem(id) {
		requireItem(id);
		updateRow('items', id, { deleted_at: ts() });
		return itemRow(id);
	}

	function restoreItem(id) {
		requireItem(id);
		updateRow('items', id, { deleted_at: null });
		return itemRow(id);
	}

	function purgeItem(id) {
		const it = requireItem(id);
		if (!it.deleted_at) throw bad('Solo se borra del todo lo que está en la papelera');
		run('DELETE FROM items WHERE id = @id', { id });
	}

	function emptyTrash() {
		return run('DELETE FROM items WHERE deleted_at IS NOT NULL').changes;
	}

	function reorderItems(ids) {
		if (!Array.isArray(ids)) throw bad('Falta el orden');
		const stmt = db.prepare('UPDATE items SET sort_order = @s WHERE id = @id');
		db.transaction(() => ids.forEach((id, i) => stmt.run({ s: i + 1, id: Number(id) })))();
	}

	/** Añade a cada tarea sus subtareas (`subs`), para enseñarlas debajo con su propio contador. */
	function withSubs(rows) {
		const ids = rows.filter((r) => r.sub_total > 0).map((r) => r.id);
		if (!ids.length) return rows;
		const subs = all(
			`${ITEM_SELECT} WHERE i.parent_id IN (${ids.join(',')}) AND i.deleted_at IS NULL ORDER BY (i.state = 'done'), i.sort_order, i.id`,
		).map(itemOut);
		return rows.map((r) => (r.sub_total > 0 ? { ...r, subs: subs.filter((s) => s.parent_id === r.id) } : r));
	}

	function listItems(view, { pocId, includePoc = false } = {}) {
		const p = { today: today(), horizon: addDays(today(), 7), week: weekStart(), includePoc: includePoc ? 1 : 0 };
		const q = (where, order) => withSubs(all(`${ITEM_SELECT} WHERE ${where} ORDER BY ${order}`, p).map(itemOut));
		// Lo completado esta semana se queda visible (tachado) al final de la lista.
		const doneThisWeek = (category) =>
			q(
				`i.deleted_at IS NULL AND i.state = 'done' AND i.parent_id IS NULL AND i.completed_at >= @week AND i.category = '${category}'`,
				'i.completed_at DESC',
			);
		switch (view) {
			case 'today':
				return {
					items: q(TODAY_COND, '(i.due_date IS NULL), i.due_date, i.sort_order, i.id'),
					undated: q(
						UNDATED_COND,
						`CASE i.category WHEN 'followup' THEN 0 WHEN 'poc' THEN 1 ELSE 2 END, p.name, i.sort_order, i.id`,
					),
					done: all(
						`${ITEM_SELECT} WHERE i.deleted_at IS NULL AND i.state = 'done' AND i.completed_at >= @today ORDER BY i.completed_at DESC`,
						p,
					).map(itemOut),
				};
			case 'upcoming':
				return { items: q(UPCOMING_COND, 'i.due_date, i.sort_order, i.id'), done: [] };
			case 'followups':
				return {
					items: q(FOLLOWUPS_COND, '(i.due_date IS NULL), i.due_date, i.sort_order, i.id'),
					done: doneThisWeek('followup'),
				};
			case 'tasks':
				return { items: q(TASKS_COND, 'i.sort_order, i.id'), done: doneThisWeek('task') };
			case 'poc': {
				requirePoc(pocId);
				p.poc = pocId;
				return {
					items: q(`i.deleted_at IS NULL AND i.parent_id IS NULL AND i.poc_id = @poc AND ${OPEN}`, 'i.sort_order, i.id'),
					done: q(`i.deleted_at IS NULL AND i.parent_id IS NULL AND i.poc_id = @poc AND i.state = 'done'`, 'i.completed_at'),
				};
			}
			case 'trash':
				return {
					items: q(
						`i.deleted_at IS NOT NULL AND (par.id IS NULL OR par.deleted_at IS NULL)`,
						'i.deleted_at DESC',
					),
					done: [],
				};
			default:
				throw bad('Vista no válida');
		}
	}

	function counts() {
		const p = { today: today(), horizon: addDays(today(), 7), includePoc: 0 };
		const n = (where) => get(`SELECT COUNT(*) AS n FROM items i LEFT JOIN pocs p ON p.id = i.poc_id LEFT JOIN items par ON par.id = i.parent_id WHERE ${where}`, p).n;
		return {
			today: n(TODAY_COND),
			undated: n(UNDATED_COND),
			overdue: n(`${VISIBLE} AND ${ACTIVE_POC} AND ${OPEN} AND i.due_date < @today`),
			upcoming: n(UPCOMING_COND),
			followups: n(FOLLOWUPS_COND),
			followups_due: n(`${FOLLOWUPS_COND} AND i.due_date <= @today`),
			tasks: n(TASKS_COND),
			trash: n(`i.deleted_at IS NOT NULL AND (par.id IS NULL OR par.deleted_at IS NULL)`),
			pocs: listPocs().map((x) => pick(x, ['id', 'name', 'color', 'status', 'paused_until', 'country', 'total', 'done', 'waiting'])),
		};
	}

	// ── PoCs ───────────────────────────────────────────────────────────────────

	const POC_SELECT = `
		SELECT p.*,
		  (SELECT COUNT(*) FROM items i WHERE i.poc_id = p.id AND i.parent_id IS NULL AND i.deleted_at IS NULL) AS total,
		  (SELECT COUNT(*) FROM items i WHERE i.poc_id = p.id AND i.parent_id IS NULL AND i.deleted_at IS NULL AND i.state = 'done') AS done,
		  (SELECT COUNT(*) FROM items i WHERE i.poc_id = p.id AND i.deleted_at IS NULL AND i.state = 'waiting') AS waiting,
		  (SELECT max(a.occurred_at) FROM activity a LEFT JOIN items i ON i.id = a.item_id
		    WHERE a.poc_id = p.id OR i.poc_id = p.id) AS last_activity_at,
		  (SELECT COUNT(*) FROM poc_admins pa WHERE pa.poc_id = p.id AND pa.kind = 'admin') AS admin_count
		FROM pocs p`;

	// Personas de la PoC: contacto principal, admins del cliente y contacto del partner (columna kind).
	const pocContacts = (pocId) => all('SELECT * FROM poc_admins WHERE poc_id = @poc ORDER BY sort_order, id', { poc: pocId });

	const nextTask = (pocId) =>
		itemOut(
			get(
				`${ITEM_SELECT} WHERE i.poc_id = @poc AND i.parent_id IS NULL AND i.deleted_at IS NULL AND i.state <> 'done'
				 ORDER BY (i.due_date IS NULL), i.due_date, i.sort_order, i.id LIMIT 1`,
				{ poc: pocId },
			),
		) ?? null;

	function listPocs() {
		return all(
			`${POC_SELECT} ORDER BY CASE p.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, p.sort_order, p.id`,
		).map((p) => ({ ...p, next: nextTask(p.id) }));
	}

	function getPoc(id) {
		const poc = get(`${POC_SELECT} WHERE p.id = @id`, { id });
		if (!poc) throw notFound('La PoC');
		const activity = all(
			`SELECT a.*, i.title AS item_title FROM activity a LEFT JOIN items i ON i.id = a.item_id
			 WHERE a.poc_id = @id OR (i.poc_id = @id AND a.kind <> 'created')
			 ORDER BY a.occurred_at DESC, a.id DESC LIMIT 300`,
			{ id },
		).map(activityOut);
		return { poc: { ...poc, next: nextTask(id) }, contacts: pocContacts(id), activity };
	}

	function normalizePoc(data) {
		const out = {};
		if ('name' in data) {
			const n = String(data.name ?? '').trim();
			if (!n) throw bad('La PoC necesita un nombre');
			out.name = n.slice(0, 200);
		}
		for (const k of ['company', 'notes']) if (k in data) out[k] = emptyToNull(data[k]);
		if ('partner' in data) out.partner = emptyToNull(data.partner)?.slice(0, 120) ?? null;
		if ('owner' in data) out.owner = emptyToNull(data.owner)?.slice(0, 120) ?? null;
		if ('amount' in data) {
			const n = parseAmount(data.amount);
			if (n != null && (!Number.isFinite(n) || n < 0)) throw bad('El importe tiene que ser un número');
			out.amount = n;
		}
		if ('currency' in data) {
			const c = emptyToNull(data.currency);
			if (c && !/^[A-Za-z]{3}$/.test(c)) throw bad('La moneda va en tres letras (EUR, USD…)');
			out.currency = c ? c.toUpperCase() : null;
		}
		if ('start_date' in data) {
			const v = emptyToNull(data.start_date);
			if (v && !isValidDate(v)) throw bad('Fecha de inicio no válida');
			out.start_date = v;
		}
		if ('country' in data) {
			const c = emptyToNull(data.country);
			if (c && !isCountry(c)) throw bad(`No conozco el país «${c}». Elígelo de la lista (México es MX)`);
			out.country = c ? c.toUpperCase() : null;
		}
		if ('color' in data) {
			const c = emptyToNull(data.color);
			if (c && !/^#[0-9A-Fa-f]{6}$/.test(c)) throw bad('Color no válido');
			out.color = c;
		}
		if ('hubspot' in data) {
			const raw = emptyToNull(data.hubspot);
			const ref = raw ? parseHubspotRef(raw) : null;
			if (raw && !ref) throw bad('No reconozco ese enlace de HubSpot. Pega el enlace del deal o su ID');
			Object.assign(out, {
				hubspot_deal_id: ref?.dealId ?? null,
				hubspot_url: ref?.url ?? null,
				hubspot_name: null,
				hubspot_stage: null,
				hubspot_amount: null,
				hubspot_currency: null,
				hubspot_close_date: null,
				hubspot_synced_at: null,
			});
			if (ref?.portalId && !getSettings().hubspot_portal_id) setSettings({ hubspot_portal_id: ref.portalId });
		}
		return out;
	}

	function createPoc(data, { useTemplate = false } = {}) {
		const d = normalizePoc(data ?? {});
		if (!d.name) throw bad('La PoC necesita un nombre');
		const t = ts();
		const count = get('SELECT COUNT(*) AS n FROM pocs').n;
		const row = {
			company: null,
			country: null,
			notes: null,
			color: POC_COLORS[count % POC_COLORS.length],
			...d,
			status: 'active',
			sort_order: get('SELECT coalesce(max(sort_order), 0) + 1 AS s FROM pocs').s,
			created_at: t,
			updated_at: t,
		};
		const cols = Object.keys(row);
		const id = db.transaction(() => {
			const pocId = Number(
				run(`INSERT INTO pocs (${cols.join(', ')}) VALUES (${cols.map((c) => '@' + c).join(', ')})`, row).lastInsertRowid,
			);
			logActivity({ poc_id: pocId, kind: 'created', at: t });
			if (useTemplate) {
				for (const line of getSettings().poc_template.split('\n')) {
					if (line.trim()) createItem({ category: 'poc', poc_id: pocId, title: line.trim() });
				}
			}
			return pocId;
		})();
		return getPoc(id).poc;
	}

	function updatePoc(id, data) {
		requirePoc(id);
		const d = normalizePoc(data ?? {});
		if ('sort_order' in (data ?? {})) d.sort_order = Number(data.sort_order);
		updateRow('pocs', id, { ...d, updated_at: ts() });
		return getPoc(id).poc;
	}

	// ── Personas de la PoC: contacto principal, admins del cliente y contacto del partner ──

	const CONTACT_KINDS = ['admin', 'main', 'partner'];

	function normalizeAdmin(data) {
		const out = {};
		if ('name' in data) {
			const n = String(data.name ?? '').trim();
			if (!n) throw bad('El contacto necesita un nombre');
			out.name = n.slice(0, 200);
		}
		if ('kind' in data) {
			if (!CONTACT_KINDS.includes(data.kind)) throw bad('Tipo de contacto no válido');
			out.kind = data.kind;
		}
		if ('email' in data) {
			const e = emptyToNull(data.email);
			if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw bad('Ese email no parece válido');
			out.email = e ? e.toLowerCase() : null;
		}
		if ('role' in data) out.role = emptyToNull(data.role)?.slice(0, 120) ?? null;
		return out;
	}

	function addPocAdmin(pocId, data) {
		requirePoc(pocId);
		const d = normalizeAdmin(data ?? {});
		if (!d.name) throw bad('El contacto necesita un nombre');
		const row = {
			email: null,
			role: null,
			kind: 'admin',
			...d,
			poc_id: pocId,
			sort_order: get('SELECT coalesce(max(sort_order), 0) + 1 AS s FROM poc_admins WHERE poc_id = @poc', { poc: pocId }).s,
			created_at: ts(),
		};
		const cols = Object.keys(row);
		const id = run(`INSERT INTO poc_admins (${cols.join(', ')}) VALUES (${cols.map((c) => '@' + c).join(', ')})`, row)
			.lastInsertRowid;
		return get('SELECT * FROM poc_admins WHERE id = @id', { id });
	}

	function updatePocAdmin(id, data) {
		if (!get('SELECT id FROM poc_admins WHERE id = @id', { id })) throw notFound('El admin');
		updateRow('poc_admins', id, normalizeAdmin(data ?? {}));
		return get('SELECT * FROM poc_admins WHERE id = @id', { id });
	}

	function deletePocAdmin(id) {
		if (!run('DELETE FROM poc_admins WHERE id = @id', { id }).changes) throw notFound('El admin');
	}

	function setPocStatus(id, { status, paused_until = null, body = null } = {}) {
		const poc = requirePoc(id);
		if (!POC_STATUSES.includes(status)) throw bad('Estado no válido');
		const until = emptyToNull(paused_until);
		if (until && !isValidDate(until)) throw bad('Fecha no válida');
		const t = ts();
		const kind = { active: 'resumed', paused: 'paused', won: 'won', lost: 'lost' }[status];
		db.transaction(() => {
			updateRow('pocs', id, {
				status,
				paused_until: status === 'paused' ? until : null,
				closed_at: status === 'won' || status === 'lost' ? t : null,
				updated_at: t,
			});
			if (status !== poc.status || status === 'paused') {
				logActivity({ poc_id: id, kind, body, meta: status === 'paused' ? { until } : null, at: t });
			}
		})();
		return getPoc(id).poc;
	}

	function deletePoc(id) {
		requirePoc(id);
		run('DELETE FROM pocs WHERE id = @id', { id });
	}

	function applyHubspotDeal(id, deal) {
		requirePoc(id);
		updateRow('pocs', id, {
			hubspot_deal_id: deal.id,
			hubspot_name: deal.name ?? null,
			hubspot_stage: deal.stage ?? null,
			hubspot_amount: deal.amount ?? null,
			hubspot_currency: deal.currency ?? null,
			hubspot_close_date: deal.closeDate ?? null,
			hubspot_synced_at: ts(),
			...(deal.url ? { hubspot_url: deal.url } : {}),
		});
		return getPoc(id).poc;
	}

	// ── Semanas ────────────────────────────────────────────────────────────────

	function listWeeks() {
		const rows = all(
			`SELECT week, SUM(kind = 'done') AS done, SUM(kind = 'touch') AS touches, SUM(kind = 'reply') AS replies
			 FROM v_week_log GROUP BY week ORDER BY week DESC LIMIT 104`,
		);
		const current = isoWeek(today());
		if (!rows.length || rows[0].week !== current) rows.unshift({ week: current, done: 0, touches: 0, replies: 0 });
		return rows;
	}

	function getWeek(week) {
		if (!isValidWeek(week)) throw bad('Semana no válida');
		const { start, end } = weekRange(week);
		const done = all(
			`${ITEM_SELECT} WHERE i.deleted_at IS NULL AND i.state = 'done'
			 AND i.completed_at >= @from AND i.completed_at < @to ORDER BY i.completed_at`,
			{ from: start, to: addDays(end, 1) },
		).map(itemOut);
		const log = (kinds) =>
			all(
				`SELECT * FROM v_week_log WHERE week = @week AND kind IN (${kinds.map((k) => `'${k}'`).join(', ')})
				 ORDER BY occurred_at`,
				{ week },
			);
		return {
			week,
			start,
			end,
			done,
			touches: log(['touch']),
			replies: log(['reply']),
			poc_events: log(['paused', 'resumed', 'won', 'lost']),
		};
	}

	// ── Búsqueda y sugerencias ─────────────────────────────────────────────────

	function search(text) {
		const tokens = fold(text).match(/[\p{L}\p{N}]+/gu) ?? [];
		if (!tokens.length) return { items: [], pocs: [], accounts: [] };
		const match = tokens.map((t) => `"${t}"*`).join(' ');
		const items = all(
			`${ITEM_SELECT} JOIN items_fts f ON f.rowid = i.id
			 WHERE items_fts MATCH @match AND ${VISIBLE}
			 ORDER BY (i.state = 'done'), f.rank LIMIT 30`,
			{ match },
		).map(itemOut);
		const admins = new Map(
			all(`SELECT poc_id, group_concat(name || ' ' || coalesce(email, ''), ' ') AS hay FROM poc_admins GROUP BY poc_id`).map(
				(r) => [r.poc_id, r.hay],
			),
		);
		const pocs = listPocs().filter((p) => {
			const hay = fold(`${p.name} ${p.company ?? ''} ${p.partner ?? ''} ${p.owner ?? ''} ${admins.get(p.id) ?? ''}`);
			return tokens.every((t) => hay.includes(t));
		});
		const accounts = [...accountNames().values()].filter((n) => tokens.every((t) => fold(n).includes(t))).slice(0, 8);
		return { items, pocs, accounts };
	}

	function suggestions() {
		const companies = all(
			`SELECT company AS value, COUNT(*) AS n FROM (
			   SELECT company FROM items WHERE company IS NOT NULL AND deleted_at IS NULL
			   UNION ALL SELECT company FROM pocs WHERE company IS NOT NULL)
			 GROUP BY lower(company) ORDER BY n DESC, value LIMIT 300`,
		).map((r) => r.value);
		const contacts = all(
			`SELECT contact AS value, company, COUNT(*) AS n FROM items
			 WHERE contact IS NOT NULL AND deleted_at IS NULL
			 GROUP BY lower(contact) ORDER BY n DESC, value LIMIT 300`,
		).map((r) => ({ value: r.value, company: r.company }));
		const owners = all(
			`SELECT owner AS value, COUNT(*) AS n FROM pocs WHERE owner IS NOT NULL GROUP BY lower(owner) ORDER BY n DESC, value`,
		).map((r) => r.value);
		const partners = all(
			`SELECT partner AS value, COUNT(*) AS n FROM pocs WHERE partner IS NOT NULL GROUP BY lower(partner) ORDER BY n DESC, value`,
		).map((r) => r.value);
		return { companies, contacts, owners, partners };
	}

	// ── Cuentas ────────────────────────────────────────────────────────────────

	/** Nombre más usado de cada cuenta (agrupando sin mayúsculas ni acentos). */
	function accountNames() {
		// Ojo: el alias no puede llamarse "name", porque pocs tiene esa columna y GROUP BY la cogería.
		const rows = all(
			`SELECT trim(${ACCOUNT_EXPR}) AS acc, COUNT(*) AS n FROM items i LEFT JOIN pocs p ON p.id = i.poc_id
			 WHERE i.deleted_at IS NULL AND ${ACCOUNT_EXPR} IS NOT NULL GROUP BY acc
			 UNION ALL SELECT trim(company) AS acc, 1 AS n FROM pocs WHERE company IS NOT NULL`,
		);
		const spellings = new Map(); // cuenta → (forma de escribirla → veces)
		for (const r of rows) {
			const key = fold(r.acc);
			if (!key) continue;
			if (!spellings.has(key)) spellings.set(key, new Map());
			const m = spellings.get(key);
			m.set(r.acc, (m.get(r.acc) ?? 0) + r.n);
		}
		return new Map([...spellings].map(([k, m]) => [k, [...m].sort((a, b) => b[1] - a[1])[0][0]]));
	}

	function avgResponseDays(replies) {
		const days = replies
			.map((r) => {
				const since = r.meta ? JSON.parse(r.meta).prev?.waiting_since : null;
				return since ? (new Date(r.occurred_at) - new Date(since)) / 86400000 : null;
			})
			.filter((d) => d != null && d >= 0);
		return days.length ? Math.round((days.reduce((x, y) => x + y, 0) / days.length) * 10) / 10 : null;
	}

	function listAccounts() {
		const names = accountNames();
		const acc = new Map();
		const entry = (key) => {
			if (!acc.has(key)) {
				acc.set(key, {
					key,
					name: names.get(key) ?? key,
					followups: 0,
					waiting: 0,
					tasks: 0,
					poc_items: 0,
					overdue: 0,
					next_due: null,
					pocs: [],
					last_activity_at: null,
					touches_30d: 0,
				});
			}
			return acc.get(key);
		};
		const items = all(
			`SELECT fold(${ACCOUNT_EXPR}) AS k, i.category, i.state, i.due_date FROM items i LEFT JOIN pocs p ON p.id = i.poc_id
			 WHERE i.deleted_at IS NULL AND i.parent_id IS NULL AND i.state <> 'done' AND ${ACCOUNT_EXPR} IS NOT NULL
			   AND (p.id IS NULL OR p.status IN ('active', 'paused'))`,
		);
		for (const r of items) {
			const e = entry(r.k.trim());
			if (r.state === 'waiting') e.waiting++;
			else if (r.category === 'followup') e.followups++;
			else if (r.category === 'task') e.tasks++;
			else e.poc_items++;
			if (r.due_date && r.due_date < today()) e.overdue++;
			if (r.due_date && (!e.next_due || r.due_date < e.next_due)) e.next_due = r.due_date;
		}
		for (const p of listPocs()) {
			if (p.company) entry(fold(p.company).trim()).pocs.push(pick(p, ['id', 'name', 'color', 'status']));
		}
		const acts = all(
			`SELECT fold(coalesce(nullif(i.company, ''), pi.company, pa.company)) AS k, max(a.occurred_at) AS last,
			        SUM(a.kind = 'touch' AND a.occurred_at >= @since) AS touches
			 FROM activity a LEFT JOIN items i ON i.id = a.item_id
			 LEFT JOIN pocs pi ON pi.id = i.poc_id LEFT JOIN pocs pa ON pa.id = a.poc_id
			 WHERE a.kind <> 'created' AND (i.id IS NULL OR i.deleted_at IS NULL) GROUP BY k`,
			{ since: addDays(today(), -30) },
		);
		for (const r of acts) {
			if (!r.k || !acc.has(r.k.trim()) && !names.has(r.k.trim())) continue;
			const e = entry(r.k.trim());
			e.last_activity_at = r.last;
			e.touches_30d = r.touches;
		}
		const open = (e) => e.followups + e.waiting + e.tasks + e.poc_items;
		return [...acc.values()].sort(
			(a, b) => (open(b) > 0) - (open(a) > 0) || (b.last_activity_at ?? '').localeCompare(a.last_activity_at ?? ''),
		);
	}

	function getAccount(name) {
		const key = fold(name).trim();
		const summary = listAccounts().find((x) => x.key === key);
		if (!summary) throw notFound('La cuenta');
		const p = { key, since: addDays(today(), -30) };
		const cond = `fold(${ACCOUNT_EXPR}) = @key`;
		const open = withSubs(
			all(
				`${ITEM_SELECT} WHERE ${VISIBLE} AND i.parent_id IS NULL AND ${OPEN} AND ${cond}
				 ORDER BY (i.due_date IS NULL), i.due_date, i.sort_order, i.id`,
				p,
			).map(itemOut),
		);
		const done = all(
			`${ITEM_SELECT} WHERE i.deleted_at IS NULL AND i.parent_id IS NULL AND i.state = 'done' AND i.completed_at >= @since AND ${cond}
			 ORDER BY i.completed_at DESC`,
			p,
		).map(itemOut);
		const pocs = listPocs().filter((x) => x.company && fold(x.company).trim() === key);
		const contacts = new Map();
		for (const r of all(
			`SELECT i.contact AS name, COUNT(*) AS n FROM items i LEFT JOIN pocs p ON p.id = i.poc_id
			 WHERE i.deleted_at IS NULL AND i.contact IS NOT NULL AND ${cond} GROUP BY fold(i.contact) ORDER BY n DESC`,
			p,
		)) {
			contacts.set(fold(r.name), { name: r.name, email: null, role: null, poc: null, kind: null, partner: null, tasks: r.n });
		}
		for (const poc of pocs) {
			for (const a of pocContacts(poc.id)) {
				const k = fold(a.name);
				const prev = contacts.get(k);
				contacts.set(k, { name: a.name, email: a.email, role: a.role, poc: poc.name, kind: a.kind, partner: poc.partner, tasks: prev?.tasks ?? 0 });
			}
		}
		const scope = `(fold(coalesce(nullif(i.company, ''), pi.company)) = @key OR fold(pa.company) = @key)`;
		const activity = all(
			`SELECT a.*, i.title AS item_title, coalesce(pa.name, pi.name) AS poc_name
			 FROM activity a LEFT JOIN items i ON i.id = a.item_id
			 LEFT JOIN pocs pi ON pi.id = i.poc_id LEFT JOIN pocs pa ON pa.id = a.poc_id
			 WHERE a.kind <> 'created' AND (i.id IS NULL OR i.deleted_at IS NULL) AND ${scope}
			 ORDER BY a.occurred_at DESC, a.id DESC LIMIT 150`,
			p,
		);
		const replies = activity.filter((a) => a.kind === 'reply');
		return {
			...summary,
			open,
			done,
			pocs,
			contacts: [...contacts.values()],
			activity: activity.map(activityOut),
			stats: {
				touches_30d: activity.filter((a) => a.kind === 'touch' && a.occurred_at >= p.since).length,
				replies_30d: replies.filter((a) => a.occurred_at >= p.since).length,
				avg_response_days: avgResponseDays(replies),
			},
		};
	}

	// ── Estadísticas ───────────────────────────────────────────────────────────

	function stats(weeksParam = 12, regionParam = null) {
		const weeks = Math.min(104, Math.max(4, Number(weeksParam) || 12));
		const R = regionParam === 'iberia' || regionParam === 'latam' ? regionParam : null;
		const t = today();
		const monday = weekRange(isoWeek(t)).start;
		const from = addDays(monday, -(weeks - 1) * 7);
		const to = addDays(t, 1);
		const prevFrom = addDays(from, -weeks * 7);
		const P = { from, to, prevFrom, region: R, today: t };
		const RF = R ? 'AND region = @region' : '';

		// País de una tarea: el de su PoC o, si no tiene, el de la PoC de su misma cuenta (empresa).
		const accountCountry = (companyExpr) =>
			`(SELECT pp.country FROM pocs pp WHERE pp.country IS NOT NULL AND pp.company IS NOT NULL AND fold(pp.company) = fold(${companyExpr}) LIMIT 1)`;
		// Cada hecho de la bitácora con su semana, su cuenta y su región.
		const ACT = `WITH act AS (
			SELECT a.kind, a.channel, a.meta, a.occurred_at, a.item_id,
			       strftime('%G-W%V', a.occurred_at) AS week,
			       coalesce(nullif(i.company, ''), p.company) AS account,
			       region(coalesce(p.country, ${accountCountry('i.company')})) AS region
			FROM activity a
			LEFT JOIN items i ON i.id = a.item_id
			LEFT JOIN pocs p ON p.id = coalesce(i.poc_id, a.poc_id)
			WHERE a.kind <> 'created' AND (i.id IS NULL OR i.deleted_at IS NULL))`;
		const ITEM_REGION = `region(coalesce(p.country, ${accountCountry('i.company')}))`;
		const IRF = R ? `AND ${ITEM_REGION} = @region` : '';

		const count = (kind, a, b) =>
			get(`${ACT} SELECT COUNT(*) AS n FROM act WHERE kind = '${kind}' AND occurred_at >= @${a} AND occurred_at < @${b} ${RF}`, P).n;
		const totals = (a, b) => ({ done: count('done', a, b), touches: count('touch', a, b), replies: count('reply', a, b) });

		const byWeek = new Map(
			all(
				`${ACT} SELECT week, SUM(kind = 'done') AS done, SUM(kind = 'touch') AS touches, SUM(kind = 'reply') AS replies
				 FROM act WHERE occurred_at >= @from ${RF} GROUP BY week`,
				P,
			).map((r) => [r.week, r]),
		);
		const weekly = Array.from({ length: weeks }, (_, i) => {
			const w = isoWeek(addDays(from, i * 7));
			const r = byWeek.get(w);
			return { week: w, done: r?.done ?? 0, touches: r?.touches ?? 0, replies: r?.replies ?? 0 };
		});

		// De los follow-ups que tocaste en el periodo, cuántos han respondido después.
		const touched = all(
			`${ACT} SELECT item_id, min(occurred_at) AS first FROM act
			 WHERE kind = 'touch' AND item_id IS NOT NULL AND occurred_at >= @from AND occurred_at < @to ${RF} GROUP BY item_id`,
			P,
		);
		const repliesSince = all(`${ACT} SELECT item_id, occurred_at, meta FROM act WHERE kind = 'reply' AND occurred_at >= @from ${RF}`, P);
		const answered = touched.filter((x) => repliesSince.some((r) => r.item_id === x.item_id && r.occurred_at > x.first)).length;
		const periodReplies = repliesSince.filter((r) => r.occurred_at < to);

		const itemsFrom = `FROM items i LEFT JOIN pocs p ON p.id = i.poc_id LEFT JOIN items par ON par.id = i.parent_id`;
		const waitingNow = all(
			`SELECT i.waiting_since ${itemsFrom} WHERE ${VISIBLE} AND i.state = 'waiting' AND NOT ${HAS_OPEN_SUBS} AND ${ACTIVE_POC} ${IRF}`,
			P,
		);
		const buckets = [
			{ label: '0–3 días', level: 'ok', max: 3, n: 0 },
			{ label: '4–7 días', level: 'warn', max: 7, n: 0 },
			{ label: '8–14 días', level: 'late', max: 14, n: 0 },
			{ label: 'Más de 14', level: 'cold', max: Infinity, n: 0 },
		];
		for (const w of waitingNow) {
			const d = w.waiting_since ? daysBetween(w.waiting_since.slice(0, 10), t) : 0;
			buckets.find((b) => d <= b.max).n++;
		}

		const channels = all(
			`${ACT} SELECT coalesce(channel, 'none') AS channel, COUNT(*) AS n FROM act
			 WHERE kind = 'touch' AND occurred_at >= @from AND occurred_at < @to ${RF} GROUP BY channel ORDER BY n DESC`,
			P,
		);

		const names = accountNames();
		const accounts = all(
			`${ACT} SELECT fold(account) AS k, SUM(kind = 'touch') AS touches, SUM(kind = 'done') AS done, SUM(kind = 'reply') AS replies
			 FROM act WHERE kind IN ('touch', 'done', 'reply') AND occurred_at >= @from AND occurred_at < @to AND account IS NOT NULL ${RF}
			 GROUP BY k`,
			P,
		)
			.map((r) => ({ name: names.get(r.k.trim()) ?? r.k, touches: r.touches, done: r.done, replies: r.replies, total: r.touches + r.done + r.replies }))
			.sort((a, b) => b.total - a.total)
			.slice(0, 8);

		const activityByRegion = ['iberia', 'latam', 'none'].map((region) => {
			const r = get(
				`${ACT} SELECT SUM(kind = 'touch') AS touches, SUM(kind = 'done') AS done, SUM(kind = 'reply') AS replies
				 FROM act WHERE occurred_at >= @from AND occurred_at < @to AND region = @r`,
				{ ...P, r: region },
			);
			return { region, touches: r.touches ?? 0, done: r.done ?? 0, replies: r.replies ?? 0 };
		});

		// ── PoCs (con su importe efectivo: el del deal o el manual) ──
		const allPocs = listPocs();
		const inRegion = R ? allPocs.filter((p) => regionOf(p.country) === R) : allPocs;
		const inCourse = (list) => list.filter((p) => p.status === 'active' || p.status === 'paused');
		const summary = (list) => {
			const n = (s) => list.filter((p) => p.status === s).length;
			const won = n('won');
			const lost = n('lost');
			const durations = list
				.filter((p) => p.closed_at && (p.status === 'won' || p.status === 'lost'))
				.map((p) => daysBetween((p.start_date ?? p.created_at).slice(0, 10), p.closed_at.slice(0, 10)))
				.filter((d) => d >= 0);
			return {
				active: n('active'),
				paused: n('paused'),
				won,
				lost,
				win_rate: won + lost ? Math.round((won / (won + lost)) * 100) : null,
				avg_days: durations.length ? Math.round(durations.reduce((x, y) => x + y, 0) / durations.length) : null,
				amounts: sumByCurrency(inCourse(list)),
				won_amounts: sumByCurrency(list.filter((p) => p.status === 'won')),
			};
		};
		const regions = ['iberia', 'latam', 'none']
			.map((region) => ({ region, ...summary(allPocs.filter((p) => regionOf(p.country) === region)) }))
			.filter((r) => r.region !== 'none' || r.active + r.paused + r.won + r.lost > 0);

		const countryMap = new Map();
		for (const p of inCourse(inRegion)) {
			const k = p.country ?? 'none';
			if (!countryMap.has(k)) countryMap.set(k, []);
			countryMap.get(k).push(p);
		}
		const countries = [...countryMap]
			.map(([country, list]) => ({ country, region: regionOf(country === 'none' ? null : country), n: list.length, amounts: sumByCurrency(list) }))
			.sort((a, b) => (a.country === 'none') - (b.country === 'none') || b.n - a.n || a.country.localeCompare(b.country));

		const pocDays = inRegion
			.filter((p) => p.status === 'active' && p.start_date && p.start_date <= t)
			.map((p) => ({ id: p.id, name: p.name, color: p.color, country: p.country, region: regionOf(p.country), days: Math.max(0, daysBetween(p.start_date, t)) }))
			.sort((a, b) => b.days - a.days);

		// Cierres previstos (fecha de cierre del deal) de las PoCs en curso, mes a mes durante un año.
		const firstMonth = t.slice(0, 7);
		const monthKeys = Array.from({ length: 12 }, (_, i) => {
			const d = parseDate(`${firstMonth}-01`);
			d.setMonth(d.getMonth() + i);
			return toDateStr(d).slice(0, 7);
		});
		const closes = monthKeys.map((month) => {
			const list = inCourse(inRegion).filter((p) => p.hubspot_close_date?.slice(0, 7) === month);
			const by = (r) => list.filter((p) => regionOf(p.country) === r).length;
			return { month, iberia: by('iberia'), latam: by('latam'), none: by('none'), amounts: sumByCurrency(list) };
		});
		const closesEarlier = inCourse(inRegion).filter((p) => p.hubspot_close_date && p.hubspot_close_date.slice(0, 7) < firstMonth).length;

		return {
			weeks,
			region: R ?? 'all',
			from,
			to: t,
			totals: totals('from', 'to'),
			previous: totals('prevFrom', 'from'),
			response: {
				touched: touched.length,
				answered,
				rate: touched.length ? Math.round((answered / touched.length) * 100) : null,
				avg_days: avgResponseDays(periodReplies),
			},
			now: {
				mine: get(`SELECT COUNT(*) AS n ${itemsFrom} WHERE ${VISIBLE} AND ${ACTIVE_POC} AND i.state = 'todo' AND NOT ${HAS_OPEN_SUBS} ${IRF}`, P).n,
				waiting: waitingNow.length,
				overdue: get(`SELECT COUNT(*) AS n ${itemsFrom} WHERE ${VISIBLE} AND ${ACTIVE_POC} AND ${OPEN} AND i.due_date < @today ${IRF}`, P).n,
			},
			weekly,
			waiting_buckets: buckets.map(({ label, level, n }) => ({ label, level, n })),
			channels,
			accounts,
			activity_by_region: activityByRegion,
			pocs: summary(inRegion),
			regions,
			countries,
			poc_days: pocDays,
			closes,
			closes_earlier: closesEarlier,
		};
	}

	// ── Mantenimiento y avisos ─────────────────────────────────────────────────

	/** Reanuda las PoCs cuya pausa ha terminado. Devuelve cuántas. */
	function housekeeping() {
		const due = all(`SELECT id FROM pocs WHERE status = 'paused' AND paused_until IS NOT NULL AND paused_until <= @today`, {
			today: today(),
		});
		for (const { id } of due) setPocStatus(id, { status: 'active', body: 'Fin de la pausa' });
		return due.length;
	}

	function dueReminders() {
		return all(
			`${ITEM_SELECT} WHERE i.remind_at IS NOT NULL AND i.remind_at <= @now AND i.notified_at IS NULL
			 AND ${VISIBLE} AND ${OPEN} ORDER BY i.remind_at`,
			{ now: ts() },
		).map(itemOut);
	}

	function markNotified(id) {
		updateRow('items', id, { notified_at: ts() });
	}

	return {
		today,
		getSettings,
		setSettings,
		listItems,
		getItem,
		createItem,
		updateItem,
		completeItem,
		reopenItem,
		touchItem,
		replyItem,
		addNote,
		deleteActivity,
		deleteItem,
		restoreItem,
		purgeItem,
		emptyTrash,
		reorderItems,
		counts,
		listPocs,
		getPoc,
		createPoc,
		updatePoc,
		setPocStatus,
		deletePoc,
		addPocAdmin,
		updatePocAdmin,
		deletePocAdmin,
		listAccounts,
		getAccount,
		stats,
		applyHubspotDeal,
		listWeeks,
		getWeek,
		search,
		suggestions,
		housekeeping,
		dueReminders,
		markNotified,
	};
}
