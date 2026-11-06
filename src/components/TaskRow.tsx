import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CornerDownRight, FlaskConical, GripVertical, Handshake, ListChecks, Send, StickyNote, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useActions, usePocs } from '../api/hooks';
import type { Item } from '../api/types';
import { cx, plural } from '../lib/format';
import { useItemOps } from '../lib/ops';
import { partnerOf } from '../lib/pocs';
import { useUI } from '../lib/store';
import { ChannelIcon, Checkbox, Chip, DueChip, FlagStar, Highlight, PocDot, PocTag, ReminderChip, WaitingChip, WhoChip } from './bits';
import { Menu, MenuItem } from './ui';

export interface RowOptions {
	showPoc?: boolean;
	showCategory?: boolean;
	sortable?: boolean;
	/** Lista a la que pertenece la fila (para reordenar solo dentro de ella). */
	listKey?: string;
	/** Query de la lista, para reordenar al instante sin esperar al servidor. */
	queryKey?: readonly unknown[];
	/** Enseñar las subtareas abiertas debajo (por defecto sí; en Hoy y Próximos salen como filas propias). */
	nested?: boolean;
	/** Palabras buscadas que se resaltan (buscador del Inicio). */
	highlight?: string[];
	/** PoCs activas de la cuenta: las tareas que no están en ninguna ofrecen «Meter en la PoC». */
	movePocs?: { id: number; name: string; color: string | null }[];
}

