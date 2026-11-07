// Proceso principal: abre la base de datos, arranca el servidor HTTP embebido (127.0.0.1, puerto libre y token
// por sesión) y monta la ventana principal, la captura rápida (⌥Espacio), el icono de la barra de menús y los
// avisos. Cerrar la ventana no cierra la app: sigue en la barra de menús hasta ⌘Q.

import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeTheme, shell } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { backupDaily, copyDb, openDb } from '../server/db.js';
import { createDocuments } from '../server/documents.js';
import { startServer } from '../server/index.js';
import { createRepo } from '../server/repo.js';
import { themeById } from '../shared/themes.js';
import { buildMenu } from './menu.js';
import { startNotifications } from './notifications.js';
import { createQuickCapture } from './quick-capture.js';
import { createTray } from './tray.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
// npm run dev: la UI viene de Vite (:5173) y el servidor escucha en :4100 sin token.
const DEV = !app.isPackaged && process.env.ZD_DEV === '1';

app.setName('Notes Desk');
if (!app.requestSingleInstanceLock()) app.exit(0);

let mainWindow = null;
let quitting = false;
let ctx = null;

function databasePath() {
	if (process.env.NOTES_DESK_DB) return path.resolve(process.env.NOTES_DESK_DB);
	return app.isPackaged ? path.join(app.getPath('userData'), 'notes-desk.db') : path.join(root, 'data', 'dev.db');
}

// Hasta la 1.5.0 la app tenía otro nombre y guardaba sus datos en otra carpeta: la primera vez se copian aquí
// (la carpeta antigua no se toca).
const LEGACY_DB = ['Zepo Desk', 'zepo-desk.db'];
async function adoptLegacyData(dbPath) {
	if (!app.isPackaged || process.env.NOTES_DESK_DB || fs.existsSync(dbPath)) return;
	const legacy = path.join(app.getPath('appData'), ...LEGACY_DB);
	if (!fs.existsSync(legacy)) return;
	fs.mkdirSync(path.dirname(dbPath), { recursive: true });
	await copyDb(legacy, dbPath);
}

// ── Tamaño y posición de la ventana entre sesiones ──
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
function loadBounds() {
	try {
		return JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
	} catch {
		return { width: 1240, height: 800 };
	}
}
function saveBounds() {
	if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isFullScreen()) return;
	try {
		fs.writeFileSync(stateFile(), JSON.stringify(mainWindow.getBounds()));
	} catch {
		// No es grave: la próxima vez se abre con el tamaño por defecto.
	}
}

const webPreferences = () => ({
	preload: path.join(here, 'preload.cjs'),
	contextIsolation: true,
	sandbox: true,
	nodeIntegration: false,
});

function createMainWindow({ show = true } = {}) {
	mainWindow = new BrowserWindow({
		...loadBounds(),
		minWidth: 920,
		minHeight: 600,
		show: false,
		titleBarStyle: 'hiddenInset',
		trafficLightPosition: { x: 16, y: 17 },
		vibrancy: 'sidebar',
		visualEffectState: 'followWindow',
		backgroundColor: '#00000000',
		webPreferences: webPreferences(),
	});
	mainWindow.loadURL(ctx.baseUrl);
	if (show) mainWindow.once('ready-to-show', () => mainWindow.show());
	mainWindow.on('close', (e) => {
		saveBounds();
		if (!quitting) {
			e.preventDefault();
			mainWindow.hide();
		}
	});
	mainWindow.on('resized', saveBounds);
	mainWindow.on('moved', saveBounds);
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		openExternal(url);
		return { action: 'deny' };
	});
	mainWindow.webContents.on('will-navigate', (e, url) => {
		if (!url.startsWith(ctx.baseUrl)) {
			e.preventDefault();
			openExternal(url);
		}
	});
}

function showMain(view) {
	if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
	if (mainWindow.isMinimized()) mainWindow.restore();
	mainWindow.show();
	mainWindow.focus();
	if (view) mainWindow.webContents.send('zd:navigate', view);
}

function openItem(id) {
	showMain();
	const send = () => mainWindow.webContents.send('zd:open-item', id);
	if (mainWindow.webContents.isLoading()) mainWindow.webContents.once('did-finish-load', send);
	else send();
}

function openExternal(url) {
	if (/^(https?:|mailto:|whatsapp:|tel:)/i.test(url)) shell.openExternal(url);
}

function applySettings() {
	const s = ctx.repo.getSettings();
	// Claro/oscuro para toda la app: también cambia el material translúcido de la barra lateral.
	nativeTheme.themeSource = s.appearance;
	globalShortcut.unregisterAll();
	if (s.shortcut && !globalShortcut.register(s.shortcut, () => ctx.quick.toggle())) {
		console.warn(`No se pudo registrar el atajo ${s.shortcut}: lo usa otra app`);
	}
	if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: s.open_at_login });
	ctx.tray.refresh();
}

