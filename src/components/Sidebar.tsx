import { useDroppable } from '@dnd-kit/core';
import {
	Archive,
	Award,
	BarChart3,
	Building2,
	CalendarDays,
	ChevronRight,
	FlaskConical,
	Pause,
	Plus,
	ScrollText,
	Search,
	Send,
	Settings,
	SquareCheckBig,
	Sun,
	Trash2,
	Trophy,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { useCounts, useToday } from '../api/hooks';
import type { Category, Counts, PocKind } from '../api/types';
import { isElectron } from '../lib/bridge';
import { cx } from '../lib/format';
import { deadlineInfo, isClosed, region, REGION_LABEL, REGIONS } from '../lib/pocs';
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

const SECTION: Record<
	PocKind,
	{ open: string; closed: string; icon: ReactNode; iconClass: string; closedIcon: ReactNode; noun: string; openView: View; closedView: View }
> = {
	poc: {
		open: 'PoCs en curso',
		closed: 'PoCs concluidas',
		icon: <FlaskConical />,
		iconClass: 'text-[#7F77DD]',
		closedIcon: <Trophy />,
		noun: 'PoC',
		openView: { kind: 'pocs' },
		closedView: { kind: 'pocs-closed' },
	},
	rfp: {
		open: 'RFPs en curso',
		closed: 'RFPs concluidas',
		icon: <ScrollText />,
		iconClass: 'text-[#D85A30]',
		closedIcon: <Award />,
		noun: 'RFP',
		openView: { kind: 'rfps' },
		closedView: { kind: 'rfps-closed' },
	},
};

/** «PoCs en curso» o «RFPs en curso» (plegable, por región, con + para crear) y su «concluidas». */
function ProjectSection({ kind, counts }: { kind: PocKind; counts: Counts | undefined }) {
	const setNewPocOpen = useUI((s) => s.setNewPocOpen);
	const today = useToday();
	const [open, setOpen] = useState(true);
	const meta = SECTION[kind];
	const all = counts?.pocs.filter((p) => (p.kind ?? 'poc') === kind) ?? [];
	const live = all.filter((p) => !isClosed(p));
	const closedCount = all.filter(isClosed).length;
	// Agrupadas por región (solo se rotula si hay más de una).
	const byRegion = REGIONS.map((r) => ({ r, list: live.filter((p) => region(p.country) === r) })).filter((g) => g.list.length);

	return (
		<>
			<div className={cx('relative', kind === 'poc' ? 'group/poc' : 'group/rfp')}>
				<NavItem view={meta.openView} icon={meta.icon} iconClass={meta.iconClass} label={meta.open} count={live.filter((p) => p.status === 'active').length} />
				<div
					className={cx('absolute top-0.5 right-8 hidden items-center', kind === 'poc' ? 'group-hover/poc:flex' : 'group-hover/rfp:flex')}
				>
					<button
						type="button"
						onClick={() => setOpen(!open)}
						className="flex size-6 items-center justify-center rounded-md text-fg-3 hover:bg-hover"
						aria-label={open ? `Plegar ${meta.open}` : `Desplegar ${meta.open}`}
					>
						<ChevronRight className={cx('size-3.5 transition-transform', open && 'rotate-90')} />
					</button>
					<button
						type="button"
						onClick={() => setNewPocOpen(kind)}
						className="flex size-6 items-center justify-center rounded-md text-fg-3 hover:bg-hover"
						aria-label={`Nueva ${meta.noun}`}
						title={`Nueva ${meta.noun}`}
					>
						<Plus className="size-3.5" />
					</button>
				</div>
			</div>
			<AnimatePresence initial={false}>
				{open && (
					<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-0.5 overflow-hidden">
						{byRegion.map(({ r, list }) => (
							<div key={r} className="space-y-0.5">
								{byRegion.length > 1 && <div className="pt-1.5 pb-0.5 pl-7 text-[10.5px] font-medium tracking-wide text-fg-3 uppercase">{REGION_LABEL[r]}</div>}
								{list.map((p) => {
									const deadline = kind === 'rfp' ? deadlineInfo(p, today) : null;
									return (
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
												) : kind === 'rfp' && p.submitted_at ? (
													<Send className="size-3 text-fg-3" aria-label="Presentada" />
												) : deadline && deadline.days <= 7 ? (
													<span
														title={deadline.label}
														className={cx('text-[10.5px] font-medium tabular-nums', deadline.tone === 'danger' ? 'text-danger' : 'text-warn')}
													>
														{deadline.short}
													</span>
												) : p.total ? (
													<ProgressRing done={p.done} total={p.total} color={p.color} size={13} />
												) : null
											}
										/>
									);
								})}
							</div>
						))}
					</motion.div>
				)}
			</AnimatePresence>
			<NavItem view={meta.closedView} icon={meta.closedIcon} iconClass="text-ok" label={meta.closed} count={closedCount} />
		</>
	);
}

export function Sidebar() {
	const { data: c } = useCounts();
	const setPaletteOpen = useUI((s) => s.setPaletteOpen);

	return (
		<nav className="sidebar-surface flex h-full w-[232px] shrink-0 flex-col border-r border-line bg-sidebar">
			<div className={cx('drag flex h-12 shrink-0 items-center gap-2 px-4', isElectron && 'justify-end')}>
				<Logo className="size-5" />
				<span className="font-display text-[13px] font-semibold tracking-tight">Notes Desk</span>
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
					label="Inicio"
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
				<ProjectSection kind="poc" counts={c} />
				<ProjectSection kind="rfp" counts={c} />

				<div className="px-2 pt-4 pb-1 text-[11px] font-semibold tracking-wide text-fg-3 uppercase">Visión general</div>
				<NavItem view={{ kind: 'accounts' }} icon={<Building2 />} iconClass="text-accent" label="Cuentas" />
				<NavItem view={{ kind: 'stats' }} icon={<BarChart3 />} iconClass="text-teal" label="Estadísticas" />
				<NavItem view={{ kind: 'weeks' }} icon={<Archive />} label="Semanas" />
			</div>

			<div className="space-y-0.5 border-t border-line px-3 py-2">
				<NavItem view={{ kind: 'trash' }} icon={<Trash2 />} label="Papelera" count={c?.trash} />
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