export function TaskRow({ item, today, options = {} }: { item: Item; today: string; options?: RowOptions }) {
	const selected = useUI((s) => s.selectedId === item.id);
	const select = useUI((s) => s.select);
	const go = useUI((s) => s.go);
	const setTouchOpen = useUI((s) => s.setTouchOpen);
	const ops = useItemOps();
	const a = useActions();
	const { data: pocs = [] } = usePocs();
	// El check se ve al instante; la fila baja a "completadas" cuando responde el servidor.
	const [optimistic, setOptimistic] = useState<boolean | null>(null);
	const done = optimistic ?? item.state === 'done';
	const sortable = useSortable({
		id: `item-${item.id}`,
		data: { item, listKey: options.listKey, reorderable: !!options.sortable, queryKey: options.queryKey },
	});

	const toggle = async () => {
		setOptimistic(!done);
		try {
			await new Promise((r) => setTimeout(r, done ? 0 : 260));
			await ops.toggle(item);
		} finally {
			setOptimistic(null);
		}
	};

	// Con subtareas abiertas, el contador (fecha, espera, toques) lo lleva cada subtarea, no la tarea.
	const hasOpenSubs = item.sub_total - item.sub_done > 0;
	const followable = !done && !hasOpenSubs && (item.category === 'followup' || item.category === 'poc' || !!item.parent_id);
	const openSubs = (item.subs ?? []).filter((x) => x.state !== 'done');
	const movePocs = !done && !item.poc_id && !item.parent_id ? (options.movePocs ?? []) : [];
	const moveClass =
		'hidden h-6 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-medium text-accent-text group-hover:inline-flex hover:bg-accent-soft';
	// En listas que mezclan cosas (Hoy, Próximos, Follow-ups, Cuentas), las tareas de una PoC empiezan por
	// «PoC · nombre» para reconocerlas de un vistazo.
	const pocPrefix = options.showPoc && item.category === 'poc' && item.poc_name;

	return (
		<motion.div
			layout="position"
			ref={sortable.setNodeRef}
			style={{ transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition }}
			{...sortable.attributes}
			tabIndex={-1}
			className={cx('outline-none', sortable.isDragging && 'relative z-10 rounded-xl bg-raised opacity-90 shadow-card')}
		>
			<div
				role="button"
				onClick={() => select(item.id)}
				className={cx(
					'group relative flex items-start gap-2.5 rounded-xl px-2.5 py-2 transition-colors',
					selected ? 'bg-active' : 'hover:bg-hover',
				)}
			>
				{options.sortable !== undefined && (
					<span
						{...sortable.listeners}
						onClick={(e) => e.stopPropagation()}
						className="absolute top-2.5 -left-4 flex h-4 w-4 cursor-grab items-center justify-center text-fg-3 opacity-0 transition-opacity group-hover:opacity-100"
						title="Arrastra para reordenar o suelta sobre una PoC de la barra lateral"
					>
						<GripVertical className="size-3.5" />
					</span>
				)}
				<div className="pt-[1px]">
					<Checkbox checked={done} waiting={item.state === 'waiting' && !hasOpenSubs} onToggle={toggle} />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-start gap-2">
						<span
							className={cx(
								'min-w-0 flex-1 text-[13.5px] leading-5 transition-colors duration-300',
								done ? 'text-fg-3 line-through decoration-fg-3/60' : 'text-fg',
							)}
						>
							{pocPrefix && (
								<>
									<span className="mr-1.5 inline-block translate-y-[-1px] rounded-[5px] bg-accent-soft px-1.5 py-px align-middle text-[10.5px] font-semibold tracking-wide text-accent-text">
										PoC
									</span>
									<span className="font-medium">
										<Highlight text={item.poc_name!} terms={options.highlight} />
									</span>
									<span className="text-fg-3"> · </span>
								</>
							)}
							<Highlight text={item.title} terms={options.highlight} />
						</span>
					</div>
					{item.snippet && (
						<div className="mt-0.5 line-clamp-2 text-[12px] leading-[18px] text-fg-2">
							<Highlight text={item.snippet} terms={options.highlight} />
						</div>
					)}
					<div className="mt-1 flex flex-wrap items-center gap-1.5 empty:hidden">
						{item.parent_title && (
							<span className="inline-flex min-w-0 items-center gap-1 text-[11.5px] text-fg-3">
								<CornerDownRight className="size-3" />
								<span className="truncate">
									<Highlight text={item.parent_title} terms={options.highlight} />
								</span>
							</span>
						)}
						{options.showCategory && item.category === 'followup' && <Chip tone="neutral">Follow-up</Chip>}
						{item.audience === 'partner' && (
							<Chip tone="teal" icon={<Handshake />} title="Va al partner">
								{partnerOf(pocs, item) ?? 'Partner'}
							</Chip>
						)}
						{options.showPoc && item.poc_name && !pocPrefix && <PocTag name={item.poc_name} color={item.poc_color} />}
						<WhoChip
							company={item.company}
							contact={item.contact}
							highlight={options.highlight}
							// Lleva a la ficha de la cuenta; el enlace de HubSpot está dentro de ella.
							onCompany={() => item.company && go({ kind: 'account', name: item.company })}
							companyTitle={`Ver la ficha de ${item.company}`}
						/>
						{item.channel && (
							<span className="text-fg-3" title="Canal">
								<ChannelIcon channel={item.channel} className="size-3" />
							</span>
						)}
						{item.sub_total > 0 && (
							<Chip tone="ghost" icon={<ListChecks />}>
								{item.sub_done}/{item.sub_total}
							</Chip>
						)}
						{item.touch_count > 0 && !done && !hasOpenSubs && <Chip tone="ghost">{plural(item.touch_count, 'toque', 'toques')}</Chip>}
						{item.notes && <StickyNote className="size-3 text-fg-3" aria-label="Tiene notas" />}
						{item.remind_at && !done && <ReminderChip at={item.remind_at} today={today} />}
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-1 pt-[1px]">
					{movePocs.length === 1 && (
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								ops.moveToPoc(item, movePocs[0]);
							}}
							className={moveClass}
							title={`Meter en ${movePocs[0].name}: pasa a ser tarea de la PoC y cuenta en su progreso`}
						>
							<FlaskConical className="size-3" />
							<span className="hidden lg:inline">Meter en la PoC</span>
						</button>
					)}
					{movePocs.length > 1 && (
						<span onClick={(e) => e.stopPropagation()}>
							<Menu
								trigger={
									<button type="button" className={moveClass} title="Meter en una PoC de la cuenta">
										<FlaskConical className="size-3" />
							<span className="hidden lg:inline">Meter en la PoC</span>
									</button>
								}
							>
								{movePocs.map((p) => (
									<MenuItem key={p.id} icon={<PocDot color={p.color} />} onSelect={() => ops.moveToPoc(item, p)}>
										{p.name}
									</MenuItem>
								))}
							</Menu>
						</span>
					)}
					{followable && (
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								select(item.id);
								setTouchOpen(true);
							}}
							className="hidden h-6 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-medium text-accent-text group-hover:inline-flex hover:bg-accent-soft"
							title="Registrar toque (⌘T)"
						>
							<Send className="size-3" /> Toque
						</button>
					)}
					{item.state === 'waiting' && !done && !hasOpenSubs && <WaitingChip item={item} today={today} />}
					{item.due_date && !done && !hasOpenSubs && <DueChip date={item.due_date} today={today} />}
					{(item.flagged || !done) && !item.parent_id && (
						<span className={cx(!item.flagged && 'opacity-0 group-hover:opacity-100')}>
							<FlagStar on={item.flagged} onClick={() => a.update(item.id, { flagged: !item.flagged })} />
						</span>
					)}
					{!item.deleted_at && (
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								if (selected) select(null);
								ops.remove(item);
							}}
							aria-label="Borrar"
							title="Borrar (va a la papelera, ⌘⌫)"
							className="flex size-6 items-center justify-center rounded-md text-fg-3 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-danger-soft hover:text-danger"
						>
							<Trash2 className="size-3.5" />
						</button>
					)}
				</div>
			</div>
			{options.nested !== false && openSubs.length > 0 && (
				<div className="mb-1 ml-[33px] border-l border-line pl-1.5">
					{openSubs.map((sub) => (
						<SubRow key={sub.id} sub={sub} today={today} />
					))}
				</div>
			)}
		</motion.div>
	);
}

