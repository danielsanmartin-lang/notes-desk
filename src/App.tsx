import {
	closestCenter,
	DndContext,
	DragOverlay,
	PointerSensor,
	pointerWithin,
	useSensor,
	useSensors,
	type CollisionDetection,
	type DragEndEvent,
	type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useActions, useItem, useSuggestions, useToday } from './api/hooks';
import type { Item, ItemList } from './api/types';
import { CommandPalette } from './components/CommandPalette';
import { DetailPanel } from './components/DetailPanel';
import { Sidebar, type DropTarget } from './components/Sidebar';
import { zd } from './lib/bridge';
import { useItemOps } from './lib/ops';
import { useUI, type View } from './lib/store';
import { AccountsView, AccountView } from './views/AccountViews';
import { FollowUpsView, TasksView, TodayView, TrashView, UpcomingView } from './views/ListViews';
import { ClosedPocsView, ClosedRfpsView, NewPocDialog, PocsView, PocView, RfpsView } from './views/PocViews';
import { SettingsView } from './views/SettingsView';
import { StatsView } from './views/StatsView';
import { WeeksView } from './views/WeeksView';

const NAV: View[] = [
	{ kind: 'today' },
	{ kind: 'upcoming' },
	{ kind: 'followups' },
	{ kind: 'tasks' },
	{ kind: 'pocs' },
	{ kind: 'accounts' },
	{ kind: 'stats' },
	{ kind: 'weeks' },
	{ kind: 'trash' },
];
const COMPOSER_VIEWS = new Set(['today', 'upcoming', 'followups', 'tasks', 'poc', 'account']);

function CurrentView({ view }: { view: View }) {
	switch (view.kind) {
		case 'today':
			return <TodayView />;
		case 'upcoming':
			return <UpcomingView />;
		case 'followups':
			return <FollowUpsView />;
		case 'tasks':
			return <TasksView />;
		case 'pocs':
			return <PocsView />;
		case 'pocs-closed':
			return <ClosedPocsView />;
		case 'rfps':
			return <RfpsView />;
		case 'rfps-closed':
			return <ClosedRfpsView />;
		case 'poc':
			return <PocView key={view.id} id={view.id} />;
		case 'accounts':
			return <AccountsView />;
		case 'account':
			return <AccountView key={view.name} name={view.name} />;
		case 'stats':
			return <StatsView />;
		case 'weeks':
			return <WeeksView week={view.week} />;
		case 'trash':
			return <TrashView />;
		case 'settings':
			return <SettingsView />;
	}
}

// Las PoCs y categorías de la barra lateral ganan si el puntero está encima; si no, se reordena la lista.
const collision: CollisionDetection = (args) => {
	const sidebar = pointerWithin(args).filter((c) => String(c.id).startsWith('drop-'));
	if (sidebar.length) return sidebar;
	return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => !String(c.id).startsWith('drop-')) });
};

