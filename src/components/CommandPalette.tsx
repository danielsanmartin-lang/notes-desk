import { Command } from 'cmdk';
import {
	Archive,
	CalendarDays,
	CircleCheck,
	FlaskConical,
	Plus,
	Search,
	Send,
	Settings,
	SquareCheckBig,
	Sun,
	Trash2,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { fold } from '../../shared/quickparse.js';
import { useSearch } from '../api/hooks';
import { CATEGORY_LABEL } from '../lib/format';
import { useUI, type View } from '../lib/store';
import { PocDot } from './bits';
import { Kbd } from './ui';

interface Action {
	id: string;
	label: string;
	icon: ReactNode;
	hint?: string;
	run: () => void;
}

const itemClass =
	'flex h-9 cursor-default items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-fg data-[selected=true]:bg-active [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-fg-3';

export function CommandPalette() {
	const { paletteOpen, setPaletteOpen, go, select, focusComposer, setNewPocOpen } = useUI();
	const [q, setQ] = useState('');
	const { data } = useSearch(q);

	const close = () => {
		setPaletteOpen(false);
		setQ('');
	};
	const nav = (view: View) => () => go(view);
	const create = (view: View) => () => {
		go(view);
		setTimeout(focusComposer, 50);
	};

	const actions: Action[] = [
		{ id: 'new-fup', label: 'Nuevo follow-up', icon: <Plus />, run: create({ kind: 'followups' }) },
		{ id: 'new-task', label: 'Nueva tarea', icon: <Plus />, hint: '⌘N', run: create({ kind: 'tasks' }) },
		{ id: 'new-poc', label: 'Nueva PoC', icon: <Plus />, run: () => setNewPocOpen(true) },
		{ id: 'go-today', label: 'Ir a Hoy', icon: <Sun />, hint: '⌘1', run: nav({ kind: 'today' }) },
		{ id: 'go-upcoming', label: 'Ir a Próximos 7 días', icon: <CalendarDays />, hint: '⌘2', run: nav({ kind: 'upcoming' }) },
		{ id: 'go-fup', label: 'Ir a Follow-ups', icon: <Send />, hint: '⌘3', run: nav({ kind: 'followups' }) },
		{ id: 'go-tasks', label: 'Ir a Tareas pendientes', icon: <SquareCheckBig />, hint: '⌘4', run: nav({ kind: 'tasks' }) },
		{ id: 'go-pocs', label: 'Ir a PoCs en curso', icon: <FlaskConical />, hint: '⌘5', run: nav({ kind: 'pocs' }) },
		{ id: 'go-weeks', label: 'Ir a Semanas', icon: <Archive />, hint: '⌘6', run: nav({ kind: 'weeks' }) },
		{ id: 'go-trash', label: 'Ir a la Papelera', icon: <Trash2 />, hint: '⌘7', run: nav({ kind: 'trash' }) },
		{ id: 'go-settings', label: 'Ajustes', icon: <Settings />, hint: '⌘,', run: nav({ kind: 'settings' }) },
	];
	const fq = fold(q.trim());
	const shownActions = fq ? actions.filter((a) => fold(a.label).includes(fq)) : actions;
	const items = q.trim() ? (data?.items ?? []) : [];
	const pocs = q.trim() ? (data?.pocs ?? []) : [];

	return (
		<Command.Dialog
			open={paletteOpen}
			onOpenChange={(o) => (o ? setPaletteOpen(true) : close())}
			label="Buscar"
			shouldFilter={false}
			loop
			overlayClassName="fixed inset-0 z-50 bg-[rgb(7_14_52/0.25)] backdrop-blur-[2px]"
			contentClassName="fixed top-[14%] left-1/2 z-50 w-[600px] max-w-[92vw] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-raised text-fg shadow-float animate-[pop_.14s_ease-out]"
		>
			<div className="flex h-12 items-center gap-2.5 border-b border-line px-4">
				<Search className="size-4 text-fg-3" />
				<Command.Input
					value={q}
					onValueChange={setQ}
					placeholder="Busca tareas, empresas, contactos, PoCs… o una acción"
					className="h-full flex-1 bg-transparent text-[14px] outline-none placeholder:text-fg-3"
				/>
				<Kbd>Esc</Kbd>
			</div>
			<Command.List className="scroll max-h-[380px] p-2">
				<Command.Empty className="px-3 py-6 text-center text-[13px] text-fg-3">Sin resultados para «{q}»</Command.Empty>
				{pocs.length > 0 && (
					<Command.Group heading="PoCs" className="mb-1 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-fg-3">
						{pocs.map((p) => (
							<Command.Item
								key={`poc-${p.id}`}
								value={`poc-${p.id}`}
								onSelect={() => {
									go({ kind: 'poc', id: p.id });
									close();
								}}
								className={itemClass}
							>
								<PocDot color={p.color} />
								<span className="flex-1 truncate">{p.name}</span>
								<span className="text-[11.5px] text-fg-3">{p.company}</span>
							</Command.Item>
						))}
					</Command.Group>
				)}
				{items.length > 0 && (
					<Command.Group heading="Tareas" className="mb-1 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-fg-3">
						{items.map((i) => (
							<Command.Item
								key={`item-${i.id}`}
								value={`item-${i.id}`}
								onSelect={() => {
									select(i.id);
									close();
								}}
								className={itemClass}
							>
								{i.state === 'done' ? <CircleCheck /> : i.category === 'followup' ? <Send /> : i.category === 'poc' ? <FlaskConical /> : <SquareCheckBig />}
								<span className={i.state === 'done' ? 'flex-1 truncate text-fg-3 line-through' : 'flex-1 truncate'}>{i.title}</span>
								<span className="shrink-0 text-[11.5px] text-fg-3">{i.poc_name ?? i.company ?? CATEGORY_LABEL[i.category]}</span>
							</Command.Item>
						))}
					</Command.Group>
				)}
				{shownActions.length > 0 && (
					<Command.Group heading="Acciones" className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-fg-3">
						{shownActions.map((a) => (
							<Command.Item
								key={a.id}
								value={a.id}
								onSelect={() => {
									a.run();
									close();
								}}
								className={itemClass}
							>
								{a.icon}
								<span className="flex-1">{a.label}</span>
								{a.hint && <Kbd>{a.hint}</Kbd>}
							</Command.Item>
						))}
					</Command.Group>
				)}
			</Command.List>
		</Command.Dialog>
	);
}
