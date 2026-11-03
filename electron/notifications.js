// Avisos nativos: uno por cada tarea con recordatorio cuando llega su hora, y un resumen diario a la hora
// de los ajustes con lo de hoy (incluidos los follow-ups que toca volver a perseguir).

import { Notification } from 'electron';

const pad = (n) => String(n).padStart(2, '0');
const names = (items) => {
	const list = [...new Set(items.map((i) => i.company ?? i.poc_name ?? i.title))];
	return list.length > 3 ? `${list.slice(0, 3).join(', ')} y ${list.length - 3} más` : list.join(', ');
};

export function digestText(items) {
	const chase = items.filter((i) => i.state === 'waiting');
	const fups = items.filter((i) => i.state !== 'waiting' && i.category === 'followup');
	const rest = items.filter((i) => i.state !== 'waiting' && i.category !== 'followup');
	const parts = [];
	if (chase.length) parts.push(`Volver a perseguir: ${names(chase)}`);
	if (fups.length) parts.push(`Follow-ups: ${names(fups)}`);
	if (rest.length) parts.push(`${rest.length} ${rest.length === 1 ? 'tarea' : 'tareas'}`);
	return {
		title: `Hoy: ${items.length} ${items.length === 1 ? 'pendiente' : 'pendientes'}`,
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
			if (items.length) show({ ...digestText(items), onClick: () => actions.showMain('today') });
		}
	}

	tick();
	const timer = setInterval(tick, 30_000);
	return { stop: () => clearInterval(timer), tick };
}
