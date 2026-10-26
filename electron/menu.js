// Menú de la app en castellano. ⌘N y ⌘, pasan por aquí; el resto de atajos (⌘K, ⌘1-7, ⌘T…) los maneja la UI.

import { app, Menu } from 'electron';

export function buildMenu({ dev, navigate, quickCapture }) {
	return Menu.buildFromTemplate([
		{
			label: app.name,
			submenu: [
				{ role: 'about', label: 'Acerca de Zepo Desk' },
				{ type: 'separator' },
				{ label: 'Ajustes…', accelerator: 'Cmd+,', click: () => navigate('settings') },
				{ type: 'separator' },
				{ role: 'hide', label: 'Ocultar Zepo Desk' },
				{ role: 'hideOthers', label: 'Ocultar otros' },
				{ role: 'unhide', label: 'Mostrar todo' },
				{ type: 'separator' },
				{ role: 'quit', label: 'Salir de Zepo Desk' },
			],
		},
		{
			label: 'Archivo',
			submenu: [
				{ label: 'Nueva tarea', accelerator: 'Cmd+N', click: () => navigate('new') },
				{ label: 'Captura rápida', click: quickCapture },
				{ type: 'separator' },
				{ role: 'close', label: 'Cerrar ventana' },
			],
		},
		{
			label: 'Edición',
			submenu: [
				{ role: 'undo', label: 'Deshacer' },
				{ role: 'redo', label: 'Rehacer' },
				{ type: 'separator' },
				{ role: 'cut', label: 'Cortar' },
				{ role: 'copy', label: 'Copiar' },
				{ role: 'paste', label: 'Pegar' },
				{ role: 'selectAll', label: 'Seleccionar todo' },
			],
		},
		{
			label: 'Visualización',
			submenu: [
				{ label: 'Hoy', accelerator: 'Cmd+1', click: () => navigate('today') },
				{ type: 'separator' },
				...(dev ? [{ role: 'reload', label: 'Recargar' }, { role: 'toggleDevTools', label: 'Herramientas de desarrollo' }, { type: 'separator' }] : []),
				{ role: 'resetZoom', label: 'Tamaño real' },
				{ role: 'zoomIn', label: 'Ampliar' },
				{ role: 'zoomOut', label: 'Reducir' },
				{ type: 'separator' },
				{ role: 'togglefullscreen', label: 'Pantalla completa' },
			],
		},
		{ role: 'windowMenu', label: 'Ventana' },
	]);
}
