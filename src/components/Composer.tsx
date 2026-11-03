// Campo de "nueva tarea" con lenguaje natural. Al escribir se abre debajo un menú para elegir el tipo y la
// fecha, con lo que ha entendido del texto ya marcado.

import { Bell, Building2, CalendarDays, Plus, Star } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { formatDay, relativeDay } from '../../shared/dates.js';
import { parseQuick } from '../../shared/quickparse.js';
import { useActions, usePocs, useSuggestions, useToday } from '../api/hooks';
import type { Category, Item } from '../api/types';
import { CATEGORY_LABEL, cx, timeOf } from '../lib/format';
import { useUI } from '../lib/store';
import { Chip, PocDot } from './bits';
import { quickDates } from './DatePicker';

export interface ComposerDefaults {
	category: Category;
	poc_id?: number;
	due_date?: string;
	company?: string;
}

export interface Parsed {
	title: string;
	category: Category | null;
	pocId: number | null;
	pocName: string | null;
	pocColor: string | null;
	dueDate: string | null;
	remindAt: string | null;
	flagged: boolean;
	company: string | null;
}

export function useQuickParse(text: string): Parsed {
	const { data: pocs = [] } = usePocs();
	const { data: sugg } = useSuggestions();
	return useMemo(
		() =>
			parseQuick(text, {
				now: new Date(),
				pocs: pocs.filter((p) => p.status !== 'won' && p.status !== 'lost'),
				companies: sugg?.companies ?? [],
			}) as Parsed,
		[text, pocs, sugg],
	);
}

export function useCreateFromParsed() {
	const a = useActions();
	return async (parsed: Parsed, defaults: ComposerDefaults): Promise<Item | null> => {
		const category = parsed.category ?? defaults.category;
		const pocId = parsed.pocId ?? (category === 'poc' ? defaults.poc_id : undefined);
		if (!parsed.title) return null;
		if (category === 'poc' && !pocId) {
			toast.error('¿De qué PoC? Escríbela con @, por ejemplo @Cafam');
			return null;
		}
		return a.create({
			title: parsed.title,
			category,
			poc_id: pocId ?? null,
			due_date: parsed.dueDate ?? defaults.due_date ?? null,
			remind_at: parsed.remindAt,
			flagged: parsed.flagged,
			company: parsed.company ?? defaults.company ?? null,
		});
	};
}

export function ParsedChips({ parsed, defaults, today }: { parsed: Parsed; defaults: ComposerDefaults; today: string }) {
	const chips = [];
	if (parsed.category && parsed.category !== defaults.category && parsed.category !== 'poc')
		chips.push(
			<Chip key="cat" tone="accent">
				{CATEGORY_LABEL[parsed.category]}
			</Chip>,
		);
	if (parsed.pocName)
		chips.push(
			<Chip key="poc" tone="accent" icon={<PocDot color={parsed.pocColor} className="size-1.5" />}>
				{parsed.pocName}
			</Chip>,
		);
	if (parsed.dueDate)
		chips.push(
			<Chip key="date" tone="accent" icon={<CalendarDays />}>
				{relativeDay(parsed.dueDate, today)}
			</Chip>,
		);
	if (parsed.remindAt)
		chips.push(
			<Chip key="time" tone="accent" icon={<Bell />}>
				Aviso {timeOf(parsed.remindAt)}
			</Chip>,
		);
	if (parsed.company)
		chips.push(
			<Chip key="company" tone="neutral" icon={<Building2 />}>
				{parsed.company}
			</Chip>,
		);
	if (parsed.flagged)
		chips.push(
			<Chip key="flag" tone="warn" icon={<Star />}>
				Destacada
			</Chip>,
		);
	return <>{chips}</>;
}

type Override = { category?: Category; pocId?: number | null; dueDate?: string | null };

const chipClass = (on: boolean) =>
	cx(
		'inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-[12px] font-medium transition-colors',
		on ? 'bg-accent text-accent-fg' : 'bg-hover text-fg-2 hover:text-fg',
	);

