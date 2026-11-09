// Campo de "nueva tarea" con lenguaje natural. Al escribir se abre debajo un menú por filas (tipo, empresa,
// PoC, RFP y fecha) con lo que ha entendido del texto ya marcado.

import { Bell, Building2, CalendarDays, Plus, Star, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { formatDay, relativeDay } from '../../shared/dates.js';
import { fold, parseQuick } from '../../shared/quickparse.js';
import { useActions, usePocs, useSuggestions, useToday } from '../api/hooks';
import type { Activity, Category, Item, Poc, PocKind } from '../api/types';
import { CATEGORY_LABEL, cx, timeOf } from '../lib/format';
import { isOpenPoc, pocsOfAccount } from '../lib/pocs';
import { useUI } from '../lib/store';
import { Chip, PocDot } from './bits';
import { quickDates } from './DatePicker';

export interface ComposerDefaults {
	category: Category;
	poc_id?: number;
	due_date?: string;
	company?: string;
}

/** Lo que se apunta: una tarea, un follow-up o una nota para el historial (la PoC va aparte). */
export type Kind = 'task' | 'followup' | 'note';

export interface Parsed {
	title: string;
	category: Category | 'note' | null;
	pocId: number | null;
	pocName: string | null;
	pocColor: string | null;
	dueDate: string | null;
	remindAt: string | null;
	flagged: boolean;
	company: string | null;
	/** El texto sin etiquetas pero con sus fechas: el cuerpo si es una nota. */
	text: string;
}

export type Created = { item: Item } | { note: Activity; where: string };

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
	return async (parsed: Parsed, defaults: ComposerDefaults): Promise<Created | null> => {
		const category = parsed.category ?? defaults.category;
		if (category === 'note') {
			// Una nota no es una tarea: va al historial de la PoC o, sin PoC, al de la empresa.
			const body = parsed.text || parsed.title;
			const company = parsed.company ?? defaults.company ?? null;
			const pocId = parsed.pocId ?? defaults.poc_id ?? null;
			if (!body) return null;
			if (!company && !pocId) {
				toast.error('¿De qué empresa es la nota? Elígela en el menú');
				return null;
			}
			const note = await a.addNote({ body, poc_id: pocId, company });
			return { note, where: (pocId && parsed.pocName) || company || 'la PoC' };
		}
		const pocId = parsed.pocId ?? (category === 'poc' ? defaults.poc_id : undefined);
		if (!parsed.title) return null;
		if (category === 'poc' && !pocId) {
			toast.error('¿De qué PoC o RFP? Escríbela con @, por ejemplo @Cafam');
			return null;
		}
		const item = await a.create({
			title: parsed.title,
			category,
			poc_id: pocId ?? null,
			due_date: parsed.dueDate ?? defaults.due_date ?? null,
			remind_at: parsed.remindAt,
			flagged: parsed.flagged,
			company: parsed.company ?? defaults.company ?? null,
		});
		return { item };
	};
}

