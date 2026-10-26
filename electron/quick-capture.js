// Ventana flotante de captura rápida, estilo Spotlight. Aparece en la pantalla donde está el ratón y se
// esconde al perder el foco, devolviendo el foco a la app de la que venías.

import { app, BrowserWindow, screen } from 'electron';

const WIDTH = 680;
const HEIGHT = 190;

export function createQuickCapture({ baseUrl, webPreferences, isMainVisible }) {
	let win = null;

	function create() {
		win = new BrowserWindow({
			width: WIDTH,
			height: HEIGHT,
			show: false,
			frame: false,
			transparent: true,
			backgroundColor: '#00000000',
			resizable: false,
			minimizable: false,
			maximizable: false,
			fullscreenable: false,
			skipTaskbar: true,
			hasShadow: false,
			alwaysOnTop: true,
			webPreferences,
		});
		win.setAlwaysOnTop(true, 'floating');
		win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
		win.loadURL(`${baseUrl}/#/quick`);
		win.on('blur', hide);
	}

	function show() {
		if (!win || win.isDestroyed()) create();
		const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
		win.setPosition(Math.round(workArea.x + (workArea.width - WIDTH) / 2), Math.round(workArea.y + workArea.height * 0.2));
		const reveal = () => {
			win.show();
			win.focus();
			win.webContents.send('zd:quick-shown');
		};
		if (win.webContents.isLoading()) win.webContents.once('did-finish-load', reveal);
		else reveal();
	}

	function hide() {
		if (!win || win.isDestroyed() || !win.isVisible()) return;
		win.hide();
		// Sin la ventana principal a la vista, ocultar la app devuelve el foco a la app anterior.
		if (!isMainVisible()) app.hide();
	}

	return {
		show,
		hide,
		toggle: () => (win && !win.isDestroyed() && win.isVisible() ? hide() : show()),
		owns: (webContents) => !!win && !win.isDestroyed() && win.webContents === webContents,
	};
}
