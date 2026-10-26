import { AlarmClock, CalendarDays, CircleDashed, Coffee, Hand, Hourglass, Inbox, PartyPopper, RotateCcw, Send, SquareCheckBig, Star, Sun, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { addDays, daysBetween } from '../../shared/dates.js';
import { useActions, useItems, useToday } from '../api/hooks';
import type { Item } from '../api/types';
import { Chip, EmptyState } from '../components/bits';
import { Composer } from '../components/Composer';
import { DoneSection, Group, TaskList } from '../components/TaskList';
import { Button, Confirm } from '../components/ui';
import { capFirst, cx, longDate, plural } from '../lib/format';
import { useUI } from '../lib/store';
import { useListIds, ViewBody, ViewHeader } from './common';

export function TodayView() {
	const today = useToday();
	const { data, isLoading } = useItems('today');
	const items = data?.items ?? [];
	const chase = items.filter((i) => i.state === 'waiting' && i.due_date && i.due_date <= today);
	const overdue = items.filter((i) => !chase.includes(i) && i.due_date && i.due_date < today);
	const now = items.filter((i) => !chase.includes(i) && i.due_date === today);
	const flagged = items.filter((i) => !chase.includes(i) && !overdue.includes(i) && !now.includes(i));
	const undated = data?.undated ?? [];
	useListIds([...chase, ...overdue, ...now, ...flagged, ...undated].map((i) => i.id));
	const opts = { showPoc: true, showCategory: true, sortable: false, listKey: 'today', nested: false };

	return (
		<>
			<ViewHeader
				icon={<Sun />}
				iconClass="bg-warn-soft text-warn"
				title="Hoy"
				subtitle={capFirst(longDate(today))}
			/>
			<ViewBody>
				<Composer defaults={{ category: 'task' }} placeholder="Nueva tarea o follow-up… (elige tipo y fecha al escribir)" />
				{!isLoading && !items.length && !undated.length && (
					<EmptyState icon={(data?.done.length ?? 0) > 0 ? <PartyPopper /> : <Coffee />} title={(data?.done.length ?? 0) > 0 ? 'Todo hecho por hoy' : 'Nada pendiente para hoy'}>
						{(data?.done.length ?? 0) > 0
							? `Has completado ${plural(data!.done.length, 'tarea', 'tareas')} hoy.`
							: 'Aquí aparece lo que vence hoy, los follow-ups que toca perseguir, lo destacado y lo que no tiene fecha.'}
					</EmptyState>
				)}
				{chase.length > 0 && (
					<Group title="Toca volver a perseguir" icon={<AlarmClock />} count={chase.length} tone="warn">
						<TaskList items={chase} today={today} options={opts} />
					</Group>
				)}
				{overdue.length > 0 && (
					<Group title="Atrasadas" icon={<Hourglass />} count={overdue.length}>
						<TaskList items={overdue} today={today} options={opts} />
					</Group>
				)}
				{now.length > 0 && (
					<Group title="Para hoy" icon={<Sun />} count={now.length} tone="accent">
						<TaskList items={now} today={today} options={opts} />
					</Group>
				)}
				{flagged.length > 0 && (
					<Group title="Destacadas" icon={<Star />} count={flagged.length}>
						<TaskList items={flagged} today={today} options={opts} />
					</Group>
				)}
				{undated.length > 0 && (
					<Group
						title="Sin fecha"
						icon={<CircleDashed />}
						count={undated.length}
						right={<span className="text-[11px] text-fg-3">Ponles fecha para que salgan cuando toquen</span>}
					>
						<TaskList items={undated} today={today} options={opts} />
					</Group>
				)}
				<DoneSection items={data?.done ?? []} today={today} title="Completadas hoy" options={opts} />
			</ViewBody>
		</>
	);
}

export function UpcomingView() {
	const today = useToday();
	const { data, isLoading } = useItems('upcoming');
	const items = data?.items ?? [];
	useListIds(items.map((i) => i.id));
	const days = Array.from({ length: 7 }, (_, n) => addDays(today, n + 1));
	const opts = { showPoc: true, showCategory: true, sortable: false, listKey: 'upcoming', nested: false };

	return (
		<>
			<ViewHeader icon={<CalendarDays />} iconClass="bg-danger-soft text-danger" title="Próximos 7 días" subtitle={plural(items.length, 'tarea programada', 'tareas programadas')} />
			<ViewBody>
				<Composer defaults={{ category: 'task', due_date: addDays(today, 1) }} placeholder="Añadir para mañana… o escribe la fecha: «Preparar demo jueves»" />
				{!isLoading && !items.length && (
					<EmptyState icon={<CalendarDays />} title="Semana despejada">
						Nada programado para los próximos 7 días.
					</EmptyState>
				)}
				{days.map((d) => {
					const list = items.filter((i) => i.due_date === d);
					if (!list.length) return null;
					const diff = daysBetween(today, d);
					return (
						<Group key={d} title={diff === 1 ? `Mañana · ${longDate(d)}` : capFirst(longDate(d))} count={list.length}>
							<TaskList items={list} today={today} options={opts} />
						</Group>
					);
				})}
			</ViewBody>
		</>
	);
}

/** Con subtareas abiertas, una tarea está «esperando» solo si todas sus subtareas lo están. */
function effectiveState(i: Item) {
	const open = (i.subs ?? []).filter((x) => x.state !== 'done');
	if (!open.length) return i.state;
	return open.every((x) => x.state === 'waiting') ? 'waiting' : 'todo';
}

export function FollowUpsView() {
	const today = useToday();
	const [includePoc, setIncludePoc] = useState(false);
	const { data, isLoading } = useItems('followups', { includePoc });
	const items = data?.items ?? [];
	const mine = items.filter((i) => effectiveState(i) === 'todo');
	const waiting = items.filter((i) => effectiveState(i) === 'waiting');
	useListIds([...mine, ...waiting].map((i) => i.id));
	const opts = { showPoc: true, sortable: false, listKey: 'followups' };
	const due = items.filter((i) => i.due_date && i.due_date <= today).length;

	return (
		<>
			<ViewHeader
				icon={<Send />}
				iconClass="bg-accent-soft text-accent-text"
				title="Follow-ups"
				subtitle={
					<>
						{plural(mine.length, 'te toca', 'te tocan')} · {waiting.length} esperando respuesta
						{due > 0 && <span className="text-danger"> · {due} para hoy</span>}
					</>
				}
				right={
					<button
						type="button"
						onClick={() => setIncludePoc(!includePoc)}
						className={cx(
							'h-7 rounded-lg px-2.5 text-[12px] font-medium transition-colors',
							includePoc ? 'bg-accent-soft text-accent-text' : 'text-fg-2 hover:bg-hover',
						)}
						title="Muestra también las tareas de PoCs que están esperando respuesta"
					>
						Incluir PoCs en espera
					</button>
				}
			/>
			<ViewBody>
				<Composer defaults={{ category: 'followup' }} placeholder="Nuevo follow-up… (prueba «Llamar a Juan Caubet mañana»)" />
				{!isLoading && !items.length && (
					<EmptyState icon={<Send />} title="Sin follow-ups abiertos">
						Apunta a quién tienes que perseguir. Cada vez que le escribas, registra el toque y Zepo Desk te recordará cuándo volver.
					</EmptyState>
				)}
				{mine.length > 0 && (
					<Group title="Me toca" icon={<Hand />} count={mine.length} tone="accent">
						<TaskList items={mine} today={today} options={opts} />
					</Group>
				)}
				{waiting.length > 0 && (
					<Group title="Esperando respuesta" icon={<Hourglass />} count={waiting.length} tone="warn">
						<TaskList items={waiting} today={today} options={opts} />
					</Group>
				)}
				<DoneSection items={data?.done ?? []} today={today} options={opts} />
			</ViewBody>
		</>
	);
}

export function TasksView() {
	const today = useToday();
	const { data, isLoading } = useItems('tasks');
	const items = data?.items ?? [];
	useListIds(items.map((i) => i.id));

	return (
		<>
			<ViewHeader icon={<SquareCheckBig />} iconClass="bg-teal-soft text-teal" title="Tareas pendientes" subtitle={plural(items.length, 'pendiente', 'pendientes')} />
			<ViewBody>
				<Composer defaults={{ category: 'task' }} placeholder="Nueva tarea… (prueba «Grandvalira: consultar con Alberto el jueves !»)" />
				{!isLoading && !items.length && (
					<EmptyState icon={<Inbox />} title="Bandeja limpia">
						No tienes tareas pendientes. Escribe arriba para añadir una.
					</EmptyState>
				)}
				<TaskList items={items} today={today} options={{ sortable: true, listKey: 'tasks', queryKey: ['items', 'tasks', {}] }} />
				<DoneSection items={data?.done ?? []} today={today} />
			</ViewBody>
		</>
	);
}

export function TrashView() {
	const today = useToday();
	const { data, isLoading } = useItems('trash');
	const a = useActions();
	const select = useUI((s) => s.select);
	const [confirm, setConfirm] = useState<'empty' | Item | null>(null);
	const items = data?.items ?? [];

	return (
		<>
			<ViewHeader
				icon={<Trash2 />}
				iconClass="bg-hover text-fg-2"
				title="Papelera"
				subtitle="Lo borrado se puede recuperar hasta que vacíes la papelera."
				right={
					items.length > 0 && (
						<Button variant="danger" onClick={() => setConfirm('empty')}>
							Vaciar papelera
						</Button>
					)
				}
			/>
			<ViewBody>
				{!isLoading && !items.length && (
					<EmptyState icon={<Trash2 />} title="La papelera está vacía" />
				)}
				<div className="flex flex-col">
					{items.map((i) => (
						<div key={i.id} className="group flex items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-hover" onClick={() => select(i.id)}>
							<div className="min-w-0 flex-1">
								<div className="truncate text-[13.5px] text-fg-2">{i.title}</div>
								<div className="mt-0.5 flex items-center gap-1.5">
									<Chip tone="ghost">{i.poc_name ?? (i.category === 'followup' ? 'Follow-up' : 'Tarea')}</Chip>
									{i.deleted_at && <span className="text-[11px] text-fg-3">Borrada hace {Math.max(0, daysBetween(i.deleted_at.slice(0, 10), today))} días</span>}
								</div>
							</div>
							<Button size="xs" icon={<RotateCcw className="size-3" />} onClick={(e) => (e.stopPropagation(), a.restore(i.id))}>
								Restaurar
							</Button>
							<Button size="xs" variant="ghost" onClick={(e) => (e.stopPropagation(), setConfirm(i))}>
								Borrar del todo
							</Button>
						</div>
					))}
				</div>
			</ViewBody>
			<Confirm
				open={confirm !== null}
				onOpenChange={(o) => !o && setConfirm(null)}
				title={confirm === 'empty' ? '¿Vaciar la papelera?' : '¿Borrar para siempre?'}
				description={
					confirm === 'empty'
						? `Se borrarán ${plural(items.length, 'tarea', 'tareas')} con sus subtareas y su bitácora. No se puede deshacer.`
						: 'La tarea, sus subtareas y su bitácora desaparecen. No se puede deshacer.'
				}
				confirm={confirm === 'empty' ? 'Vaciar' : 'Borrar'}
				onConfirm={() => {
					if (confirm === 'empty') a.emptyTrash();
					else if (confirm) {
						a.purge(confirm.id);
						select(null);
					}
				}}
			/>
		</>
	);
}