/** Menú bajo el campo: tipo (tarea, follow-up o PoC) y fecha, con lo escrito ya preseleccionado. */
function ComposerMenu({
	category,
	pocId,
	dueDate,
	lockCategory,
	onType,
	onDate,
	parsed,
	today,
	refocus,
}: {
	category: Category;
	pocId: number | null;
	dueDate: string | null;
	lockCategory: boolean;
	onType: (category: Category, pocId?: number | null) => void;
	onDate: (date: string | null) => void;
	parsed: Parsed;
	today: string;
	refocus: () => void;
}) {
	const { data: pocs = [] } = usePocs();
	const choices = pocs.filter((p) => p.status === 'active' || p.status === 'paused' || p.id === pocId);
	const dates = quickDates(today).slice(0, 6);
	const custom = dueDate && !dates.some((d) => d.value === dueDate);
	// Que pulsar un chip no quite el foco del campo (y no se cierre el menú).
	const keep = (e: { preventDefault: () => void }) => e.preventDefault();

	return (
		<div className="space-y-1.5 overflow-hidden pb-2.5 pl-7">
			{!lockCategory && (
				<div className="flex items-center gap-2">
					<span className="w-10 shrink-0 text-[11px] text-fg-3">Tipo</span>
					<div className="flex min-w-0 flex-wrap gap-1">
						<button type="button" onMouseDown={keep} onClick={() => onType('task')} className={chipClass(category === 'task')}>
							Tarea
						</button>
						<button type="button" onMouseDown={keep} onClick={() => onType('followup')} className={chipClass(category === 'followup')}>
							Follow-up
						</button>
						{choices.slice(0, 6).map((p) => (
							<button
								key={p.id}
								type="button"
								onMouseDown={keep}
								onClick={() => onType('poc', p.id)}
								className={chipClass(category === 'poc' && pocId === p.id)}
							>
								<PocDot color={p.color} className="size-1.5" />
								{p.name}
							</button>
						))}
						{choices.length > 6 && (
							<select
								value={category === 'poc' && pocId && !choices.slice(0, 6).some((p) => p.id === pocId) ? pocId : ''}
								onChange={(e) => {
									if (e.target.value) onType('poc', Number(e.target.value));
									refocus();
								}}
								className="h-6 rounded-md bg-hover px-1.5 text-[12px] text-fg-2 outline-none"
							>
								<option value="">Otra PoC…</option>
								{choices.slice(6).map((p) => (
									<option key={p.id} value={p.id}>
										{p.name}
									</option>
								))}
							</select>
						)}
					</div>
				</div>
			)}
			<div className="flex items-center gap-2">
				<span className="w-10 shrink-0 text-[11px] text-fg-3">Fecha</span>
				<div className="flex min-w-0 flex-wrap items-center gap-1">
					<button type="button" onMouseDown={keep} onClick={() => onDate(null)} className={chipClass(!dueDate)}>
						Sin fecha
					</button>
					{dates.map((d) => (
						<button key={d.value} type="button" onMouseDown={keep} onClick={() => onDate(d.value)} className={chipClass(dueDate === d.value)} title={formatDay(d.value, today)}>
							{d.label}
						</button>
					))}
					{custom && <span className={chipClass(true)}>{formatDay(dueDate, today)}</span>}
					<label className="relative inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[12px] text-fg-3 hover:bg-hover hover:text-fg-2" title="Otra fecha">
						<CalendarDays className="size-3.5" /> Otra
						<input
							type="date"
							value={dueDate ?? ''}
							onChange={(e) => {
								onDate(e.target.value || null);
								refocus();
							}}
							className="absolute inset-0 cursor-default opacity-0"
						/>
					</label>
				</div>
			</div>
			{(parsed.remindAt || parsed.company || parsed.flagged) && (
				<div className="flex items-center gap-2">
					<span className="w-10 shrink-0" />
					<div className="flex flex-wrap gap-1.5">
						{parsed.remindAt && (
							<Chip tone="accent" icon={<Bell />}>
								Aviso {timeOf(parsed.remindAt)}
							</Chip>
						)}
						{parsed.company && (
							<Chip tone="neutral" icon={<Building2 />}>
								{parsed.company}
							</Chip>
						)}
						{parsed.flagged && (
							<Chip tone="warn" icon={<Star />}>
								Destacada
							</Chip>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

export function Composer({
	defaults,
	placeholder,
	lockCategory = false,
}: {
	defaults: ComposerDefaults;
	placeholder: string;
	/** En una PoC el tipo es fijo: el menú solo ofrece la fecha. */
	lockCategory?: boolean;
}) {
	const [text, setText] = useState('');
	const [focused, setFocused] = useState(false);
	const [override, setOverride] = useState<Override>({});
	const ref = useRef<HTMLInputElement>(null);
	const today = useToday();
	const parsed = useQuickParse(text);
	const create = useCreateFromParsed();
	const composerFocus = useUI((s) => s.composerFocus);
	const select = useUI((s) => s.select);
	const { data: pocs = [] } = usePocs();

	useEffect(() => {
		if (composerFocus) ref.current?.focus();
	}, [composerFocus]);

	// Lo elegido en el menú manda sobre lo escrito; lo escrito, sobre lo de la vista.
	const category: Category = lockCategory ? defaults.category : (override.category ?? parsed.category ?? defaults.category);
	const pocId =
		category === 'poc' ? ((override.category === 'poc' ? override.pocId : undefined) ?? parsed.pocId ?? defaults.poc_id ?? null) : null;
	const dueDate = override.dueDate !== undefined ? override.dueDate : (parsed.dueDate ?? defaults.due_date ?? null);
	const remindAt = override.dueDate !== undefined && override.dueDate !== parsed.dueDate ? null : parsed.remindAt;

	const reset = () => {
		setText('');
		setOverride({});
	};

	const submit = async () => {
		const item = await create({ ...parsed, category, pocId, dueDate, remindAt }, { category, company: defaults.company }).catch(
			() => null,
		);
		if (!item) return;
		reset();
		// Si la tarea no va a la lista que estás viendo, dilo para que no parezca que se ha perdido.
		const elsewhere = item.category !== defaults.category || (defaults.poc_id != null && item.poc_id !== defaults.poc_id);
		if (elsewhere) {
			toast.success(`Añadida a ${item.poc_name ?? (item.category === 'followup' ? 'Follow-ups' : 'Tareas pendientes')}`, {
				description: item.title,
				action: { label: 'Abrir', onClick: () => select(item.id) },
			});
		}
	};

	// Tab recorre los tipos: tarea → follow-up → cada PoC.
	const cycleType = (back: boolean) => {
		const types: { category: Category; pocId: number | null }[] = [
			{ category: 'task', pocId: null },
			{ category: 'followup', pocId: null },
			...pocs.filter((p) => p.status === 'active').map((p) => ({ category: 'poc' as Category, pocId: p.id })),
		];
		const i = types.findIndex((t) => t.category === category && (t.category !== 'poc' || t.pocId === pocId));
		const next = types[(i + (back ? types.length - 1 : 1)) % types.length];
		setOverride((o) => ({ ...o, category: next.category, pocId: next.pocId }));
	};

	const open = focused && !!text;

	return (
		<div
			onFocus={() => setFocused(true)}
			onBlur={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
			}}
			className={cx(
				'mb-3 rounded-xl px-2.5 transition-[background,box-shadow]',
				focused ? 'bg-raised shadow-[0_0_0_1px_var(--line-strong),var(--shadow)]' : 'hover:bg-hover',
			)}
		>
			<div className="flex h-10 items-center gap-2.5">
				<Plus className={cx('size-[18px] shrink-0 transition-colors', focused ? 'text-accent' : 'text-fg-3')} />
				<input
					ref={ref}
					value={text}
					onChange={(e) => {
						setText(e.target.value);
						if (!e.target.value) setOverride({});
					}}
					onKeyDown={(e) => {
						if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit();
						if (e.key === 'Tab' && open && !lockCategory) {
							e.preventDefault();
							cycleType(e.shiftKey);
						}
						if (e.key === 'Escape') {
							reset();
							ref.current?.blur();
						}
					}}
					placeholder={placeholder}
					className="h-full min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-fg-3"
				/>
				{open && (
					<span className="shrink-0 text-[11px] text-fg-3">
						{!lockCategory && 'Tab cambia el tipo · '}↩ añadir
					</span>
				)}
			</div>
			<AnimatePresence>
				{open && (
					<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
						<ComposerMenu
							category={category}
							pocId={pocId}
							dueDate={dueDate}
							lockCategory={lockCategory}
							onType={(c, id) => setOverride((o) => ({ ...o, category: c, pocId: id ?? null }))}
							onDate={(d) => setOverride((o) => ({ ...o, dueDate: d }))}
							parsed={parsed}
							today={today}
							refocus={() => setTimeout(() => ref.current?.focus(), 0)}
						/>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
