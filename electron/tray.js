// Icono de la barra de menús: número de pendientes de hoy y la lista para abrir cualquiera con un clic.
// También pone ese número en el globo del Dock.

import { app, Menu, nativeImage, Tray } from 'electron';

const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function createTray({ repo, iconPath, actions }) {
	const image = nativeImage.createFromPath(iconPath);
	image.setTemplateImage(true);
	const tray = new Tray(image);
	tray.setToolTip('Notes Desk');

	function refresh() {
		const { items } = repo.listItems('today');
		const settings = repo.getSettings();
		const n = items.length;
		tray.setTitle(n ? ` ${n}` : '', { fontType: 'monospacedDigit' });
		app.dock?.setBadge(n ? String(n) : '');

		const list = items.slice(0, 12).map((i) => ({
			label: truncate(`${i.state === 'waiting' ? '⏳ ' : ''}${i.title}`, 52),
			sublabel: [i.poc_name ?? i.company, i.contact].filter(Boolean).join(' · ') || undefined,
			click: () => actions.openItem(i.id),
		}));
		tray.setContextMenu(
			Menu.buildFromTemplate([
				{ label: n ? `Hoy · ${n} ${n === 1 ? 'pendiente' : 'pendientes'}` : 'Nada pendiente para hoy', enabled: false },
				...list,
				...(items.length > list.length ? [{ label: `y ${items.length - list.length} más…`, click: () => actions.showMain('today') }] : []),
				{ type: 'separator' },
				{ label: 'Nueva tarea…', accelerator: settings.shortcut || undefined, click: actions.quickCapture },
				{ label: 'Abrir Notes Desk', click: () => actions.showMain() },
				{ type: 'separator' },
				{ label: 'Salir de Notes Desk', click: actions.quit },
			]),
		);
	}

	refresh();
	return { refresh, destroy: () => tray.destroy() };
}
