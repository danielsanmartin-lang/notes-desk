// Puente mínimo entre la UI y el proceso principal. La UI habla con los datos por HTTP (server/); aquí solo
// van el token de sesión y los gestos nativos: abrir una tarea, cerrar la captura rápida, abrir enlaces.

const { contextBridge, ipcRenderer } = require('electron');

const init = ipcRenderer.sendSync('zd:init');

const on = (channel) => (cb) => {
	const handler = (_event, value) => cb(value);
	ipcRenderer.on(channel, handler);
	return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('zd', {
	token: init.token,
	window: init.window,
	onOpenItem: on('zd:open-item'),
	onNavigate: on('zd:navigate'),
	onQuickShown: on('zd:quick-shown'),
	closeQuick: () => ipcRenderer.send('zd:close-quick'),
	openItem: (id) => ipcRenderer.send('zd:open-item', id),
	showInFolder: (file) => ipcRenderer.send('zd:show-in-folder', file),
	openExternal: (url) => ipcRenderer.send('zd:open-external', url),
});
