import {
	CalendarClock,
	CircleCheck,
	Pause,
	Play,
	Reply,
	Send,
	Sparkles,
	StickyNote,
	ThumbsDown,
	Trash2,
	Trophy,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { formatDay } from '../../shared/dates.js';
import type { Activity } from '../api/types';
import { CHANNEL_LABEL, cx, formatMoment } from '../lib/format';
import { ChannelIcon } from './bits';

const DELETABLE = new Set(['note', 'touch', 'reply']);

function describe(a: Activity, today: string): { icon: ReactNode; title: string; tone: string } {
	switch (a.kind) {
		case 'created':
			return { icon: <Sparkles />, title: a.poc_id && !a.item_id ? 'PoC creada' : 'Creada', tone: 'text-fg-3' };
		case 'touch':
			return {
				icon: a.channel ? <ChannelIcon channel={a.channel} className="size-3.5" /> : <Send />,
				title: `Toque${a.channel ? ` por ${CHANNEL_LABEL[a.channel].toLowerCase()}` : ''}${
					a.meta?.next_date ? ` · próximo FUP ${formatDay(a.meta.next_date, today)}` : ''
				}`,
				tone: 'text-accent-text bg-accent-soft',
			};
		case 'reply':
			return { icon: <Reply />, title: 'Han respondido', tone: 'text-ok bg-ok-soft' };
		case 'note':
			return { icon: <StickyNote />, title: 'Nota', tone: 'text-fg-2' };
		case 'done':
			return { icon: <CircleCheck />, title: 'Completada', tone: 'text-ok' };
		case 'rescheduled':
			return {
				icon: <CalendarClock />,
				title: a.meta?.from && a.meta?.to ? `Pospuesta: ${formatDay(a.meta.from, today)} → ${formatDay(a.meta.to, today)}` : 'Pospuesta',
				tone: 'text-fg-3',
			};
		case 'paused':
			return {
				icon: <Pause />,
				title: a.meta?.until ? `En pausa hasta el ${formatDay(a.meta.until, today)}` : 'En pausa',
				tone: 'text-warn bg-warn-soft',
			};
		case 'resumed':
			return { icon: <Play />, title: 'Reanudada', tone: 'text-ok' };
		case 'won':
			return { icon: <Trophy />, title: 'PoC ganada', tone: 'text-ok bg-ok-soft' };
		case 'lost':
			return { icon: <ThumbsDown />, title: 'PoC perdida', tone: 'text-danger bg-danger-soft' };
	}
}

export function Timeline({
	entries,
	today,
	onDelete,
	parentId,
	showItem,
}: {
	entries: Activity[];
	today: string;
	onDelete?: (a: Activity) => void;
	/** En el panel de una tarea: las entradas de sus subtareas llevan el título de la subtarea. */
	parentId?: number;
	/** En una PoC: cada entrada dice a qué tarea pertenece. */
	showItem?: boolean;
}) {
	if (!entries.length) return <div className="py-2 text-[12px] text-fg-3">Sin movimientos todavía.</div>;
	return (
		<ol className="relative">
			<AnimatePresence initial={false}>
				{entries.map((a, i) => {
					const d = describe(a, today);
					const sub = parentId != null && a.item_id !== parentId;
					const context = (showItem || sub) && (a.item_title ?? a.poc_name) ? (a.item_title ?? a.poc_name) : null;
					return (
						<motion.li
							key={a.id}
							layout="position"
							initial={{ opacity: 0, x: -4 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, height: 0 }}
							className="group relative flex gap-3 pb-3.5"
						>
							{i < entries.length - 1 && <span className="absolute top-6 bottom-0 left-[11px] w-px bg-line" />}
							<span
								className={cx(
									'relative flex size-6 shrink-0 items-center justify-center rounded-full bg-hover [&>svg]:size-3.5',
									d.tone,
								)}
							>
								{d.icon}
							</span>
							<div className="min-w-0 flex-1 pt-0.5">
								<div className="flex items-baseline gap-2">
									<span className="min-w-0 flex-1 text-[12.5px] font-medium text-fg">
										{context && <span className="text-fg-2">{context} · </span>}
										{sub && a.kind === 'done' ? 'Subtarea completada' : d.title}
									</span>
									<span className="shrink-0 text-[11px] text-fg-3">{formatMoment(a.occurred_at, today)}</span>
								</div>
								{a.body && <p className="selectable mt-0.5 text-[12.5px] whitespace-pre-wrap text-fg-2">{a.body}</p>}
							</div>
							{onDelete && DELETABLE.has(a.kind) && (
								<button
									type="button"
									onClick={() => onDelete(a)}
									title={a.kind === 'note' ? 'Borrar nota' : 'Borrar (si es la última, deshace su efecto)'}
									className="absolute top-0.5 -right-1 hidden size-6 items-center justify-center rounded-md text-fg-3 group-hover:flex hover:bg-hover hover:text-danger"
								>
									<Trash2 className="size-3.5" />
								</button>
							)}
						</motion.li>
					);
				})}
			</AnimatePresence>
		</ol>
	);
}
