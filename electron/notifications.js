// Avisos nativos: uno por cada tarea con recordatorio cuando llega su hora, y un resumen diario a la hora
// de los ajustes con lo de hoy (incluidos los follow-ups que toca volver a perseguir, las PoCs sin movimiento y las
// fechas límite de RFP de los próximos días).

import { Notification } from 'electron';

const pad = (n) => String(n).padStart(2, '0');
const names = (items) => {
	const list = [...new Set(items.map((i) => i.company ?? i.poc_name ?? i.title))];
	return list.length > 3 ? `${list.slice(0, 3).join(', ')} y ${list.length - 3} más` : list.join(', ');
};

/** «Acme (entrega hoy)», «Beta (preguntas en 2 días)», «Gamma (entrega vencida)». */
const deadlineLabel = (d) => {
	const what = d.what === 'questions' ? 'preguntas' : 'entrega';
	const when = d.days < 0 ? 'vencida' : d.days === 0 ? 'hoy' : d.days === 1 ? 'mañana' : `en ${d.days} días`;
	return `${d.name} (${what} ${when})`;
};

export function digestText(items, stale = [], deadlines = []) {
	const chase = items.filter((i) => i.state === 'waiting');
	const fups = items.filter((i) => i.state !== 'waiting' && i.category === 'followup');
	const rest = items.filter((i) => i.state !== 'waiting' && i.category !== 'followup');
	const parts = [];
	if (chase.length) parts.push(`Volver a perseguir: ${names(chase)}`);
	if (fups.length) parts.push(`Follow-ups: ${names(fups)}`);
	if (rest.length) parts.push(`${rest.length} ${rest.length === 1 ? 'tarea' : 'tareas'}`);
	if (deadlines.length) {
		const list = deadlines.map(deadlineLabel);
		parts.push(`RFPs: ${list.length > 3 ? `${list.slice(0, 3).join(', ')} y ${list.length - 3} más` : list.join(', ')}`);
	}
	if (stale.length) parts.push(`PoCs sin movimiento: ${names(stale.map((p) => ({ title: p.name })))}`);
	return {
		title: items.length
			? `Hoy: ${items.length} ${items.length === 1 ? 'pendiente' : 'pendientes'}`
			: deadlines.length
				? 'RFPs con entrega próxima'
				: 'PoCs sin movimiento',
		body: parts.join(' · '),
	};
}

export function startNotifications({ repo, onChange, actions }) {
	const live = new Set(); // referencias vivas: si el recolector se lleva la notificación, el clic no llega

	function show({ title, body, onClick }) {
		if (!Notification.isSupported()) return;
		const n = new Notification({ title, body });
		live.add(n);
		n.on('click', () => {
			onClick?.();
			live.delete(n);
		});
		n.on('close', () => live.delete(n));
		n.show();
	}

	function tick() {
		if (repo.housekeeping()) onChange();

		for (const item of repo.dueReminders()) {
			repo.markNotified(item.id);
			show({
				title: item.title,
				body: [item.poc_name ?? item.company, item.contact].filter(Boolean).join(' · ') || 'Recordatorio de Notes Desk',
				onClick: () => actions.openItem(item.id),
			});
		}

		const settings = repo.getSettings();
		const today = repo.today();
		const now = new Date();
		const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
		if (settings.digest_last !== today && hhmm >= settings.digest_time) {
			repo.setSettings({ digest_last: today });
			const { items } = repo.listItems('today');
			const stale = repo.stalePocs();
			const deadlines = repo.rfpDeadlines();
			if (items.length || stale.length || deadlines.length) {
				show({ ...digestText(items, stale, deadlines), onClick: () => actions.showMain('today') });
			}
		}
	}

	tick();
	const timer = setInterval(tick, 30_000);
	return { stop: () => clearInterval(timer), tick };
}
