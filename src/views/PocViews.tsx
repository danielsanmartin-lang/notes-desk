import {
	Award,
	Ban,
	Building2,
	Ellipsis,
	ExternalLink,
	FlaskConical,
	Link2,
	ListChecks,
	Pause,
	Play,
	Plus,
	PencilRuler,
	RefreshCw,
	ScrollText,
	Search,
	Send,
	ThumbsDown,
	Trash2,
	Trophy,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { daysBetween, formatDay } from '../../shared/dates.js';
import { dealUrl } from '../../shared/hubspot.js';
import { fold } from '../../shared/quickparse.js';
import {
	useActions,
	useHubspotSearch,
	useHubspotStatus,
	useItems,
	usePoc,
	usePocs,
	useSettings,
	useToday,
} from '../api/hooks';
import type { Item, Poc, PocKind, RfpStage } from '../api/types';
import { Chip, DueChip, EmptyState, PocDot, ProgressBar } from '../components/bits';
import { StatTile } from '../components/charts';
import { Composer } from '../components/Composer';
import { CountryPicker } from '../components/CountryPicker';
import { PocFilters, type PocViewMode } from '../components/PocFilters';
import { Avatar, DeadlineChip, OpenDays, PocFacts, PocPeople, RfpFacts } from '../components/PocDetails';
import { RfpDocuments } from '../components/RfpDocuments';
import { DoneSection, Group, TaskList } from '../components/TaskList';
import { Timeline } from '../components/Timeline';
import {
	AutoTextarea,
	Button,
	Confirm,
	Dialog,
	IconButton,
	inputClass,
	Menu,
	MenuItem,
	MenuSeparator,
	Popover,
	SectionTitle,
	useDraft,
} from '../components/ui';
import { openExternal } from '../lib/bridge';
import { cx, flagEmoji, money, plural } from '../lib/format';
import {
	countryName,
	deadlineInfo,
	DEFAULT_DIR,
	defaultCurrency,
	EMPTY_FILTERS,
	filterPocs,
	formatAmount,
	hasFilters,
	isClosed,
	openSince,
	pocAmount,
	region,
	REGION_LABEL,
	REGIONS,
	RFP_STAGE_LABEL,
	rfpStage,
	sortPocs,
	totalsByCurrency,
	usePersistentState,
	type PocFilterState,
	type PocSort,
	type Region,
	type SortKey,
	type StatusFilter,
} from '../lib/pocs';
import { useUI } from '../lib/store';
import { useListIds, ViewBody, ViewHeader } from './common';

const POC_COLORS = ['#142CD1', '#1D9E75', '#D85A30', '#7F77DD', '#D4537E', '#BA7517', '#0E9AA7', '#639922'];

const RFP_STAGE_CHIP: Record<RfpStage, { tone: 'accent' | 'teal' | 'ok' | 'danger' | 'neutral'; icon: ReactNode }> = {
	preparing: { tone: 'accent', icon: <PencilRuler /> },
	submitted: { tone: 'teal', icon: <Send /> },
	won: { tone: 'ok', icon: <Award /> },
	lost: { tone: 'danger', icon: <ThumbsDown /> },
	declined: { tone: 'neutral', icon: <Ban /> },
};

function StatusChip({ poc, today }: { poc: Pick<Poc, 'kind' | 'status' | 'paused_until' | 'submitted_at' | 'close_reason'>; today: string }) {
	if (poc.kind === 'rfp') {
		const stage = rfpStage(poc);
		const c = RFP_STAGE_CHIP[stage];
		return (
			<Chip tone={c.tone} icon={c.icon}>
				{stage === 'submitted' && poc.submitted_at ? `Presentada el ${formatDay(poc.submitted_at, today)}` : RFP_STAGE_LABEL[stage]}
			</Chip>
		);
	}
	if (poc.status === 'active') return <Chip tone="ok">Activa</Chip>;
	if (poc.status === 'paused')
		return (
			<Chip tone="warn" icon={<Pause />}>
				{poc.paused_until ? `En pausa hasta ${formatDay(poc.paused_until, today)}` : 'En pausa'}
			</Chip>
		);
	if (poc.status === 'won')
		return (
			<Chip tone="ok" icon={<Trophy />}>
				Ganada
			</Chip>
		);
	return (
		<Chip tone="danger" icon={<ThumbsDown />}>
			Perdida
		</Chip>
	);
}

function waitedFor(since: string, today: string) {
	const d = daysBetween(since.slice(0, 10), today);
	return d <= 0 ? 'desde hoy' : `hace ${plural(d, 'día', 'días')}`;
}

/** Tarjeta de una RFP: su entrega con cuenta atrás, etapa, importe, fechas clave, progreso y siguiente tarea. */
function RfpCard({ poc, today }: { poc: Poc; today: string }) {
	const go = useUI((s) => s.go);
	const amount = pocAmount(poc);
	const stage = rfpStage(poc);
	const closed = stage === 'won' || stage === 'lost' || stage === 'declined';
	const dates = [
		poc.questions_deadline && !poc.submitted_at && !closed && `Preguntas ${formatDay(poc.questions_deadline, today)}`,
		poc.submission_deadline && `Entrega ${formatDay(poc.submission_deadline, today)}`,
		poc.tender_ref && `Exp. ${poc.tender_ref}`,
	].filter(Boolean);
	return (
		<motion.button
			layout
			type="button"
			onClick={() => go({ kind: 'poc', id: poc.id })}
			whileHover={{ y: -2 }}
			className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-raised p-4 text-left shadow-card transition-shadow hover:shadow-float"
		>
			<span className="absolute inset-x-0 top-0 h-1" style={{ background: poc.color ?? 'var(--accent)' }} />
			<div className="flex items-start gap-2">
				<div className="min-w-0 flex-1">
					<div className="truncate font-display text-[15px] font-semibold">
						{poc.name} {flagEmoji(poc.country)}
					</div>
					<div className="truncate text-[12px] text-fg-3">
						{poc.company ?? 'Sin empresa'}
						{poc.partner && <span> · vía {poc.partner}</span>}
					</div>
				</div>
				{poc.owner && (
					<span title={`Owner: ${poc.owner}`}>
						<Avatar name={poc.owner} color={poc.color} size={24} />
					</span>
				)}
			</div>
			<div className="mt-2.5 flex items-baseline justify-between gap-2">
				<span className={cx('text-[19px] leading-6 font-semibold', !amount && 'text-[13px] font-normal text-fg-3')}>
					{formatAmount(amount) ?? 'Sin importe'}
				</span>
				{poc.award_date && !closed && <span className="shrink-0 text-[11.5px] text-fg-3">Adjudicación {formatDay(poc.award_date, today)}</span>}
			</div>
			<div className="mt-2 flex flex-wrap gap-1.5">
				<StatusChip poc={poc} today={today} />
				<DeadlineChip poc={poc} today={today} />
				{poc.hubspot_stage && <Chip tone="teal">HubSpot · {poc.hubspot_stage}</Chip>}
				{!closed && poc.waiting > 0 && <Chip tone="warn">{poc.waiting} esperando</Chip>}
			</div>
			{dates.length > 0 && <div className="mt-2 truncate text-[11.5px] text-fg-2">{dates.join(' · ')}</div>}
			<div className="mt-3.5 flex items-center justify-between text-[11.5px] text-fg-3">
				<span>{poc.total ? `${poc.done} de ${poc.total} tareas` : 'Sin tareas'}</span>
				{poc.total > 0 && <span>{Math.round((poc.done / poc.total) * 100)}%</span>}
			</div>
			<div className="mt-1.5">
				<ProgressBar done={poc.done} total={poc.total} color={poc.color} />
			</div>
			<div className="mt-3 min-h-9 border-t border-line pt-2.5 text-[12px]">
				{closed && poc.closed_at ? (
					<span className="text-fg-2">
						{RFP_STAGE_LABEL[stage]} el {formatDay(poc.closed_at.slice(0, 10), today)}
					</span>
				) : poc.next ? (
					<div className="flex items-center gap-2">
						<span className="text-fg-3">Siguiente</span>
						<span className="min-w-0 flex-1 truncate text-fg">{poc.next.title}</span>
						{poc.next.due_date && <DueChip date={poc.next.due_date} today={today} />}
					</div>
				) : (
					<span className="text-fg-3">{poc.total ? 'Todas las tareas hechas' : 'Añade la primera tarea'}</span>
				)}
			</div>
		</motion.button>
	);
}

/** Tarjeta de una PoC o, si es RFP, la suya. */
export function PocCard({ poc, today }: { poc: Poc; today: string }) {
	if (poc.kind === 'rfp') return <RfpCard poc={poc} today={today} />;
	return <PocOnlyCard poc={poc} today={today} />;
}

function PocOnlyCard({ poc, today }: { poc: Poc; today: string }) {
	const go = useUI((s) => s.go);
	const idle = poc.last_activity_at ? daysBetween(poc.last_activity_at.slice(0, 10), today) : null;
	const amount = pocAmount(poc);
	return (
		<motion.button
			layout
			type="button"
			onClick={() => go({ kind: 'poc', id: poc.id })}
			whileHover={{ y: -2 }}
			className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-raised p-4 text-left shadow-card transition-shadow hover:shadow-float"
		>
			<span className="absolute inset-x-0 top-0 h-1" style={{ background: poc.color ?? 'var(--accent)' }} />
			<div className="flex items-start gap-2">
				<div className="min-w-0 flex-1">
					<div className="truncate font-display text-[15px] font-semibold">
						{poc.name} {flagEmoji(poc.country)}
					</div>
					<div className="truncate text-[12px] text-fg-3">
						{poc.company ?? 'Sin empresa'}
						{poc.partner && <span> · vía {poc.partner}</span>}
					</div>
				</div>
				{poc.owner && (
					<span title={`Owner: ${poc.owner}`}>
						<Avatar name={poc.owner} color={poc.color} size={24} />
					</span>
				)}
			</div>
			<div className="mt-2.5 flex items-baseline justify-between gap-2">
				<span className={cx('text-[19px] leading-6 font-semibold', !amount && 'text-[13px] font-normal text-fg-3')}>
					{formatAmount(amount) ?? 'Sin importe'}
				</span>
				{poc.hubspot_close_date && <span className="shrink-0 text-[11.5px] text-fg-3">Cierre {formatDay(poc.hubspot_close_date, today)}</span>}
			</div>
			<div className="mt-2 flex flex-wrap gap-1.5">
				<StatusChip poc={poc} today={today} />
				{poc.status !== 'won' && poc.status !== 'lost' && <OpenDays poc={poc} today={today} />}
				{poc.hubspot_stage && <Chip tone="teal">HubSpot · {poc.hubspot_stage}</Chip>}
				{poc.partner && (poc.status === 'active' || poc.status === 'paused') ? (
					<>
						{poc.client_waiting_since && <Chip tone="warn">Cliente sin responder {waitedFor(poc.client_waiting_since, today)}</Chip>}
						{poc.partner_waiting_since && (
							<Chip tone="warn">
								{poc.partner} sin responder {waitedFor(poc.partner_waiting_since, today)}
							</Chip>
						)}
					</>
				) : (
					poc.waiting > 0 && <Chip tone="warn">{poc.waiting} esperando</Chip>
				)}
			</div>
			{(poc.start_date || poc.admin_count > 0) && (
				<div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-fg-2">
					{poc.start_date && (
						<span>Inicio {formatDay(poc.start_date, today)}</span>
					)}
					{poc.admin_count > 0 && <span>{plural(poc.admin_count, 'admin', 'admins')} del cliente</span>}
				</div>
			)}
			<div className="mt-3.5 flex items-center justify-between text-[11.5px] text-fg-3">
				<span>{poc.total ? `${poc.done} de ${poc.total} tareas` : 'Sin tareas'}</span>
				{poc.total > 0 && <span>{Math.round((poc.done / poc.total) * 100)}%</span>}
			</div>
			<div className="mt-1.5">
				<ProgressBar done={poc.done} total={poc.total} color={poc.color} />
			</div>
			<div className="mt-3 min-h-9 border-t border-line pt-2.5 text-[12px]">
				{(poc.status === 'won' || poc.status === 'lost') && poc.closed_at ? (
					<span className="text-fg-2">
						{poc.status === 'won' ? 'Ganada' : 'Perdida'} el {formatDay(poc.closed_at.slice(0, 10), today)}
						{poc.start_date && <span className="text-fg-3"> · {Math.max(0, daysBetween(poc.start_date, poc.closed_at.slice(0, 10)))} días de PoC</span>}
					</span>
				) : poc.next ? (
					<div className="flex items-center gap-2">
						<span className="text-fg-3">Siguiente</span>
						<span className="min-w-0 flex-1 truncate text-fg">{poc.next.title}</span>
						{poc.next.due_date && <DueChip date={poc.next.due_date} today={today} />}
					</div>
				) : (
					<span className="text-fg-3">{poc.total ? 'Todas las tareas hechas' : 'Añade la primera tarea'}</span>
				)}
				{idle != null && idle > 0 && poc.status !== 'won' && poc.status !== 'lost' && (
					<div className="mt-0.5 text-[11px] text-fg-3">Último movimiento hace {plural(idle, 'día', 'días')}</div>
				)}
			</div>
		</motion.button>
	);
}

// Columnas de la vista lista. Las que tienen `sort` se pueden ordenar pulsando su cabecera. Las RFPs cambian
// inicio y cierre por entrega y adjudicación prevista.
const COLUMNS: Record<PocKind, { label: string; sort?: SortKey; className?: string }[]> = {
	poc: [
		{ label: 'PoC', sort: 'name' },
		{ label: 'Estado' },
		{ label: 'Owner' },
		{ label: 'Inicio', sort: 'start' },
		{ label: 'Importe', sort: 'amount', className: 'justify-end' },
		{ label: 'Cierre', sort: 'close' },
		{ label: 'Progreso', sort: 'progress' },
		{ label: 'Siguiente tarea' },
	],
	rfp: [
		{ label: 'RFP', sort: 'name' },
		{ label: 'Estado' },
		{ label: 'Owner' },
		{ label: 'Entrega', sort: 'deadline' },
		{ label: 'Importe', sort: 'amount', className: 'justify-end' },
		{ label: 'Adjudicación', sort: 'award' },
		{ label: 'Progreso', sort: 'progress' },
		{ label: 'Siguiente tarea' },
	],
};
const LIST_GRID = 'grid grid-cols-[minmax(170px,1.6fr)_118px_minmax(90px,0.8fr)_96px_96px_82px_100px_minmax(140px,1.4fr)] items-center gap-3';

function PocTable({ kind, pocs, today, sort, onSort }: { kind: PocKind; pocs: Poc[]; today: string; sort: PocSort; onSort: (s: PocSort) => void }) {
	const go = useUI((s) => s.go);
	const rfp = kind === 'rfp';
	return (
		<div className="overflow-x-auto rounded-xl border border-line bg-raised">
			<div className={cx(LIST_GRID, 'min-w-[980px] border-b border-line px-3 py-2 text-[11px] font-semibold text-fg-3')}>
				{COLUMNS[kind].map((c) =>
					c.sort ? (
						<button
							key={c.label}
							type="button"
							onClick={() => onSort({ key: c.sort!, dir: sort.key === c.sort ? (sort.dir === 'asc' ? 'desc' : 'asc') : DEFAULT_DIR[c.sort!] })}
							className={cx('flex items-center gap-1 text-left hover:text-fg-2', c.className, sort.key === c.sort && 'text-fg')}
						>
							{c.label}
							{sort.key === c.sort && <span aria-hidden="true">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
						</button>
					) : (
						<span key={c.label} className={cx('flex', c.className)}>
							{c.label}
						</span>
					),
				)}
			</div>
			{pocs.map((p) => {
				const amount = pocAmount(p);
				return (
					<button
						key={p.id}
						type="button"
						onClick={() => go({ kind: 'poc', id: p.id })}
						className={cx(LIST_GRID, 'min-w-[980px] w-full border-b border-line px-3 py-2.5 text-left text-[12.5px] last:border-b-0 hover:bg-hover')}
					>
						<span className="flex min-w-0 items-center gap-2">
							<PocDot color={p.color} />
							<span className="min-w-0">
								<span className="block truncate font-medium">
									{p.name} <span className="font-normal">{flagEmoji(p.country)}</span>
								</span>
								<span className="block truncate text-[11.5px] text-fg-3">
									{p.company ?? '—'}
									{p.partner && ` · vía ${p.partner}`}
								</span>
							</span>
						</span>
						<span className="min-w-0">
							<StatusChip poc={p} today={today} />
						</span>
						<span className="flex min-w-0 items-center gap-1.5">
							{p.owner ? (
								<>
									<Avatar name={p.owner} color={p.color} size={20} />
									<span className="truncate text-fg-2">{p.owner.split(' ')[0]}</span>
								</>
							) : (
								<span className="text-fg-3">—</span>
							)}
						</span>
						{rfp ? (
							<span className="min-w-0 text-fg-2">
								{p.submission_deadline ? formatDay(p.submission_deadline, today) : '—'}
								<RfpDeadlineHint poc={p} today={today} />
							</span>
						) : (
							<span className="min-w-0 text-fg-2">
								{p.start_date ? formatDay(p.start_date, today) : '—'}
								<span className="block text-[11px] text-fg-3">{openSince(p, today).label}</span>
							</span>
						)}
						<span className={cx('text-right font-semibold tabular-nums', !amount && 'font-normal text-fg-3')}>{formatAmount(amount) ?? '—'}</span>
						<span className="text-fg-2">
							{rfp ? (p.award_date ? formatDay(p.award_date, today) : '—') : p.hubspot_close_date ? formatDay(p.hubspot_close_date, today) : '—'}
						</span>
						<span className="flex items-center gap-2">
							<span className="w-12">
								<ProgressBar done={p.done} total={p.total} color={p.color} />
							</span>
							<span className="text-[11.5px] text-fg-3 tabular-nums">{p.total ? `${p.done}/${p.total}` : '—'}</span>
						</span>
						<span className="flex min-w-0 items-center gap-1.5">
							{p.next ? (
								<>
									<span className="truncate">{p.next.title}</span>
									{p.next.due_date && <DueChip date={p.next.due_date} today={today} />}
								</>
							) : (
								<span className="text-fg-3">—</span>
							)}
						</span>
					</button>
				);
			})}
		</div>
	);
}

/** Bajo la fecha de entrega, en la lista: cuánto falta, o cuándo se presentó. */
function RfpDeadlineHint({ poc, today }: { poc: Poc; today: string }) {
	const d = deadlineInfo(poc, today);
	if (d) return <span className={cx('block text-[11px]', d.tone === 'danger' ? 'text-danger' : d.tone === 'warn' ? 'text-warn' : 'text-fg-3')}>{d.label}</span>;
	if (poc.submitted_at) return <span className="block text-[11px] text-fg-3">Presentada {formatDay(poc.submitted_at, today)}</span>;
	return null;
}

const REGION_ICON: Record<Region, string> = { iberia: '🇪🇸 🇵🇹', latam: '🌎', none: '🏳️' };

type StatusOption = { value: StatusFilter; label: string };
const STATUSES: Record<PocKind, { open: StatusOption[]; closed: StatusOption[] }> = {
	poc: {
		open: [
			{ value: 'all', label: 'Todas' },
			{ value: 'active', label: 'Activas' },
			{ value: 'paused', label: 'En pausa' },
		],
		closed: [
			{ value: 'all', label: 'Todas' },
			{ value: 'won', label: 'Ganadas' },
			{ value: 'lost', label: 'Perdidas' },
		],
	},
	rfp: {
		open: [
			{ value: 'all', label: 'Todas' },
			{ value: 'preparing', label: 'En preparación' },
			{ value: 'submitted', label: 'Presentadas' },
		],
		closed: [
			{ value: 'all', label: 'Todas' },
			{ value: 'won', label: 'Adjudicadas' },
			{ value: 'lost', label: 'Perdidas' },
			{ value: 'declined', label: 'Descartadas' },
		],
	},
};

/** Textos e iconos de cada tablero. */
const BOARD = {
	poc: {
		noun: ['PoC', 'PoCs'],
		openIcon: <FlaskConical />,
		openIconClass: 'bg-[#7F77DD]/15 text-[#7F77DD]',
		closedIcon: <Trophy />,
		openTitle: 'PoCs en curso',
		closedTitle: 'PoCs concluidas',
		newLabel: 'Nueva PoC',
		emptyOpen: ['Ninguna PoC en curso', 'Crea una PoC para llevar su checklist: lo que te toca hacer, lo que esperas del cliente y su deal de HubSpot.'],
		emptyClosed: ['Aún no hay PoCs concluidas', 'Cuando marques una PoC como ganada o perdida, pasará aquí con su resumen.'],
		defaultSort: { key: 'amount', dir: 'desc' } as PocSort,
	},
	rfp: {
		noun: ['RFP', 'RFPs'],
		openIcon: <ScrollText />,
		openIconClass: 'bg-[#D85A30]/15 text-[#D85A30]',
		closedIcon: <Award />,
		openTitle: 'RFPs en curso',
		closedTitle: 'RFPs concluidas',
		newLabel: 'Nueva RFP',
		emptyOpen: ['Ninguna RFP en curso', 'Crea una RFP para llevar sus fechas límite, su documentación y todo lo que falta hasta entregarla.'],
		emptyClosed: ['Aún no hay RFPs concluidas', 'Cuando marques una RFP como adjudicada, perdida o descartada, pasará aquí con su resumen.'],
		defaultSort: { key: 'deadline', dir: 'asc' } as PocSort,
	},
} satisfies Record<PocKind, unknown>;

/** Tablero de PoCs o RFPs (en curso o concluidas) con filtros, orden, tarjetas o lista y secciones por región. */
function PocBoard({ kind, closed }: { kind: PocKind; closed: boolean }) {
	const today = useToday();
	const { data: pocs = [], isLoading } = usePocs();
	const setNewPocOpen = useUI((s) => s.setNewPocOpen);
	const b = BOARD[kind];
	const [filters, setFilters] = usePersistentState<PocFilterState>(`zd.${kind}s.${closed ? 'closed' : 'open'}.filters`, EMPTY_FILTERS);
	const [sort, setSort] = usePersistentState<PocSort>(`zd.${kind}s.sort`, b.defaultSort);
	const [view, setView] = usePersistentState<{ mode: PocViewMode }>(`zd.${kind}s.view`, { mode: 'cards' });
	useListIds([]);

	const base = pocs.filter((p) => p.kind === kind && (closed ? isClosed(p) : !isClosed(p)));
	const shown = sortPocs(filterPocs(base, filters), sort);
	const stageCount = (stage: RfpStage) => base.filter((p) => rfpStage(p) === stage).length;
	const won = base.filter((p) => p.status === 'won');
	const lost = base.filter((p) => (kind === 'rfp' ? rfpStage(p) === 'lost' : p.status === 'lost'));
	const declined = kind === 'rfp' ? stageCount('declined') : 0;
	const [emptyTitle, emptyText] = closed ? b.emptyClosed : b.emptyOpen;
	const nouns = (n: number) => plural(n, b.noun[0], b.noun[1]);

	const subtitle =
		kind === 'rfp'
			? closed
				? `${plural(won.length, 'adjudicada', 'adjudicadas')} · ${plural(lost.length, 'perdida', 'perdidas')} · ${plural(declined, 'descartada', 'descartadas')}`
				: `${stageCount('preparing')} en preparación · ${plural(stageCount('submitted'), 'presentada', 'presentadas')}`
			: closed
				? `${plural(won.length, 'ganada', 'ganadas')} · ${plural(lost.length, 'perdida', 'perdidas')}`
				: `${plural(base.filter((p) => p.status === 'active').length, 'activa', 'activas')} · ${base.filter((p) => p.status === 'paused').length} en pausa`;

	return (
		<>
			<ViewHeader
				icon={closed ? b.closedIcon : b.openIcon}
				iconClass={closed ? 'bg-ok-soft text-ok' : b.openIconClass}
				title={closed ? b.closedTitle : b.openTitle}
				subtitle={subtitle}
				right={
					!closed && (
						<Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setNewPocOpen(kind)}>
							{b.newLabel}
						</Button>
					)
				}
			/>
			<ViewBody className="max-w-[1180px]">
				{closed && base.length > 0 && (
					<div className={cx('mb-5 grid gap-2.5', kind === 'rfp' ? 'grid-cols-5' : 'grid-cols-4')}>
						<StatTile label={kind === 'rfp' ? 'Adjudicadas' : 'Ganadas'} value={won.length} />
						<StatTile label="Perdidas" value={lost.length} />
						{kind === 'rfp' && <StatTile label="Descartadas" value={declined} hint="No nos presentamos" />}
						<StatTile label="Tasa de éxito" value={won.length + lost.length ? `${Math.round((won.length / (won.length + lost.length)) * 100)}%` : '—'} />
						<StatTile
							label={kind === 'rfp' ? 'Importe adjudicado' : 'Importe ganado'}
							value={<span className="text-[18px]">{totalsByCurrency(won) ?? '—'}</span>}
						/>
					</div>
				)}
				{!isLoading && !base.length ? (
					<EmptyState icon={closed ? b.closedIcon : b.openIcon} title={emptyTitle}>
						{emptyText}
					</EmptyState>
				) : (
					<>
						<PocFilters
							kind={kind}
							pocs={base}
							filters={filters}
							onFilters={setFilters}
							sort={sort}
							onSort={setSort}
							mode={view.mode}
							onMode={(mode) => setView({ mode })}
							statuses={closed ? STATUSES[kind].closed : STATUSES[kind].open}
						/>
						{REGIONS.map((r) => {
							const list = shown.filter((p) => region(p.country) === r);
							const all = base.filter((p) => region(p.country) === r);
							// Con filtros, las regiones sin resultados no ocupan sitio (si todo queda vacío, un solo aviso abajo).
							if (!all.length || (hasFilters(filters) && !list.length)) return null;
							const total = totalsByCurrency(list);
							return (
								<section key={r} className="mb-8">
									<div className="mb-3 flex items-baseline gap-2.5">
										<h2 className="font-display text-[16px] font-semibold">
											<span className="mr-1.5 text-[14px]">{REGION_ICON[r]}</span>
											{REGION_LABEL[r]}
										</h2>
										<span className="text-[12px] text-fg-3">{nouns(list.length)}</span>
										{total && <span className="text-[12.5px] font-medium text-fg-2">{total}</span>}
										{r === 'none' && <span className="text-[11.5px] text-fg-3">Ponles país para que salgan en su región</span>}
									</div>
									{!list.length ? (
										<div className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-[12.5px] text-fg-3">Ninguna {b.noun[0]} con estos filtros.</div>
									) : view.mode === 'list' ? (
										<PocTable kind={kind} pocs={list} today={today} sort={sort} onSort={setSort} />
									) : (
										<div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
											{list.map((p) => (
												<PocCard key={p.id} poc={p} today={today} />
											))}
										</div>
									)}
								</section>
							);
						})}
						{hasFilters(filters) && !shown.length && (
							<div className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-[12.5px] text-fg-3">
								Ninguna {b.noun[0]} con estos filtros.{' '}
								<button type="button" className="text-accent-text" onClick={() => setFilters(EMPTY_FILTERS)}>
									Limpiar filtros
								</button>
							</div>
						)}
					</>
				)}
			</ViewBody>
		</>
	);
}

export const PocsView = () => <PocBoard kind="poc" closed={false} />;
export const ClosedPocsView = () => <PocBoard kind="poc" closed />;
export const RfpsView = () => <PocBoard kind="rfp" closed={false} />;
export const ClosedRfpsView = () => <PocBoard kind="rfp" closed />;

export function NewPocDialog() {
	const { newPocOpen, setNewPocOpen, go } = useUI();
	const a = useActions();
	// Se queda con el último tipo abierto para que el diálogo no cambie de textos mientras se cierra.
	const [kind, setKind] = useState<PocKind>('poc');
	if (newPocOpen && newPocOpen !== kind) setKind(newPocOpen);
	const rfp = kind === 'rfp';
	const empty = {
		name: '',
		company: '',
		country: '',
		partner: '',
		owner: '',
		start_date: '',
		submission_deadline: '',
		hubspot: '',
		amount: '',
		currency: 'EUR',
	};
	const [form, setForm] = useState(empty);
	// La divisa sigue al país (EUR en Iberia, USD en LATAM) hasta que la cambias a mano.
	const [currencyTouched, setCurrencyTouched] = useState(false);
	const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

	const submit = async () => {
		if (!form.name.trim()) return;
		const { amount, start_date, submission_deadline, ...rest } = form;
		const poc = await a.createPoc({
			...rest,
			kind,
			...(rfp ? { submission_deadline } : { start_date }),
			...(amount.trim() ? { amount: amount as unknown as number } : {}),
		});
		setNewPocOpen(false);
		setForm(empty);
		setCurrencyTouched(false);
		go({ kind: 'poc', id: poc.id });
	};

	return (
		<Dialog
			open={!!newPocOpen}
			onOpenChange={(open) => setNewPocOpen(open ? kind : false)}
			title={rfp ? 'Nueva RFP' : 'Nueva PoC'}
			description={rfp ? 'Lo básico; las demás fechas, el portal y la documentación, en su ficha.' : 'Solo lo necesario para seguir sus tareas.'}
		>
			<form
				className="space-y-3"
				onSubmit={(e) => {
					e.preventDefault();
					submit();
				}}
			>
				<label className="block">
					<span className="mb-1 block text-[12px] font-medium text-fg-2">Nombre</span>
					<input autoFocus value={form.name} onChange={set('name')} placeholder={rfp ? 'Licitación SOC Metro' : 'Cafam'} className={inputClass} />
				</label>
				<div className="grid grid-cols-[1fr_190px] gap-2">
					<label className="block">
						<span className="mb-1 block text-[12px] font-medium text-fg-2">Empresa</span>
						<input
							value={form.company}
							onChange={set('company')}
							list="zd-companies"
							placeholder={rfp ? 'Metro de Madrid' : 'Caja de Compensación Familiar'}
							className={inputClass}
						/>
					</label>
					<div>
						<span className="mb-1 block text-[12px] font-medium text-fg-2">País</span>
						<CountryPicker
							value={form.country || null}
							onChange={(code) =>
								setForm({ ...form, country: code ?? '', currency: currencyTouched ? form.currency : defaultCurrency(code) })
							}
						/>
					</div>
				</div>
				<div className="grid grid-cols-[1fr_190px] gap-2">
					<label className="block">
						<span className="mb-1 block text-[12px] font-medium text-fg-2">{rfp ? 'Importe o presupuesto (opcional)' : 'Importe (opcional)'}</span>
						<input value={form.amount} onChange={set('amount')} inputMode="decimal" placeholder="20.000" className={inputClass} />
					</label>
					<div>
						<span className="mb-1 block text-[12px] font-medium text-fg-2">Divisa</span>
						<div className="flex h-8 gap-0.5 rounded-lg bg-hover p-0.5">
							{[
								{ value: 'EUR', label: '€ Euros' },
								{ value: 'USD', label: 'US$ Dólares' },
							].map((c) => (
								<button
									key={c.value}
									type="button"
									onClick={() => {
										setForm({ ...form, currency: c.value });
										setCurrencyTouched(true);
									}}
									className={cx(
										'flex-1 rounded-md text-[12px] font-medium transition-colors',
										form.currency === c.value ? 'bg-raised text-fg shadow-sm' : 'text-fg-3 hover:text-fg-2',
									)}
								>
									{c.label}
								</button>
							))}
						</div>
					</div>
				</div>
				<div className="grid grid-cols-[1fr_150px] gap-2">
					<label className="block">
						<span className="mb-1 block text-[12px] font-medium text-fg-2">Owner</span>
						<input value={form.owner} onChange={set('owner')} list="zd-owners" placeholder="¿Quién la lleva?" className={inputClass} />
					</label>
					{rfp ? (
						<label className="block">
							<span className="mb-1 block text-[12px] font-medium text-fg-2">Entrega</span>
							<input type="date" value={form.submission_deadline} onChange={set('submission_deadline')} className={inputClass} />
						</label>
					) : (
						<label className="block">
							<span className="mb-1 block text-[12px] font-medium text-fg-2">Fecha de inicio</span>
							<input type="date" value={form.start_date} onChange={set('start_date')} className={inputClass} />
						</label>
					)}
				</div>
				<div className="grid grid-cols-[190px_1fr] gap-2">
					<label className="block">
						<span className="mb-1 block text-[12px] font-medium text-fg-2">Partner (opcional)</span>
						<input value={form.partner} onChange={set('partner')} list="zd-partners" placeholder="Sofistic, TRC…" className={inputClass} />
					</label>
					<label className="block">
						<span className="mb-1 block text-[12px] font-medium text-fg-2">Deal de HubSpot (opcional)</span>
						<input value={form.hubspot} onChange={set('hubspot')} placeholder="Pega el enlace del deal o su ID" className={inputClass} />
					</label>
				</div>
				<div className="flex justify-end gap-2 pt-2">
					<Button type="button" onClick={() => setNewPocOpen(false)}>
						Cancelar
					</Button>
					<Button type="submit" variant="primary" disabled={!form.name.trim()}>
						{rfp ? 'Crear RFP' : 'Crear PoC'}
					</Button>
				</div>
			</form>
		</Dialog>
	);
}

function HubspotCard({ poc, today }: { poc: Poc; today: string }) {
	const a = useActions();
	const { data: status } = useHubspotStatus();
	const { data: settings } = useSettings();
	const [editing, setEditing] = useState(false);
	const [link, setLink] = useState('');
	const [searchOpen, setSearchOpen] = useState(false);
	const [q, setQ] = useState(poc.company ?? poc.name);
	const { data: deals, isFetching, error } = useHubspotSearch(q, searchOpen && !!status?.connected);
	const url = poc.hubspot_url ?? dealUrl(settings?.hubspot_portal_id, poc.hubspot_deal_id);

	const saveLink = async (value: string) => {
		const updated = await a.updatePoc(poc.id, { hubspot: value });
		setEditing(false);
		setLink('');
		if (updated.hubspot_deal_id && status?.connected) {
			a.syncHubspot(poc.id).catch(() => {});
		}
	};

	const sync = async () => {
		await a.syncHubspot(poc.id);
		toast.success('Datos de HubSpot actualizados');
	};

	if (!poc.hubspot_deal_id || editing) {
		return (
			<div className="rounded-xl border border-dashed border-line-strong p-3">
				<div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-fg-2">
					<Link2 className="size-3.5" /> Deal de HubSpot
				</div>
				<div className="flex gap-2">
					<input
						value={link}
						onChange={(e) => setLink(e.target.value)}
						onKeyDown={(e) => e.key === 'Enter' && link.trim() && saveLink(link)}
						placeholder="Pega el enlace del deal o su ID"
						className={inputClass}
					/>
					<Button onClick={() => link.trim() && saveLink(link)} disabled={!link.trim()}>
						Enlazar
					</Button>
					{status?.connected && (
						<Popover
							open={searchOpen}
							onOpenChange={setSearchOpen}
							align="end"
							className="w-80"
							trigger={<Button icon={<Search className="size-3.5" />}>Buscar</Button>}
						>
							<input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca entre tus deals" className={inputClass} />
							<div className="scroll mt-2 max-h-64">
								{error && <div className="p-2 text-[12px] text-danger">{(error as Error).message}</div>}
								{isFetching && !deals && <div className="p-2 text-[12px] text-fg-3">Buscando…</div>}
								{deals?.map((d) => (
									<button
										key={d.id}
										type="button"
										onClick={() => {
											setSearchOpen(false);
											saveLink(d.id);
										}}
										className="flex w-full flex-col rounded-lg px-2 py-1.5 text-left hover:bg-hover"
									>
										<span className="text-[12.5px] font-medium">{d.name}</span>
										<span className="text-[11px] text-fg-3">
											{[d.stage, money(d.amount, d.currency), d.closeDate && `cierre ${formatDay(d.closeDate, today)}`].filter(Boolean).join(' · ')}
										</span>
									</button>
								))}
								{deals && !deals.length && <div className="p-2 text-[12px] text-fg-3">Sin resultados</div>}
							</div>
						</Popover>
					)}
					{editing && (
						<Button variant="ghost" onClick={() => setEditing(false)}>
							Cancelar
						</Button>
					)}
				</div>
				{!status?.connected && (
					<div className="mt-2 text-[11px] text-fg-3">
						Para ver la etapa y el importe del deal, añade <code>HUBSPOT_TOKEN</code> a <code>~/.hermes/.env</code>.
					</div>
				)}
			</div>
		);
	}

	return (
		<div className="flex items-start gap-3 rounded-xl bg-teal-soft/60 p-3">
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2 text-[12px] font-medium text-teal">
					<Link2 className="size-3.5" /> HubSpot
					{poc.hubspot_stage && <Chip tone="teal">{poc.hubspot_stage}</Chip>}
				</div>
				<div className="mt-1 truncate text-[13px] font-medium">{poc.hubspot_name ?? `Deal ${poc.hubspot_deal_id}`}</div>
				<div className="mt-0.5 text-[11.5px] text-fg-2">
					{[
						money(poc.hubspot_amount, poc.hubspot_currency),
						poc.hubspot_close_date && `cierre ${formatDay(poc.hubspot_close_date, today)}`,
						poc.hubspot_synced_at ? `actualizado ${formatDay(poc.hubspot_synced_at.slice(0, 10), today)}` : status?.connected ? 'sin sincronizar' : null,
					]
						.filter(Boolean)
						.join(' · ')}
				</div>
			</div>
			<div className="flex shrink-0 items-center gap-1">
				{url && (
					<Button size="xs" icon={<ExternalLink className="size-3" />} onClick={() => openExternal(url)}>
						Abrir
					</Button>
				)}
				{status?.connected && (
					<IconButton label="Sincronizar con HubSpot" onClick={sync}>
						<RefreshCw className="size-3.5" />
					</IconButton>
				)}
				<Menu
					trigger={
						<IconButton label="Más">
							<Ellipsis className="size-3.5" />
						</IconButton>
					}
				>
					<MenuItem icon={<Link2 />} onSelect={() => setEditing(true)}>
						Cambiar deal
					</MenuItem>
					<MenuItem icon={<Trash2 />} danger onSelect={() => a.updatePoc(poc.id, { hubspot: null })}>
						Quitar enlace
					</MenuItem>
				</Menu>
			</div>
		</div>
	);
}

/**
 * «Tareas de PoC» (o «de RFP»): las de Ajustes salen como sugerencias bajo las tareas de la PoC. Un clic y pasan a ser
 * una tarea más (arriba, con las escritas a mano); las que ya tiene la PoC, hechas o no, no se ofrecen.
 */
function PocTaskSuggestions({ pocId, kind, tasks }: { pocId: number; kind: PocKind; tasks: Item[] }) {
	const a = useActions();
	const go = useUI((s) => s.go);
	const { data: settings } = useSettings();
	const [adding, setAdding] = useState<string[]>([]);
	const have = new Set(tasks.map((t) => fold(t.title).trim()));
	const template = kind === 'rfp' ? settings?.rfp_template : settings?.poc_template;
	const lines = [...new Set((template ?? '').split('\n').map((l) => l.trim()).filter(Boolean))];
	const pending = lines.filter((l) => !have.has(fold(l)) && !adding.includes(l));
	if (!lines.length) return null;

	const add = async (title: string) => {
		setAdding((x) => [...x, title]);
		try {
			await a.create({ category: 'poc', poc_id: pocId, title });
		} finally {
			setAdding((x) => x.filter((t) => t !== title));
		}
	};

	return (
		<AnimatePresence initial={false}>
			{pending.length > 0 && (
				<motion.section
					key="suggestions"
					initial={{ opacity: 0, height: 0 }}
					animate={{ opacity: 1, height: 'auto' }}
					exit={{ opacity: 0, height: 0 }}
					transition={{ duration: 0.2 }}
					className="overflow-hidden"
				>
					<div className="mt-3 mb-1 flex items-center gap-2 px-2.5">
						<span className="flex items-center gap-1.5 text-[12px] font-semibold text-fg-2">
							<ListChecks className="size-3.5" />
							Tareas de {kind === 'rfp' ? 'RFP' : 'PoC'}
						</span>
						<span className="text-[11.5px] text-fg-3">Haz clic en una para añadirla</span>
						<button type="button" onClick={() => go({ kind: 'settings' })} className="ml-auto rounded-md px-1.5 text-[11.5px] text-fg-3 hover:bg-hover hover:text-fg-2">
							Editar en Ajustes
						</button>
					</div>
					<AnimatePresence initial={false}>
						{pending.map((title) => (
							<motion.button
								key={title}
								type="button"
								layout="position"
								exit={{ opacity: 0, height: 0, transition: { duration: 0.18 } }}
								onClick={() => add(title)}
								className="group flex w-full items-center gap-2.5 overflow-hidden rounded-xl px-2.5 py-2 text-left text-fg-2 transition-colors hover:bg-hover hover:text-fg"
							>
								<span className="flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-fg-3/70 text-fg-3 transition-colors group-hover:border-solid group-hover:border-accent group-hover:bg-accent group-hover:text-accent-fg">
									<Plus className="size-3" />
								</span>
								<span className="min-w-0 flex-1 text-[13.5px] leading-5">{title}</span>
								<span className="text-[11.5px] font-medium text-accent-text opacity-0 transition-opacity group-hover:opacity-100">Añadir</span>
							</motion.button>
						))}
					</AnimatePresence>
				</motion.section>
			)}
		</AnimatePresence>
	);
}

/** Menú «Estado» de una RFP: las etapas que no son la actual y borrarla. */
function RfpStageMenu({ poc, onDelete }: { poc: Poc; onDelete: () => void }) {
	const a = useActions();
	const stage = rfpStage(poc);
	const closed = stage === 'won' || stage === 'lost' || stage === 'declined';
	const set = (status: RfpStage) => a.setPocStatus(poc.id, { status });
	return (
		<>
			{stage !== 'preparing' && (
				<MenuItem icon={<PencilRuler />} onSelect={() => set('preparing')}>
					{closed ? 'Reabrir en preparación' : 'Volver a preparación'}
				</MenuItem>
			)}
			{stage !== 'submitted' && (
				<MenuItem icon={<Send />} onSelect={() => set('submitted')}>
					{closed && poc.submitted_at ? 'Reabrir como presentada' : 'Marcar como presentada hoy'}
				</MenuItem>
			)}
			{stage !== 'won' && (
				<MenuItem
					icon={<Award />}
					onSelect={async () => {
						await set('won');
						toast.success(`¡${poc.name} adjudicada!`);
					}}
				>
					Marcar como adjudicada
				</MenuItem>
			)}
			{stage !== 'lost' && (
				<MenuItem icon={<ThumbsDown />} onSelect={() => set('lost')}>
					Marcar como perdida
				</MenuItem>
			)}
			{stage !== 'declined' && (
				<MenuItem icon={<Ban />} onSelect={() => set('declined')}>
					Descartar (no nos presentamos)
				</MenuItem>
			)}
			<MenuSeparator />
			<MenuItem icon={<Trash2 />} danger onSelect={onDelete}>
				Borrar RFP
			</MenuItem>
		</>
	);
}

export function PocView({ id }: { id: number }) {
	const today = useToday();
	const { data, isError } = usePoc(id);
	const { data: list } = useItems('poc', { poc: id });
	const a = useActions();
	const go = useUI((s) => s.go);
	const select = useUI((s) => s.select);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [noteText, setNoteText] = useState('');
	const poc = data?.poc;
	const name = useDraft(poc?.name, (v) => v && poc && a.updatePoc(poc.id, { name: v }));
	const company = useDraft(poc?.company, (v) => poc && a.updatePoc(poc.id, { company: v }));
	const notes = useDraft(poc?.notes, (v) => poc && a.updatePoc(poc.id, { notes: v }));
	const items = list?.items ?? [];
	useListIds(items.map((i) => i.id));

	if (isError)
		return (
			<ViewBody>
				<EmptyState icon={<FlaskConical />} title="Ya no existe" />
			</ViewBody>
		);
	if (!poc) return null;
	const rfp = poc.kind === 'rfp';
	const noun = rfp ? 'RFP' : 'PoC';
	const live = poc.status === 'active' || poc.status === 'paused';

	const addNote = async () => {
		if (!noteText.trim()) return;
		await a.pocNote(poc.id, noteText.trim());
		setNoteText('');
	};

	return (
		<>
			<header className="drag shrink-0 px-10 pt-9 pb-4">
				<div className="flex items-center gap-3">
					<Popover
						trigger={
							<button type="button" className="no-drag flex size-8 items-center justify-center rounded-xl hover:bg-hover" aria-label="Color">
								<PocDot color={poc.color} className="size-4" />
							</button>
						}
					>
						<div className="grid grid-cols-4 gap-2">
							{POC_COLORS.map((c) => (
								<button
									key={c}
									type="button"
									onClick={() => a.updatePoc(poc.id, { color: c })}
									className={cx('size-7 rounded-full ring-offset-2 ring-offset-raised', poc.color === c && 'ring-2 ring-fg-3')}
									style={{ background: c }}
									aria-label={`Color ${c}`}
								/>
							))}
						</div>
					</Popover>
					<input
						{...name}
						onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
						className="no-drag min-w-0 flex-1 bg-transparent font-display text-[26px] leading-8 font-bold tracking-tight outline-none"
					/>
					<div className="no-drag flex items-center gap-2">
						<StatusChip poc={poc} today={today} />
						{rfp ? <DeadlineChip poc={poc} today={today} /> : <OpenDays poc={poc} today={today} />}
						<Menu
							trigger={
								<Button size="sm" icon={<Ellipsis className="size-3.5" />}>
									Estado
								</Button>
							}
						>
							{rfp ? (
								<RfpStageMenu poc={poc} onDelete={() => setConfirmDelete(true)} />
							) : (
								<>
									{poc.status !== 'active' && (
										<MenuItem icon={<Play />} onSelect={() => a.setPocStatus(poc.id, { status: 'active' })}>
											Reactivar
										</MenuItem>
									)}
									{poc.status !== 'paused' && (
										<MenuItem icon={<Pause />} onSelect={() => a.setPocStatus(poc.id, { status: 'paused' })}>
											Pausar
										</MenuItem>
									)}
									<MenuItem
										icon={<Trophy />}
										onSelect={async () => {
											await a.setPocStatus(poc.id, { status: 'won' });
											toast.success(`¡${poc.name} ganada!`);
										}}
									>
										Marcar como ganada
									</MenuItem>
									<MenuItem icon={<ThumbsDown />} onSelect={() => a.setPocStatus(poc.id, { status: 'lost' })}>
										Marcar como perdida
									</MenuItem>
									<MenuSeparator />
									<MenuItem icon={<Trash2 />} danger onSelect={() => setConfirmDelete(true)}>
										Borrar PoC
									</MenuItem>
								</>
							)}
						</Menu>
					</div>
				</div>
				<div className="mt-1 flex items-center gap-1 pl-11">
					{poc.company && (
						<button
							type="button"
							onClick={() => go({ kind: 'account', name: poc.company! })}
							title={`Ver la cuenta ${poc.company}`}
							className="no-drag flex size-6 items-center justify-center rounded-md text-fg-3 hover:bg-hover hover:text-accent-text"
						>
							<Building2 className="size-3.5" />
						</button>
					)}
					<input {...company} placeholder="Empresa" className="no-drag h-6 min-w-16 rounded-md [field-sizing:content] bg-transparent px-1 text-[12.5px] text-fg-2 outline-none hover:bg-hover focus:bg-hover" />
					<span className="text-fg-3">·</span>
					<CountryPicker
						value={poc.country}
						onChange={(code) =>
							// Sin importe todavía, la divisa sigue al país; si ya hay importe, se respeta la que tenga.
							a.updatePoc(poc.id, { country: code, ...(poc.amount == null ? { currency: defaultCurrency(code) } : {}) })
						}
						trigger={
							<button
								type="button"
								className="no-drag flex h-6 items-center gap-1.5 rounded-md px-1 text-[12.5px] text-fg-2 hover:bg-hover"
								title="Cambiar país"
							>
								{poc.country ? (
									<>
										{flagEmoji(poc.country)} {countryName(poc.country)}
									</>
								) : (
									<span className="text-fg-3">Elegir país</span>
								)}
							</button>
						}
					/>
					{poc.next && live && (
						<button
							type="button"
							onClick={() => select(poc.next!.id)}
							title={`Próximo paso${poc.next.poc_id ? '' : ` (apuntado en la cuenta ${poc.company})`}: ${poc.next.title}`}
							className="no-drag ml-auto flex h-6 max-w-[45%] min-w-0 items-center gap-1.5 rounded-md px-1.5 text-[12px] hover:bg-hover"
						>
							<span className="shrink-0 text-fg-3">Próximo</span>
							{!poc.next.poc_id && <Building2 className="size-3 shrink-0 text-fg-3" />}
							<span className="min-w-0 truncate font-medium text-fg">{poc.next.title}</span>
							{poc.next.due_date && <DueChip date={poc.next.due_date} today={today} />}
						</button>
					)}
				</div>
			</header>

			<ViewBody>
				{poc.status === 'paused' && (
					<div className="mb-4 flex items-center gap-3 rounded-xl bg-warn-soft px-3.5 py-2.5 text-[12.5px]">
						<Pause className="size-4 text-warn" />
						<span className="flex-1">
							{poc.paused_until ? `En pausa hasta el ${formatDay(poc.paused_until, today)}.` : 'En pausa.'} Sus tareas no salen en Inicio ni en
							Próximos hasta que la reactives; los días abierta siguen contando.
						</span>
						<Button size="xs" icon={<Play className="size-3" />} onClick={() => a.setPocStatus(poc.id, { status: 'active' })}>
							Reactivar
						</Button>
					</div>
				)}

				{rfp ? <RfpFacts poc={poc} today={today} /> : <PocFacts poc={poc} today={today} />}
				<HubspotCard poc={poc} today={today} />
				{rfp && <RfpDocuments pocId={poc.id} today={today} />}

				<div className="mt-5 mb-2 flex items-center gap-3">
					<div className="flex-1">
						<ProgressBar done={poc.done} total={poc.total} color={poc.color} />
					</div>
					<span className="text-[12px] text-fg-2">{poc.total ? `${poc.done} de ${poc.total}` : 'Sin tareas'}</span>
				</div>

				<Composer
					lockCategory
					defaults={{ category: 'poc', poc_id: poc.id }}
					placeholder={rfp ? 'Añadir tarea a la RFP… (prueba «Enviar preguntas de aclaración el jueves»)' : 'Añadir tarea a la PoC… (prueba «Kickoff con Brigitte el jueves»)'}
				/>
				<TaskList items={items} today={today} options={{ sortable: true, listKey: `poc-${poc.id}`, queryKey: ['items', 'poc', { poc: poc.id }] }} />
				{list && live && <PocTaskSuggestions pocId={poc.id} kind={poc.kind} tasks={[...items, ...list.done]} />}
				<DoneSection items={list?.done ?? []} today={today} title="Hechas" defaultOpen />

				{data.account_items.length > 0 && (
					<div className="mt-6">
						<Group
							title={`Apuntado en la cuenta ${poc.company}`}
							icon={<Building2 />}
							count={data.account_items.length}
							right={<span className="text-[11.5px] text-fg-3">Fuera de la {noun}: no cuenta en el progreso</span>}
						>
							<TaskList
								items={data.account_items}
								today={today}
								options={{ showCategory: true, listKey: `poc-${poc.id}-account`, movePocs: poc.status === 'active' ? [poc] : [] }}
							/>
						</Group>
					</div>
				)}

				<PocPeople poc={poc} people={data.contacts} kind="main" />
				{!rfp && <PocPeople poc={poc} people={data.contacts} kind="admin" />}
				{poc.partner && <PocPeople poc={poc} people={data.contacts} kind="partner" />}

				<div className="mt-8">
					<SectionTitle>Notas de la {noun}</SectionTitle>
					<AutoTextarea {...notes} placeholder="Contexto, contactos, acuerdos…" className="min-h-[60px] rounded-xl bg-hover px-3.5 py-2.5 text-[13px] leading-5" />
				</div>

				<div className="mt-8">
					<SectionTitle>Historial</SectionTitle>
					<input
						value={noteText}
						onChange={(e) => setNoteText(e.target.value)}
						onKeyDown={(e) => e.key === 'Enter' && addNote()}
						placeholder={`Añadir una nota al historial de la ${noun}…`}
						className={cx(inputClass, 'mb-3')}
					/>
					<Timeline entries={data.activity} today={today} showItem onDelete={(e) => a.deleteActivity(e.id)} />
				</div>
			</ViewBody>

			<Confirm
				open={confirmDelete}
				onOpenChange={setConfirmDelete}
				title={`¿Borrar ${poc.name}?`}
				description={
					rfp
						? 'Se borran la RFP, todas sus tareas y su historial, y su documentación va a la Papelera de macOS. Si solo ha terminado, márcala como adjudicada, perdida o descartada.'
						: 'Se borran la PoC, todas sus tareas y su historial. No se puede deshacer. Si solo ha terminado, márcala como ganada o perdida.'
				}
				confirm={`Borrar ${noun}`}
				onConfirm={async () => {
					await a.deletePoc(poc.id);
					go({ kind: rfp ? 'rfps' : 'pocs' });
				}}
			/>
		</>
	);
}