export function ParsedChips({ parsed, defaults, today }: { parsed: Parsed; defaults: ComposerDefaults; today: string }) {
	const chips = [];
	if (parsed.category && parsed.category !== defaults.category && parsed.category !== 'poc')
		chips.push(
			<Chip key="cat" tone="accent">
				{parsed.category === 'note' ? 'Nota' : CATEGORY_LABEL[parsed.category]}
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

type Override = { kind?: Kind; pocId?: number | null; dueDate?: string | null; company?: string | null };

const KINDS: { value: Kind; label: string }[] = [
	{ value: 'followup', label: 'Follow-up' },
	{ value: 'task', label: 'Tarea' },
	{ value: 'note', label: 'Nota' },
];
/** PoCs (o RFPs) que se ven como botones; el resto, en «Otra PoC…» / «Otra RFP…». */
const POC_CHIPS = 5;

const chipClass = (on: boolean) =>
	cx(
		'inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-[12px] font-medium transition-colors',
		on ? 'bg-accent text-accent-fg' : 'bg-hover text-fg-2 hover:text-fg',
	);

// Que pulsar un botón del menú no quite el foco del campo (y no se cierre el menú).
const keep = (e: { preventDefault: () => void }) => e.preventDefault();

function Row({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex items-start gap-2">
			<span className="w-12 shrink-0 pt-[5px] text-[11px] text-fg-3">{label}</span>
			<div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">{children}</div>
		</div>
	);
}

/** Empresa: escribe para buscar entre las que ya hay o crear una nueva con ese nombre. */
function CompanyPicker({ value, onChange, refocus }: { value: string | null; onChange: (v: string | null) => void; refocus: () => void }) {
	const { data: sugg } = useSuggestions();
	const [editing, setEditing] = useState(false);
	const [q, setQ] = useState('');
	const [active, setActive] = useState(0);
	const [inputFocused, setInputFocused] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (editing) inputRef.current?.focus();
	}, [editing]);

	const companies = sugg?.companies ?? [];
	const fq = fold(q).trim();
	const matches = (
		fq
			? companies.filter((c) => fold(c).includes(fq)).sort((a, b) => Number(fold(b).startsWith(fq)) - Number(fold(a).startsWith(fq)))
			: companies
	)
		.filter((c) => fold(c).trim() !== fold(value ?? '').trim())
		.slice(0, 5);
	const exists = companies.some((c) => fold(c).trim() === fq);
	const options = [...matches.map((c) => ({ value: c, create: false })), ...(fq && !exists ? [{ value: q.trim(), create: true }] : [])];
	const current = Math.min(active, options.length - 1);

	const pick = (v: string) => {
		onChange(v);
		setEditing(false);
		setQ('');
		setActive(0);
		refocus();
	};
	const cancel = () => {
		setEditing(false);
		setQ('');
		refocus();
	};

	if (value && !editing) {
		return (
			<span className={cx(chipClass(true), 'pr-0.5')}>
				<button type="button" onMouseDown={keep} onClick={() => setEditing(true)} className="inline-flex items-center gap-1" title="Cambiar la empresa">
					<Building2 className="size-3" />
					{value}
				</button>
				<button
					type="button"
					onMouseDown={keep}
					onClick={() => onChange(null)}
					className="ml-0.5 inline-flex size-5 items-center justify-center rounded opacity-70 hover:opacity-100"
					title="Sin empresa"
				>
					<X className="size-3" />
				</button>
			</span>
		);
	}

	return (
		<>
			<input
				ref={inputRef}
				value={q}
				onChange={(e) => {
					setQ(e.target.value);
					setActive(0);
				}}
				onFocus={() => setInputFocused(true)}
				onBlur={() => {
					setInputFocused(false);
					if (value) setEditing(false);
				}}
				onKeyDown={(e) => {
					if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
						e.preventDefault();
						if (options.length) setActive((current + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
					}
					if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
						e.preventDefault();
						if (options[current]) pick(options[current].value);
						else cancel();
					}
					if (e.key === 'Escape') {
						e.preventDefault();
						e.stopPropagation();
						cancel();
					}
				}}
				placeholder="Buscar o crear empresa…"
				className="h-6 w-44 rounded-md bg-hover px-2 text-[12px] text-fg outline-none placeholder:text-fg-3 focus:ring-2 focus:ring-accent/40"
			/>
			{options.map((o, i) => (
				<button
					key={`${o.create}-${o.value}`}
					type="button"
					onMouseDown={keep}
					onClick={() => pick(o.value)}
					className={cx(
						o.create ? 'inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-accent-text hover:bg-accent-soft' : chipClass(false),
						inputFocused && i === current && 'ring-2 ring-accent/40',
					)}
				>
					{o.create ? <Plus className="size-3" /> : <Building2 className="size-3 text-fg-3" />}
					{o.create ? `Crear «${o.value}»` : o.value}
				</button>
			))}
		</>
	);
}

/**
 * Fila «PoC» o «RFP» del menú: primero las de la empresa elegida y después las últimas añadidas; el resto, en un
 * desplegable. Las dos filas eligen el mismo proyecto: «Ninguna» se marca si lo elegido no es de esta fila.
 */
