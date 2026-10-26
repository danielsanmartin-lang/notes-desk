import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CornerDownRight, GripVertical, ListChecks, Send, StickyNote } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useActions } from '../api/hooks';
import type { Item } from '../api/types';
import { cx, plural } from '../lib/format';
import { useItemOps } from '../lib/ops';
import { useUI } from '../lib/store';
import { ChannelIcon, Checkbox, Chip, DueChip, FlagStar, PocTag, ReminderChip, WaitingChip, WhoChip } from './bits';

export interface RowOptions {
	showPoc?: boolean;
	showCategory?: boolean;
	sortable?: boolean;
	/** Lista a la que pertenece la fila (para reordenar solo dentro de ella). */
	listKey?: string;
	/** Query de la lista, para reordenar al instante sin esperar al servidor. */
	queryKey?: readonly unknown[];
}

export function TaskRow({ item, today, options = {} }: { item: Item; today: string; options?: RowOptions }) {
	const selected = useUI((s) => s.selectedId === item.id);
	const select = useUI((s) => s.select);
	const setTouchOpen = useUI((s) => s.setTouchOpen);
	const ops = useItemOps();
	const a = useActions();
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

	const followable = !done && (item.category === 'followup' || item.category === 'poc');
	// En listas que mezclan cosas (Hoy, Próximos, Follow-ups, Cuentas), las tareas de una PoC empiezan por
	// «PoC · nombre» para reconocerlas de un vistazo.
	const pocPrefix = options.showPoc && item.category === 'poc' && item.poc_name;

	return (
		<motion.div
			layout="position"
			ref={sortable.setNodeRef}
			style={{ transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition }}
			{...sortable.attributes}
			role="button"
			tabIndex={-1}
			onClick={() => select(item.id)}
			className={cx(
				'group relative flex items-start gap-2.5 rounded-xl px-2.5 py-2 transition-colors outline-none',
				selected ? 'bg-active' : 'hover:bg-hover',
				sortable.isDragging && 'z-10 bg-raised opacity-90 shadow-card',
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
				<Checkbox checked={done} waiting={item.state === 'waiting'} onToggle={toggle} />
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
								<span className="font-medium">{item.poc_name}</span>
								<span className="text-fg-3"> · </span>
							</>
						)}
						{item.title}
					</span>
				</div>
				<div className="mt-1 flex flex-wrap items-center gap-1.5 empty:hidden">
					{item.parent_title && (
						<span className="inline-flex min-w-0 items-center gap-1 text-[11.5px] text-fg-3">
							<CornerDownRight className="size-3" />
							<span className="truncate">{item.parent_title}</span>
						</span>
					)}
					{options.showCategory && item.category === 'followup' && <Chip tone="neutral">Follow-up</Chip>}
					{options.showPoc && item.poc_name && !pocPrefix && <PocTag name={item.poc_name} color={item.poc_color} />}
					<WhoChip company={item.company} contact={item.contact} />
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
					{item.touch_count > 0 && !done && <Chip tone="ghost">{plural(item.touch_count, 'toque', 'toques')}</Chip>}
					{item.notes && <StickyNote className="size-3 text-fg-3" aria-label="Tiene notas" />}
					{item.remind_at && !done && <ReminderChip at={item.remind_at} today={today} />}
				</div>
			</div>
			<div className="flex shrink-0 items-center gap-1 pt-[1px]">
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
				{item.state === 'waiting' && !done && <WaitingChip item={item} today={today} />}
				{item.due_date && !done && <DueChip date={item.due_date} today={today} />}
				{(item.flagged || !done) && !item.parent_id && (
					<span className={cx(!item.flagged && 'opacity-0 group-hover:opacity-100')}>
						<FlagStar on={item.flagged} onClick={() => a.update(item.id, { flagged: !item.flagged })} />
					</span>
				)}
			</div>
		</motion.div>
	);
}