export function App() {
	const view = useUI((s) => s.view);
	const selectedId = useUI((s) => s.selectedId);
	const qc = useQueryClient();
	const a = useActions();
	const ops = useItemOps();
	const today = useToday();
	const { data: sugg } = useSuggestions();
	const { data: selected } = useItem(selectedId);
	const selectedRef = useRef<Item | undefined>(undefined);
	selectedRef.current = selected?.item;
	const [dragItem, setDragItem] = useState<Item | null>(null);
	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

	// A medianoche cambia "hoy": se recalculan las listas.
	useEffect(() => {
		qc.invalidateQueries({ queryKey: ['items'] });
		qc.invalidateQueries({ queryKey: ['counts'] });
	}, [today, qc]);

	useEffect(() => {
		if (!zd) return;
		const st = useUI.getState;
		const offOpen = zd.onOpenItem((id) => st().select(id));
		const offNav = zd.onNavigate((target) => {
			if (target === 'settings') st().go({ kind: 'settings' });
			if (target === 'today') st().go({ kind: 'today' });
			if (target === 'new') {
				if (!COMPOSER_VIEWS.has(st().view.kind)) st().go({ kind: 'tasks' });
				setTimeout(st().focusComposer, 60);
			}
		});
		return () => {
			offOpen();
			offNav();
		};
	}, []);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement;
			const typing = !!target.closest?.('input, textarea, select, [contenteditable="true"]');
			const meta = e.metaKey || e.ctrlKey;
			const st = useUI.getState();
			const key = e.key.toLowerCase();

			if (meta && key === 'k') {
				e.preventDefault();
				st.setPaletteOpen(!st.paletteOpen);
				return;
			}
			if (st.paletteOpen) return;
			if (meta && key === 'n') {
				e.preventDefault();
				if (!COMPOSER_VIEWS.has(st.view.kind)) st.go({ kind: 'tasks' });
				setTimeout(st.focusComposer, 40);
				return;
			}
			if (meta && e.key === ',') {
				e.preventDefault();
				st.go({ kind: 'settings' });
				return;
			}
			if (meta && /^[1-9]$/.test(e.key)) {
				e.preventDefault();
				st.go(NAV[Number(e.key) - 1]);
				return;
			}
			if (typing) {
				if (e.key === 'Escape') target.blur();
				return;
			}
			if (document.querySelector('[role="dialog"], [role="menu"]')) return;
			if (e.key === 'Escape' && st.selectedId != null) {
				st.select(null);
				return;
			}
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				const ids = st.listIds;
				if (!ids.length) return;
				e.preventDefault();
				const idx = st.selectedId == null ? -1 : ids.indexOf(st.selectedId);
				const next = e.key === 'ArrowDown' ? Math.min(ids.length - 1, idx + 1) : idx <= 0 ? 0 : idx - 1;
				st.select(ids[next]);
				return;
			}
			const item = selectedRef.current;
			if (!item) return;
			if (e.key === ' ') {
				e.preventDefault();
				ops.toggle(item);
			} else if (meta && key === 't' && item.category !== 'task' && item.state !== 'done') {
				e.preventDefault();
				st.setTouchOpen(true);
			} else if ((meta && e.key === 'Backspace') || e.key === 'Delete') {
				e.preventDefault();
				ops.remove(item);
				st.select(null);
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [ops]);

	const onDragStart = ({ active }: DragStartEvent) => setDragItem((active.data.current?.item as Item) ?? null);

	const onDragEnd = async ({ active, over }: DragEndEvent) => {
		setDragItem(null);
		const item = active.data.current?.item as Item | undefined;
		if (!item || !over) return;
		const target = over.data.current?.target as DropTarget | undefined;
		if (target) {
			if (item.parent_id) return void toast.error('Mueve la tarea madre, no la subtarea');
			if (target.category === item.category && (target.poc_id ?? null) === item.poc_id) return;
			await a.update(item.id, { category: target.category, poc_id: target.poc_id ?? null });
			toast.success(`Movida a ${target.label}`, { description: item.title });
			return;
		}
		const from = active.data.current;
		const to = over.data.current;
		if (!from?.reorderable || !to?.item || from.listKey !== to.listKey || active.id === over.id) return;
		const ids: string[] = from.sortable.items.map(String);
		const ordered = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))).map((s) => Number(s.slice(5)));
		if (from.queryKey) {
			qc.setQueryData<ItemList>(from.queryKey, (old) =>
				old ? { ...old, items: ordered.map((id) => old.items.find((i) => i.id === id)).filter((i): i is Item => !!i) } : old,
			);
		}
		a.reorder(ordered);
	};

	return (
		<DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragItem(null)}>
			<div className="flex h-full">
				<Sidebar />
				<main className="flex min-w-0 flex-1 flex-col bg-bg">
					<CurrentView view={view} />
				</main>
				<AnimatePresence>{selectedId != null && <DetailPanel key="detail" id={selectedId} />}</AnimatePresence>
			</div>
			<DragOverlay dropAnimation={null}>
				{dragItem && (
					<div className="max-w-80 truncate rounded-xl border border-line bg-raised px-3 py-2 text-[13px] shadow-float">{dragItem.title}</div>
				)}
			</DragOverlay>
			<CommandPalette />
			<NewPocDialog />
			<datalist id="zd-companies">
				{sugg?.companies.map((c) => (
					<option key={c} value={c} />
				))}
			</datalist>
			<datalist id="zd-owners">
				{sugg?.owners.map((o) => (
					<option key={o} value={o} />
				))}
			</datalist>
			<datalist id="zd-partners">
				{sugg?.partners.map((o) => (
					<option key={o} value={o} />
				))}
			</datalist>
			<datalist id="zd-contacts">
				{sugg?.contacts.map((c) => (
					<option key={c.value} value={c.value}>
						{c.company ?? ''}
					</option>
				))}
			</datalist>
		</DndContext>
	);
}