function ProjectRow({
	kind,
	pocs,
	pocId,
	company,
	onPoc,
	refocus,
}: {
	kind: PocKind;
	pocs: Poc[];
	pocId: number | null;
	company: string | null;
	onPoc: (pocId: number | null) => void;
	refocus: () => void;
}) {
	const noun = kind === 'rfp' ? 'RFP' : 'PoC';
	const mine = pocs.filter((p) => p.kind === kind);
	const live = mine.filter((p) => isOpenPoc(p) || p.id === pocId);
	const recent = [...live].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
	const ofAccount = pocsOfAccount(mine, company, { paused: true });
	const ordered = [...ofAccount, ...recent].filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i);
	const shown = ordered.slice(0, POC_CHIPS);
	const more = ordered.slice(POC_CHIPS);
	const accountIds = new Set(ofAccount.map((p) => p.id));
	const selectedHere = pocId != null && mine.some((p) => p.id === pocId);
	const inMore = pocId != null && more.some((p) => p.id === pocId);

	return (
		<Row label={noun}>
			<button type="button" onMouseDown={keep} onClick={() => selectedHere && onPoc(null)} className={chipClass(!selectedHere)}>
				Ninguna
			</button>
			{shown.map((p) => (
				<button
					key={p.id}
					type="button"
					onMouseDown={keep}
					onClick={() => onPoc(p.id)}
					className={chipClass(pocId === p.id)}
					title={accountIds.has(p.id) ? `${noun} de ${company}` : undefined}
				>
					<PocDot color={p.color} className="size-1.5" />
					{p.name}
				</button>
			))}
			{more.length > 0 && (
				<select
					value={inMore ? pocId! : ''}
					onChange={(e) => {
						if (e.target.value) onPoc(Number(e.target.value));
						refocus();
					}}
					className={cx('h-6 rounded-md px-1.5 text-[12px] outline-none', inMore ? 'bg-accent text-accent-fg' : 'bg-hover text-fg-2')}
				>
					<option value="">Otra {noun}…</option>
					{more.map((p) => (
						<option key={p.id} value={p.id}>
							{p.name}
						</option>
					))}
				</select>
			)}
		</Row>
	);
}

