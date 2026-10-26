// Lógica de negocio sobre la base de datos: listas, flujo de follow-ups (toques y respuestas),
// PoCs, semanas, búsqueda y ajustes. Todo síncrono (better-sqlite3); el reloj se inyecta para los tests.

import {
	addDays,
	isoWeek,
	isValidDate,
	isValidDateTime,
	isValidWeek,
	skipWeekend,
	toDateStr,
	toDateTimeStr,
	weekRange,
} from '../shared/dates.js';
import { parseHubspotRef } from '../shared/hubspot.js';

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
const TODAY_COND = `${VISIBLE} AND ${ACTIVE_POC} AND ${OPEN}
	AND ((i.due_date IS NOT NULL AND i.due_date <= @today) OR (i.flagged = 1 AND i.parent_id IS NULL))`;
const UPCOMING_COND = `${VISIBLE} AND ${ACTIVE_POC} AND ${OPEN} AND i.due_date > @today AND i.due_date <= @horizon`;
const FOLLOWUPS_COND = `${VISIBLE} AND ${OPEN} AND i.parent_id IS NULL
	AND (i.category = 'followup' OR (@includePoc = 1 AND i.category = 'poc' AND i.state = 'waiting' AND ${ACTIVE_POC}))`;
const TASKS_COND = `${VISIBLE} AND ${OPEN} AND i.parent_id IS NULL AND i.category = 'task'`;

const emptyToNull = (v) => {
	if (v == null) return null;
	const s = String(v).trim();
	return s === '' ? null : s;
};

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

	function listItems(view, { pocId, includePoc = false } = {}) {
		const p = { today: today(), horizon: addDays(today(), 7), week: weekStart(), includePoc: includePoc ? 1 : 0 };
		const q = (where, order) => all(`${ITEM_SELECT} WHERE ${where} ORDER BY ${order}`, p).map(itemOut);
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
			overdue: n(`${VISIBLE} AND ${ACTIVE_POC} AND ${OPEN} AND i.due_date < @today`),
			upcoming: n(UPCOMING_COND),
			followups: n(FOLLOWUPS_COND),
			followups_due: n(`${FOLLOWUPS_COND} AND i.due_date <= @today`),
			tasks: n(TASKS_COND),
			trash: n(`i.deleted_at IS NOT NULL AND (par.id IS NULL OR par.deleted_at IS NULL)`),
			pocs: listPocs().map((x) => pick(x, ['id', 'name', 'color', 'status', 'paused_until', 'total', 'done', 'waiting'])),
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
		  (SELECT COUNT(*) FROM poc_admins pa WHERE pa.poc_id = p.id) AS admin_count
		FROM pocs p`;

	const pocAdmins = (pocId) => all('SELECT * FROM poc_admins WHERE poc_id = @poc ORDER BY sort_order, id', { poc: pocId });

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
		return { poc: { ...poc, next: nextTask(id) }, admins: pocAdmins(id), activity };
	}

	function normalizePoc(data) {
		const out = {};
		if ('name' in data) {
			const n = String(data.name ?? '').trim();
			if (!n) throw bad('La PoC necesita un nombre');
			out.name = n.slice(0, 200);
		}
		for (const k of ['company', 'notes']) if (k in data) out[k] = emptyToNull(data[k]);
		if ('owner' in data) out.owner = emptyToNull(data.owner)?.slice(0, 120) ?? null;
		if ('start_date' in data) {
			const v = emptyToNull(data.start_date);
			if (v && !isValidDate(v)) throw bad('Fecha de inicio no válida');
			out.start_date = v;
		}
		if ('country' in data) {
			const c = emptyToNull(data.country);
			if (c && !/^[A-Za-z]{2}$/.test(c)) throw bad('El país va en dos letras (ES, CO, AR…)');
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

	// ── Admins del cliente en la PoC (los que usarán la plataforma) ──

	function normalizeAdmin(data) {
		const out = {};
		if ('name' in data) {
			const n = String(data.name ?? '').trim();
			if (!n) throw bad('El admin necesita un nombre');
			out.name = n.slice(0, 200);
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
		if (!d.name) throw bad('El admin necesita un nombre');
		const row = {
			email: null,
			role: null,
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
		if (!tokens.length) return { items: [], pocs: [] };
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
			const hay = fold(`${p.name} ${p.company ?? ''} ${p.owner ?? ''} ${admins.get(p.id) ?? ''}`);
			return tokens.every((t) => hay.includes(t));
		});
		return { items, pocs };
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
		return { companies, contacts, owners };
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
