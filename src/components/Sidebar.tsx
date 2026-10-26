import { useDroppable } from '@dnd-kit/core';
import {
	Archive,
	CalendarDays,
	ChevronRight,
	FlaskConical,
	Pause,
	Plus,
	Search,
	Send,
	Settings,
	SquareCheckBig,
	Sun,
	Trash2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { useCounts } from '../api/hooks';
import type { Category } from '../api/types';
import { isElectron } from '../lib/bridge';
import { cx } from '../lib/format';
import { sameView, useUI, type View } from '../lib/store';
import { PocDot, ProgressRing } from './bits';
import { Logo } from './Logo';
import { Kbd } from './ui';

export interface DropTarget {
	category: Category;
	poc_id?: number;
	label: string;
}

function NavItem({
	view,
	icon,
	label,
	count,
	countTone,
	drop,
	indent,
	right,
	iconClass,
}: {
	view: View;
	icon: ReactNode;
	label: string;
	count?: number;
	countTone?: 'danger' | 'accent';
	drop?: DropTarget;
	indent?: boolean;
	right?: ReactNode;
	iconClass?: string;
}) {
	const current = useUI((s) => s.view);
	const go = useUI((s) => s.go);
	const active = sameView(current, view);
	const { setNodeRef, isOver } = useDroppable({
		id: `drop-${view.kind}-${'id' in view ? view.id : ''}`,
		data: { target: drop },
		disabled: !drop,
	});
	return (
		<button
			ref={setNodeRef}
			type="button"
			onClick={() => go(view)}
			className={cx(
				'group flex h-7.5 w-full items-center gap-2 rounded-lg pr-2 text-left text-[13px] transition-colors',
				indent ? 'pl-7' : 'pl-2',
				active ? 'bg-active font-medium text-fg' : 'text-fg-2 hover:bg-hover hover:text-fg',
				isOver && 'bg-accent-soft ring-2 ring-accent/60',
			)}
		>
			<span className={cx('flex size-4 shrink-0 items-center justify-center [&>svg]:size-[15px]', iconClass)}>{icon}</span>
			<span className="min-w-0 flex-1 truncate">{label}</span>
			{right}
			{!!count && (
				<span
					className={cx(
						'min-w-5 rounded-full px-1.5 text-center text-[11px] font-medium tabular-nums',
						countTone === 'danger' ? 'bg-danger text-white' : countTone === 'accent' ? 'bg-accent text-accent-fg' : 'text-fg-3',
					)}
				>
					{count}
				</span>
			)}
		</button>
	);
}

export function Sidebar() {
	const { data: c } = useCounts();
	const setPaletteOpen = useUI((s) => s.setPaletteOpen);
	const setNewPocOpen = useUI((s) => s.setNewPocOpen);
	const [pocsOpen, setPocsOpen] = useState(true);
	const pocs = c?.pocs.filter((p) => p.status === 'active' || p.status === 'paused') ?? [];

	return (
		<nav className="sidebar-surface flex h-full w-[232px] shrink-0 flex-col border-r border-line bg-sidebar">
			<div className={cx('drag flex h-12 shrink-0 items-center gap-2 px-4', isElectron && 'justify-end')}>
				<Logo className="size-5" />
				<span className="font-display text-[13px] font-semibold tracking-tight">Zepo Desk</span>
			</div>

			<div className="px-3 pb-2">
				<button
					type="button"
					onClick={() => setPaletteOpen(true)}
					className="flex h-7.5 w-full items-center gap-2 rounded-lg bg-hover px-2 text-[12.5px] text-fg-3 transition-colors hover:text-fg-2"
				>
					<Search className="size-3.5" />
					<span className="flex-1 text-left">Buscar</span>
					<Kbd>⌘K</Kbd>
				</button>
			</div>

			<div className="scroll flex-1 space-y-0.5 px-3 pb-3">
				<NavItem
					view={{ kind: 'today' }}
					icon={<Sun />}
					iconClass="text-warn"
					label="Hoy"
					count={c?.today}
					countTone={c?.overdue ? 'danger' : 'accent'}
				/>
				<NavItem view={{ kind: 'upcoming' }} icon={<CalendarDays />} iconClass="text-danger" label="Próximos 7 días" count={c?.upcoming} />

				<div className="px-2 pt-4 pb-1 text-[11px] font-semibold tracking-wide text-fg-3 uppercase">Categorías</div>
				<NavItem
					view={{ kind: 'followups' }}
					icon={<Send />}
					iconClass="text-accent"
					label="Follow-ups"
					count={c?.followups}
					drop={{ category: 'followup', label: 'Follow-ups' }}
				/>
				<NavItem
					view={{ kind: 'tasks' }}
					icon={<SquareCheckBig />}
					iconClass="text-teal"
					label="Tareas pendientes"
					count={c?.tasks}
					drop={{ category: 'task', label: 'Tareas pendientes' }}
				/>
				<div className="group/pocs relative">
					<NavItem
						view={{ kind: 'pocs' }}
						icon={<FlaskConical />}
						iconClass="text-[#7F77DD]"
						label="PoCs en curso"
						count={pocs.filter((p) => p.status === 'active').length}
					/>
					<div className="absolute top-0.5 right-8 hidden items-center group-hover/pocs:flex">
						<button
							type="button"
							onClick={() => setPocsOpen(!pocsOpen)}
							className="flex size-6 items-center justify-center rounded-md text-fg-3 hover:bg-hover"
							aria-label={pocsOpen ? 'Plegar PoCs' : 'Desplegar PoCs'}
						>
							<ChevronRight className={cx('size-3.5 transition-transform', pocsOpen && 'rotate-90')} />
						</button>
						<button
							type="button"
							onClick={() => setNewPocOpen(true)}
							className="flex size-6 items-center justify-center rounded-md text-fg-3 hover:bg-hover"
							aria-label="Nueva PoC"
							title="Nueva PoC"
						>
							<Plus className="size-3.5" />
						</button>
					</div>
				</div>
				<AnimatePresence initial={false}>
					{pocsOpen && (
						<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-0.5 overflow-hidden">
							{pocs.map((p) => (
								<NavItem
									key={p.id}
									indent
									view={{ kind: 'poc', id: p.id }}
									icon={<PocDot color={p.color} />}
									label={p.name}
									drop={{ category: 'poc', poc_id: p.id, label: p.name }}
									right={
										p.status === 'paused' ? (
											<Pause className="size-3 text-fg-3" aria-label="En pausa" />
										) : p.total ? (
											<ProgressRing done={p.done} total={p.total} color={p.color} size={13} />
										) : null
									}
								/>
							))}
						</motion.div>
					)}
				</AnimatePresence>

				<div className="px-2 pt-4 pb-1 text-[11px] font-semibold tracking-wide text-fg-3 uppercase">Archivo</div>
				<NavItem view={{ kind: 'weeks' }} icon={<Archive />} label="Semanas" />
				<NavItem view={{ kind: 'trash' }} icon={<Trash2 />} label="Papelera" count={c?.trash} />
			</div>

			<div className="border-t border-line px-3 py-2">
				<NavItem view={{ kind: 'settings' }} icon={<Settings />} label="Ajustes" />
				{isElectron && (
					<div className="mt-1 px-2 text-[11px] text-fg-3">
						Captura rápida desde cualquier app: <Kbd>⌥</Kbd> <Kbd>Espacio</Kbd>
					</div>
				)}
			</div>
		</nav>
	);
}