/** Menú bajo el campo, en filas: tipo, empresa, PoC, RFP y fecha, con lo escrito ya preseleccionado. */
function ComposerMenu({
	kind,
	pocId,
	dueDate,
	company,
	lockCategory,
	onKind,
	onCompany,
	onPoc,
	onDate,
	parsed,
	today,
	refocus,
}: {
	kind: Kind;
	pocId: number | null;
	dueDate: string | null;
	company: string | null;
	lockCategory: boolean;
	onKind: (kind: Kind) => void;
	onCompany: (company: string | null) => void;
	onPoc: (pocId: number | null) => void;
	onDate: (date: string | null) => void;
	parsed: Parsed;
	today: string;
	refocus: () => void;
}) {
	const { data: pocs = [] } = usePocs();
	const dates = quickDates(today).slice(0, 6);
	const custom = dueDate && !dates.some((d) => d.value === dueDate);
	const hasRfps = pocs.some((p) => p.kind === 'rfp' && (p.status === 'active' || p.id === pocId));

	return (
		<div className="space-y-1.5 overflow-hidden pb-2.5 pl-7">
			{!lockCategory && (
				<>
					<Row label="Tipo">
						{KINDS.map((k) => (
							<button key={k.value} type="button" onMouseDown={keep} onClick={() => onKind(k.value)} className={chipClass(kind === k.value)}>
								{k.label}
							</button>
						))}
					</Row>
					<Row label="Empresa">
						<CompanyPicker value={company} onChange={onCompany} refocus={refocus} />
					</Row>
					<ProjectRow kind="poc" pocs={pocs} pocId={pocId} company={company} onPoc={onPoc} refocus={refocus} />
					{hasRfps && <ProjectRow kind="rfp" pocs={pocs} pocId={pocId} company={company} onPoc={onPoc} refocus={refocus} />}
				</>
			)}
			{kind !== 'note' && (
				<Row label="Fecha">
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
							// Un input de fecha invisible solo abre el calendario si aciertas en su icono; así se abre al hacer clic en cualquier parte.
							onClick={(e) => {
								try {
									e.currentTarget.showPicker();
								} catch {
									/* sin showPicker: se queda el comportamiento nativo */
								}
							}}
							className="absolute inset-0 cursor-default opacity-0"
						/>
					</label>
				</Row>
			)}
			{kind !== 'note' && (parsed.remindAt || parsed.flagged) && (
				<div className="flex items-center gap-2">
					<span className="w-12 shrink-0" />
					<div className="flex flex-wrap gap-1.5">
						{parsed.remindAt && (
							<Chip tone="accent" icon={<Bell />}>
								Aviso {timeOf(parsed.remindAt)}
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
	const go = useUI((s) => s.go);
	const { data: pocs = [] } = usePocs();

	useEffect(() => {
		if (composerFocus) ref.current?.focus();
	}, [composerFocus]);

	// Lo elegido en el menú manda sobre lo escrito; lo escrito, sobre lo de la vista.
	const defaultKind: Kind = defaults.category === 'followup' ? 'followup' : 'task';
	const parsedKind: Kind | null = parsed.category === 'poc' ? null : parsed.category;
	const kind: Kind = lockCategory ? defaultKind : (override.kind ?? parsedKind ?? defaultKind);
	const pocId = lockCategory ? (defaults.poc_id ?? null) : override.pocId !== undefined ? override.pocId : parsed.pocId;
	const poc = pocId != null ? pocs.find((p) => p.id === pocId) : undefined;
	const company = override.company !== undefined ? override.company : (parsed.company ?? defaults.company ?? null);
	// Con PoC, la tarea va a su checklist (sea tarea o follow-up); la nota, a su historial.
	const category: Category | 'note' = kind === 'note' ? 'note' : pocId != null ? 'poc' : kind;
	const dueDate = override.dueDate !== undefined ? override.dueDate : (parsed.dueDate ?? defaults.due_date ?? null);
	const remindAt = override.dueDate !== undefined && override.dueDate !== parsed.dueDate ? null : parsed.remindAt;

	const reset = () => {
		setText('');
		setOverride({});
	};

	const submit = async () => {
		const res = await create(
			{ ...parsed, category, pocId, pocName: poc?.name ?? null, company, dueDate, remindAt },
			{ category: defaults.category },
		).catch(() => null);
		if (!res) return;
		reset();
		if ('note' in res) {
			toast.success(`Nota guardada en ${res.where}`, {
				description: res.note.body ?? undefined,
				action: {
					label: 'Abrir',
					onClick: () => (pocId != null ? go({ kind: 'poc', id: pocId }) : company && go({ kind: 'account', name: company })),
				},
			});
			return;
		}
		const { item } = res;
		// Si la tarea no va a la lista que estás viendo, dilo para que no parezca que se ha perdido.
		const elsewhere = item.category !== defaults.category || (defaults.poc_id != null && item.poc_id !== defaults.poc_id);
		if (elsewhere) {
			toast.success(`Añadida a ${item.poc_name ?? (item.category === 'followup' ? 'Follow-ups' : 'Tareas pendientes')}`, {
				description: item.title,
				action: { label: 'Abrir', onClick: () => select(item.id) },
			});
		}
	};

	// Tab recorre los tipos: follow-up → tarea → nota.
	const cycleType = (back: boolean) => {
		const i = KINDS.findIndex((k) => k.value === kind);
		const next = KINDS[(i + (back ? KINDS.length - 1 : 1)) % KINDS.length];
		setOverride((o) => ({ ...o, kind: next.value }));
	};

	// Al elegir una PoC (o RFP) sin empresa puesta, la empresa es la suya.
	const choosePoc = (id: number | null) => {
		const p = id != null ? pocs.find((x) => x.id === id) : undefined;
		setOverride((o) => ({ ...o, pocId: id, ...(p?.company && !company ? { company: p.company } : {}) }));
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
						{!lockCategory && 'Tab cambia el tipo · '}↩ {kind === 'note' ? 'guardar nota' : 'añadir'}
					</span>
				)}
			</div>
			<AnimatePresence>
				{open && (
					<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
						<ComposerMenu
							kind={kind}
							pocId={pocId}
							dueDate={dueDate}
							company={company}
							lockCategory={lockCategory}
							onKind={(k) => setOverride((o) => ({ ...o, kind: k }))}
							onCompany={(c) => setOverride((o) => ({ ...o, company: c }))}
							onPoc={choosePoc}
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
