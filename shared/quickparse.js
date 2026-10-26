// Parser de la captura rápida: "FUP Catalina BCI el viernes #fup @Cafam !"
//   #fup / #tarea / #poc   → categoría
//   @Cafam                 → la PoC cuyo nombre (o empresa) empieza así; @"Corporación América" con espacios
//   !                      → destacada
//   fechas en español      → "mañana", "pasado mañana", "el viernes", "en 3 días", "30 oct", "lunes 10:00",
//                            "la semana que viene"… Con hora, además, crea un recordatorio.
// Lo que queda es el título. También detecta una empresa conocida si aparece en el texto.

import * as chrono from 'chrono-node';
import { addDays, nextDow, toDateStr, toDateTimeStr } from './dates.js';

const CATEGORY_TAGS = {
	fup: 'followup',
	followup: 'followup',
	'follow-up': 'followup',
	seguimiento: 'followup',
	tarea: 'task',
	task: 'task',
	todo: 'task',
	poc: 'poc',
};

const FUP_START = /^\s*(fup|follow[- ]?up|seguimiento)\b/i;
const WEEKDAYS = { lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 7 };
// Palabras que suelen ir delante de una fecha y que no deben quedarse en el título.
const CONNECTOR_BEFORE = /(?:^|\s)(?:para el día|para el|para|el día|el|antes del|hasta el|a partir del)\s*$/i;

export const fold = (s) =>
	String(s ?? '')
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase();

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function cut(text, index, length) {
	let before = text.slice(0, index);
	const m = before.match(CONNECTOR_BEFORE);
	if (m) before = before.slice(0, before.length - m[0].length);
	return `${before} ${text.slice(index + length)}`;
}

/** Fechas que chrono no entiende (o entiende mal) en castellano. */
function customDate(text, today) {
	const rules = [
		[/pasado\s+mañana/i, () => addDays(today, 2)],
		[/(?:la\s+)?(?:semana\s+que\s+viene|pr[oó]xima\s+semana)/i, () => nextDow(today, 1)],
		[
			/\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+que\s+viene\b/i,
			(m) => nextDow(today, WEEKDAYS[fold(m[1])]),
		],
	];
	for (const [re, fn] of rules) {
		const m = text.match(re);
		if (m) return { date: fn(m), index: m.index, length: m[0].length };
	}
	return null;
}

/**
 * @param {string} text
 * @param {{ now?: Date, pocs?: {id:number,name:string,company?:string|null,color?:string|null}[], companies?: string[] }} [opts]
 */
export function parseQuick(text, { now = new Date(), pocs = [], companies = [] } = {}) {
	const out = {
		title: '',
		category: null,
		pocId: null,
		pocName: null,
		pocColor: null,
		dueDate: null,
		remindAt: null,
		flagged: false,
		company: null,
	};
	let rest = ` ${text ?? ''} `;
	const today = toDateStr(now);

	rest = rest.replace(/(^|\s)#([\p{L}-]+)(?=\s)/gu, (all, sp, tag) => {
		const cat = CATEGORY_TAGS[fold(tag)];
		if (!cat) return all;
		out.category = cat;
		return sp;
	});

	rest = rest.replace(/(^|\s)@(?:"([^"]+)"|([\p{L}\p{N}.-]+))(?=\s)/gu, (all, sp, quoted, word) => {
		const q = fold(quoted ?? word);
		const poc =
			pocs.find((p) => fold(p.name) === q) ??
			pocs.find((p) => fold(p.name).startsWith(q)) ??
			pocs.find((p) => p.company && fold(p.company).startsWith(q)) ??
			pocs.find((p) => fold(p.name).includes(q));
		if (!poc) return all;
		out.pocId = poc.id;
		out.pocName = poc.name;
		out.pocColor = poc.color ?? null;
		out.category = 'poc';
		return sp;
	});

	rest = rest.replace(/(^|\s)!{1,3}(?=\s)/g, (all, sp) => {
		out.flagged = true;
		return sp;
	});

	const custom = customDate(rest, today);
	if (custom) {
		out.dueDate = custom.date;
		rest = cut(rest, custom.index, custom.length);
	} else {
		const [hit] = chrono.es.parse(rest, now, { forwardDate: true });
		if (hit) {
			const d = hit.start.date();
			out.dueDate = toDateStr(d);
			if (hit.start.isCertain('hour')) {
				d.setSeconds(0, 0);
				out.remindAt = toDateTimeStr(d);
			}
			rest = cut(rest, hit.index, hit.text.length);
		}
	}

	const title = rest
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/^[,;:–-]+\s*|\s*[,;:–-]+$/g, '');
	out.title = title;

	const folded = fold(title);
	const known = [...companies].sort((a, b) => b.length - a.length);
	for (const c of known) {
		if (c && new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(fold(c))}($|[^\\p{L}\\p{N}])`, 'u').test(folded)) {
			out.company = c;
			break;
		}
	}

	if (!out.category && FUP_START.test(title)) out.category = 'followup';
	return out;
}
