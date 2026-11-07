// Puente con el proceso principal de Electron (electron/preload.cjs). En el navegador (npm run dev:web) no
// existe y todo cae a su equivalente web.

export interface ZdBridge {
	token: string | null;
	window: 'main' | 'quick';
	/** Modo y colores con los que pintar al abrir (los aplica index.html). */
	theme: { mode: 'light' | 'dark'; vars: Record<string, string> } | null;
	onOpenItem(cb: (id: number) => void): () => void;
	onNavigate(cb: (view: string) => void): () => void;
	onQuickShown(cb: () => void): () => void;
	closeQuick(): void;
	openItem(id: number): void;
	showInFolder(path: string): void;
	openExternal(url: string): void;
	/** Documentación de una RFP: abrir con su app, mostrar en Finder o abrir la carpeta. */
	openDocument(pocId: number, name: string): void;
	revealDocument(pocId: number, name: string): void;
	openDocumentsFolder(pocId: number): void;
}

declare global {
	interface Window {
		zd?: ZdBridge;
	}
}

export const zd = window.zd;
export const isElectron = !!window.zd;

export function openExternal(url: string) {
	if (zd) zd.openExternal(url);
	else window.open(url, '_blank', 'noopener');
}
