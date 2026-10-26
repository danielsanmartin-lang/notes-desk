import { create } from 'zustand';

export type View =
	| { kind: 'today' }
	| { kind: 'upcoming' }
	| { kind: 'followups' }
	| { kind: 'tasks' }
	| { kind: 'pocs' }
	| { kind: 'poc'; id: number }
	| { kind: 'weeks'; week?: string }
	| { kind: 'trash' }
	| { kind: 'settings' };

const VIEW_KEY = 'zd.view';

function loadView(): View {
	try {
		const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? 'null');
		if (v && typeof v.kind === 'string') return v;
	} catch {
		// Sin almacenamiento: se empieza en Hoy.
	}
	return { kind: 'today' };
}

interface UIState {
	view: View;
	selectedId: number | null;
	paletteOpen: boolean;
	touchOpen: boolean;
	replyOpen: boolean;
	newPocOpen: boolean;
	/** Ids visibles en la lista actual, en orden, para moverse con ↑ ↓. */
	listIds: number[];
	/** Cambia para pedir foco en el campo de nueva tarea de la vista. */
	composerFocus: number;
	go: (view: View) => void;
	select: (id: number | null) => void;
	setPaletteOpen: (open: boolean) => void;
	setTouchOpen: (open: boolean) => void;
	setReplyOpen: (open: boolean) => void;
	setNewPocOpen: (open: boolean) => void;
	setListIds: (ids: number[]) => void;
	focusComposer: () => void;
}

export const useUI = create<UIState>((set) => ({
	view: loadView(),
	selectedId: null,
	paletteOpen: false,
	touchOpen: false,
	replyOpen: false,
	newPocOpen: false,
	listIds: [],
	composerFocus: 0,
	go: (view) => {
		try {
			localStorage.setItem(VIEW_KEY, JSON.stringify(view));
		} catch {
			// Sin almacenamiento: no se recuerda la vista.
		}
		set({ view, touchOpen: false, replyOpen: false });
	},
	select: (selectedId) => set({ selectedId, touchOpen: false, replyOpen: false }),
	setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
	setTouchOpen: (touchOpen) => set({ touchOpen }),
	setReplyOpen: (replyOpen) => set({ replyOpen }),
	setNewPocOpen: (newPocOpen) => set({ newPocOpen }),
	setListIds: (listIds) => set({ listIds }),
	focusComposer: () => set((s) => ({ composerFocus: s.composerFocus + 1 })),
}));

export const sameView = (a: View, b: View) =>
	a.kind === b.kind && (a.kind !== 'poc' || (b.kind === 'poc' && a.id === b.id));
