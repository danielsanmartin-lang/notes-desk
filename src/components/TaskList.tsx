import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Item } from '../api/types';
import { cx } from '../lib/format';
import { TaskRow, type RowOptions } from './TaskRow';

export function TaskList({ items, today, options = {} }: { items: Item[]; today: string; options?: RowOptions }) {
	// Lo que ya estaba al cargar la vista aparece sin animación; solo se animan las altas y bajas posteriores.
	const loaded = useRef(false);
	const animateIn = loaded.current;
	useEffect(() => {
		if (items.length) loaded.current = true;
	}, [items.length]);
	return (
		<SortableContext
			items={items.map((i) => `item-${i.id}`)}
			// En listas sin orden manual (Hoy, Follow-ups…) solo se arrastra hacia la barra lateral: nada se aparta.
			strategy={options.sortable ? verticalListSortingStrategy : () => null}
		>
			<div className="flex flex-col">
				<AnimatePresence initial={false}>
					{items.map((item) => (
						<motion.div
							key={item.id}
							initial={animateIn ? { opacity: 0, height: 0 } : false}
							animate={{ opacity: 1, height: 'auto' }}
							exit={{ opacity: 0, height: 0, transition: { duration: 0.18 } }}
						>
							<TaskRow item={item} today={today} options={options} />
						</motion.div>
					))}
				</AnimatePresence>
			</div>
		</SortableContext>
	);
}

export function Group({
	title,
	icon,
	count,
	children,
	right,
	tone,
}: {
	title: string;
	icon?: ReactNode;
	count?: number;
	children: ReactNode;
	right?: ReactNode;
	tone?: 'accent' | 'warn';
}) {
	return (
		<section className="mb-5">
			<div className="mb-1 flex items-center gap-2 px-2.5">
				<span
					className={cx(
						'flex items-center gap-1.5 text-[12px] font-semibold [&>svg]:size-3.5',
						tone === 'accent' ? 'text-accent-text' : tone === 'warn' ? 'text-warn' : 'text-fg-2',
					)}
				>
					{icon}
					{title}
				</span>
				{count != null && <span className="text-[11.5px] text-fg-3">{count}</span>}
				<div className="ml-auto">{right}</div>
			</div>
			{children}
		</section>
	);
}

/** Lo completado (tachado), plegable, al final de cada lista. */
export function DoneSection({
	items,
	today,
	title = 'Completadas esta semana',
	defaultOpen = false,
	options,
}: {
	items: Item[];
	today: string;
	title?: string;
	defaultOpen?: boolean;
	options?: RowOptions;
}) {
	const [open, setOpen] = useState(defaultOpen);
	if (!items.length) return null;
	return (
		<section className="mt-2">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="flex h-7 items-center gap-1 rounded-md px-2.5 text-[12px] font-medium text-fg-3 hover:text-fg-2"
			>
				<ChevronRight className={cx('size-3.5 transition-transform', open && 'rotate-90')} />
				{title} · {items.length}
			</button>
			<AnimatePresence initial={false}>
				{open && (
					<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
						<TaskList items={items} today={today} options={{ ...options, sortable: undefined }} />
					</motion.div>
				)}
			</AnimatePresence>
		</section>
	);
}