/** Modo y colores del tema para pintar la ventana ya con ellos, sin destello (los aplica index.html). */
function initialTheme() {
	if (!ctx) return null;
	const mode = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
	return { mode, vars: themeById(ctx.repo.getSettings().theme)[mode] };
}

ipcMain.on('zd:init', (e) => {
	e.returnValue = { token: ctx?.token ?? null, window: ctx?.quick.owns(e.sender) ? 'quick' : 'main', theme: initialTheme() };
});
ipcMain.on('zd:open-item', (_e, id) => {
	ctx.quick.hide();
	openItem(Number(id));
});
ipcMain.on('zd:close-quick', () => ctx.quick.hide());
ipcMain.on('zd:open-external', (_e, url) => openExternal(String(url)));
ipcMain.on('zd:show-in-folder', (_e, file) => {
	if (file === ctx.dbPath) shell.showItemInFolder(file);
});
// Documentos de una RFP: la ruta la resuelve documents (nunca sale de la carpeta de esa RFP).
const onDocument = (fn) => (_e, pocId, name) => {
	try {
		fn(ctx.documents.pathOf(pocId, name));
	} catch (err) {
		console.warn('Documento', err.message);
	}
};
ipcMain.on('zd:open-document', onDocument((file) => shell.openPath(file)));
ipcMain.on('zd:reveal-document', onDocument((file) => shell.showItemInFolder(file)));
ipcMain.on('zd:open-documents-folder', (_e, pocId) => {
	try {
		const dir = ctx.documents.folder(pocId);
		fs.mkdirSync(dir, { recursive: true });
		shell.openPath(dir);
	} catch (err) {
		console.warn('Carpeta de documentos', err.message);
	}
});

app.on('second-instance', () => showMain());
app.on('activate', () => showMain());
app.on('before-quit', () => {
	quitting = true;
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => {
	// Se queda en la barra de menús.
});

app.whenReady().then(async () => {
	const dbPath = databasePath();
	await adoptLegacyData(dbPath).catch((e) => console.error('Datos de la versión anterior', e));
	const db = openDb(dbPath);
	const repo = createRepo(db);
	repo.housekeeping();
	const backupsDir = path.join(path.dirname(dbPath), 'backups');
	const token = DEV ? null : crypto.randomBytes(24).toString('hex');
	// Documentación de las RFPs, junto a la base. Quitar un documento lo manda a la Papelera de macOS.
	const documents = createDocuments(path.join(path.dirname(dbPath), 'documentos'), { trash: (file) => shell.trashItem(file) });
	const server = await startServer({
		repo,
		documents,
		port: DEV ? 4100 : 0,
		token,
		staticDir: path.join(root, 'dist'),
		meta: { dbPath, backupsDir, version: app.getVersion(), dev: !app.isPackaged },
	});
	ctx = { repo, documents, token, dbPath, baseUrl: DEV ? 'http://localhost:5173' : `http://127.0.0.1:${server.port}` };

	const backup = () => backupDaily(db, backupsDir, repo.today()).catch((e) => console.error('Backup', e));
	backup();
	setInterval(backup, 60 * 60 * 1000);

	const actions = {
		showMain,
		openItem,
		quickCapture: () => ctx.quick.show(),
		quit: () => app.quit(),
	};
	ctx.quick = createQuickCapture({
		baseUrl: ctx.baseUrl,
		webPreferences: webPreferences(),
		isMainVisible: () => !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !mainWindow.isMinimized(),
	});
	ctx.tray = createTray({ repo, iconPath: path.join(root, 'build', 'tray', 'trayTemplate.png'), actions });
	Menu.setApplicationMenu(buildMenu({ dev: !app.isPackaged, navigate: (v) => showMain(v), quickCapture: actions.quickCapture }));

	const notifyChange = () => server.bus.emit('change', { client: 'main', path: '/main' });
	startNotifications({ repo, onChange: notifyChange, actions });

	let refreshTimer = null;
	server.bus.on('change', (e) => {
		if (e.path === '/settings') applySettings();
		clearTimeout(refreshTimer);
		refreshTimer = setTimeout(() => ctx.tray.refresh(), 250);
	});
	setInterval(() => ctx.tray.refresh(), 60_000);

	// Abierta al iniciar sesión: se queda en la barra de menús sin sacar la ventana.
	const atLogin = app.isPackaged && app.getLoginItemSettings().wasOpenedAtLogin;
	createMainWindow({ show: !atLogin });
	applySettings();
});