/** Subtarea bajo su tarea, con su propio contador (fecha, días esperando, toques). */
function SubRow({ sub, today }: { sub: Item; today: string }) {
	const selected = useUI((s) => s.selectedId === sub.id);
	const select = useUI((s) => s.select);
	const setTouchOpen = useUI((s) => s.setTouchOpen);
	const ops = useItemOps();
	const done = sub.state === 'done';
	return (
		<div
			role="button"
			onClick={() => select(sub.id)}
			className={cx('group/sub flex items-center gap-2 rounded-lg px-2 py-1 transition-colors', selected ? 'bg-active' : 'hover:bg-hover')}
		>
			<Checkbox checked={done} waiting={sub.state === 'waiting'} size={15} onToggle={() => ops.toggle(sub)} />
			<span className="min-w-0 flex-1 truncate text-[12.5px]">{sub.title}</span>
			{sub.contact && <span className="hidden max-w-32 truncate text-[11px] text-fg-3 sm:inline">{sub.contact}</span>}
			{sub.channel && (
				<span className="text-fg-3">
					<ChannelIcon channel={sub.channel} className="size-3" />
				</span>
			)}
			{sub.touch_count > 0 && <Chip tone="ghost">{plural(sub.touch_count, 'toque', 'toques')}</Chip>}
			{!done && (
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						select(sub.id);
						setTouchOpen(true);
					}}
					className="hidden h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-accent-text group-hover/sub:inline-flex hover:bg-accent-soft"
					title="Registrar toque en esta subtarea"
				>
					<Send className="size-3" /> Toque
				</button>
			)}
			{sub.state === 'waiting' && <WaitingChip item={sub} today={today} />}
			{sub.due_date && <DueChip date={sub.due_date} today={today} />}
		</div>
	);
}
