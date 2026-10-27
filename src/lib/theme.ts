// Modo claro/oscuro y tema visual. index.html ya pinta la ventana con el último tema; aquí se aplica el de
// Ajustes y se sigue al sistema (o a Electron, que lo fija con nativeTheme) cuando el modo es «Sistema».

import { useEffect, useSyncExternalStore } from 'react';
import { themeById } from '../../shared/themes.js';
import { useSettings } from '../api/hooks';
import type { Appearance } from '../api/types';

const media = window.matchMedia('(prefers-color-scheme: dark)');
const systemDark = () => media.matches;
const onSystemChange = (cb: () => void) => {
	media.addEventListener('change', cb);
	return () => media.removeEventListener('change', cb);
};

export type Mode = 'light' | 'dark';
export const modeFor = (appearance: Appearance, dark = systemDark()): Mode => (appearance === 'system' ? (dark ? 'dark' : 'light') : appearance);

/** Modo que se ve ahora con ese ajuste (cambia solo si el sistema pasa a oscuro y el ajuste es «Sistema»). */
export function useMode(appearance: Appearance): Mode {
	return modeFor(appearance, useSyncExternalStore(onSystemChange, systemDark));
}

function apply(mode: Mode, themeId: string) {
	const root = document.documentElement;
	const vars = themeById(themeId)[mode] as Record<string, string>;
	root.dataset.mode = mode;
	for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
	try {
		localStorage.setItem('zd-theme', JSON.stringify({ mode, vars }));
	} catch {
		// Sin almacenamiento solo se pierde evitar el destello al abrir.
	}
}

/** Aplica el modo y el tema de Ajustes y los mantiene al día (en la ventana principal y en la captura rápida). */
export function ThemeSync() {
	const { data } = useSettings();
	const appearance = data?.appearance ?? 'system';
	const mode = useMode(appearance);
	const theme = data?.theme;
	useEffect(() => {
		if (theme) apply(mode, theme);
	}, [mode, theme]);
	return null;
}
