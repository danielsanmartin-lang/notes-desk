import {
	Building2,
	ChevronRight,
	Ellipsis,
	ExternalLink,
	FlaskConical,
	Link2,
	Pause,
	Play,
	Plus,
	RefreshCw,
	Search,
	ThumbsDown,
	Trash2,
	Trophy,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { addDays, daysBetween, formatDay, parseDate, skipWeekend, toDateStr } from '../../shared/dates.js';
import { dealUrl } from '../../shared/hubspot.js';
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
import type { Poc } from '../api/types';
import { Chip, DueChip, EmptyState, PocDot, ProgressBar } from '../components/bits';
import { Composer } from '../components/Composer';
import { Avatar, PocAdmins, pocDayLabel, PocFacts } from '../components/PocDetails';
import { DoneSection, TaskList } from '../components/TaskList';
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
import { useUI } from '../lib/store';
import { useListIds, ViewBody, ViewHeader } from './common';

const POC_COLORS = ['#142CD1', '#1D9E75', '#D85A30', '#7F77DD', '#D4537E', '#BA7517', '#0E9AA7', '#639922'];

function StatusChip({ poc, today }: { poc: Pick<Poc, 'status' | 'paused_until'>; today: string }) {
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

export function PocCard({ poc, today }: { poc: Poc; today: string }) {
	const go = useUI((s) => s.go);
	const idle = poc.last_activity_at ? daysBetween(poc.last_activity_at.slice(0, 10), today) : null;
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
					<div className="truncate text-[12px] text-fg-3">{poc.company ?? 'Sin empresa'}</div>
				</div>
				{poc.owner && (
					<span title={`Owner: ${poc.owner}`}>
						<Avatar name={poc.owner} color={poc.color} size={24} />
					</span>
				)}
			</div>
			<div className="mt-2.5 flex flex-wrap gap-1.5">
				<StatusChip poc={poc} today={today} />
				{poc.hubspot_stage && <Chip tone="teal">HubSpot · {poc.hubspot_stage}</Chip>}
				{poc.waiting > 0 && <Chip tone="warn">{poc.waiting} esperando</Chip>}
			</div>
			{(poc.start_date || poc.admin_count > 0) && (
				<div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-fg-2">
					{poc.start_date && (
						<span>
							Inicio {formatDay(poc.start_date, today)}
							{poc.status === 'active' && <span className="text-fg-3"> · {pocDayLabel(poc.start_date, today)}</span>}
						</span>
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
				{poc.next ? (
					<div className="flex items-center gap-2">
						<span className="text-fg-3">Siguiente</span>
						<span className="min-w-0 flex-1 truncate text-fg">{poc.next.title}</span>
						{poc.next.due_date && <DueChip date={poc.next.due_date} today={today} />}
					</div>
				) : (
					<span className="text-fg-3">{poc.total ? 'Todas las tareas hechas' : 'Añade la primera tarea'}</span>
				)}
				{idle != null && idle > 0 && <div className="mt-0.5 text-[11px] text-fg-3">Último movimiento hace {plural(idle, 'día', 'días')}</div>}
			</div>
		</motion.button>
	);
}

export function PocsView() {
	const today = useToday();
	const { data: pocs = [], isLoading } = usePocs();
	const setNewPocOpen = useUI((s) => s.setNewPocOpen);
	const [showClosed, setShowClosed] = useState(false);
	const active = pocs.filter((p) => p.status === 'active');
	const paused = pocs.filter((p) => p.status === 'paused');
	const closed = pocs.filter((p) => p.status === 'won' || p.status === 'lost');
	useListIds([]);

	const grid = (list: Poc[]) => (
		<div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
			{list.map((p) => (
				<PocCard key={p.id} poc={p} today={today} />
			))}
		</div>
	);

	return (
		<>
			<ViewHeader
				icon={<FlaskConical />}
				iconClass="bg-[#7F77DD]/15 text-[#7F77DD]"
				title="PoCs en curso"
				subtitle={`${plural(active.length, 'activa', 'activas')} · ${paused.length} en pausa`}
				right={
					<Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setNewPocOpen(true)}>
						Nueva PoC
					</Button>
				}
			/>
			<ViewBody className="max-w-[980px]">
				{!isLoading && !pocs.length && (
					<EmptyState icon={<FlaskConical />} title="Ninguna PoC todavía">
						Crea una PoC para llevar su checklist: lo que te toca hacer, lo que esperas del cliente y su deal de HubSpot.
					</EmptyState>
				)}
				{active.length > 0 && grid(active)}
				{paused.length > 0 && (
					<>
						<div className="mt-7 mb-2.5 text-[12px] font-semibold text-fg-2">En pausa</div>
						{grid(paused)}
					</>
				)}
				{closed.length > 0 && (
					<>
						<button
							type="button"
							onClick={() => setShowClosed(!showClosed)}
							className="mt-7 mb-2.5 flex items-center gap-1 text-[12px] font-semibold text-fg-3 hover:text-fg-2"
						>
							<ChevronRight className={cx('size-3.5 transition-transform', showClosed && 'rotate-90')} />
							Cerradas · {closed.length}
						</button>
						{showClosed && grid(closed)}
					</>
				)}
			</ViewBody>
		</>
	);
}

export function NewPocDialog() {
	const { newPocOpen, setNewPocOpen, go } = useUI();
	const a = useActions();
	const { data: settings } = useSettings();
	const empty = { name: '', company: '', country: '', owner: '', start_date: '', hubspot: '', use_template: true };
	const [form, setForm] = useState(empty);
	const templateCount = (settings?.poc_template ?? '').split('\n').filter((l) => l.trim()).length;
	const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

	const submit = async () => {
		if (!form.name.trim()) return;
		const poc = await a.createPoc({ ...form, use_template: form.use_template && templateCount > 0 });
		setNewPocOpen(false);
		setForm(empty);
		go({ kind: 'poc', id: poc.id });
	};

	return (
		<Dialog open={newPocOpen} onOpenChange={setNewPocOpen} title="Nueva PoC" description="Solo lo necesario para seguir sus tareas.">
			<form
				className="space-y-3"
				onSubmit={(e) => {
					e.preventDefault();
					submit();
				}}
			>
				<label className="block">
					<span className="mb-1 block text-[12px] font-medium text-fg-2">Nombre</span>
					<input autoFocus value={form.name} onChange={set('name')} placeholder="Cafam" className={inputClass} />
				</label>
				<div className="grid grid-cols-[1fr_90px] gap-2">
					<label className="block">
						<span className="mb-1 block text-[12px] font-medium text-fg-2">Empresa</span>
						<input value={form.company} onChange={set('company')} placeholder="Caja de Compensación Familiar" className={inputClass} />
					</label>
					<label className="block">
						<span className="mb-1 block text-[12px] font-medium text-fg-2">País</span>
						<input value={form.country} onChange={set('country')} placeholder="CO" maxLength={2} className={cx(inputClass, 'uppercase')} />
					</label>
				</div>
				<div className="grid grid-cols-[1fr_150px] gap-2">
					<label className="block">
						<span className="mb-1 block text-[12px] font-medium text-fg-2">Owner</span>
						<input value={form.owner} onChange={set('owner')} list="zd-owners" placeholder="¿Quién la lleva?" className={inputClass} />
					</label>
					<label className="block">
						<span className="mb-1 block text-[12px] font-medium text-fg-2">Fecha de inicio</span>
						<input type="date" value={form.start_date} onChange={set('start_date')} className={inputClass} />
					</label>
				</div>
				<label className="block">
					<span className="mb-1 block text-[12px] font-medium text-fg-2">Deal de HubSpot (opcional)</span>
					<input value={form.hubspot} onChange={set('hubspot')} placeholder="Pega el enlace del deal o su ID" className={inputClass} />
				</label>
				{templateCount > 0 && (
					<label className="flex items-center gap-2 text-[12.5px] text-fg-2">
						<input
							type="checkbox"
							checked={form.use_template}
							onChange={(e) => setForm({ ...form, use_template: e.target.checked })}
							className="size-4 accent-[var(--accent)]"
						/>
						Empezar con la checklist de plantilla ({plural(templateCount, 'tarea', 'tareas')})
					</label>
				)}
				<div className="flex justify-end gap-2 pt-2">
					<Button type="button" onClick={() => setNewPocOpen(false)}>
						Cancelar
					</Button>
					<Button type="submit" variant="primary" disabled={!form.name.trim()}>
						Crear PoC
					</Button>
				</div>
			</form>
		</Dialog>
	);
}

/** Primer día laborable del próximo trimestre. */
function nextQuarter(today: string) {
	const d = parseDate(today);
	const q = Math.floor(d.getMonth() / 3);
	const start = new Date(d.getFullYear() + (q === 3 ? 1 : 0), ((q + 1) % 4) * 3, 1);
	return { date: skipWeekend(toDateStr(start)), label: `Q${((q + 1) % 4) + 1}` };
}

function PauseForm({ poc, onDone }: { poc: Poc; onDone: () => void }) {
	const today = useToday();
	const a = useActions();
	const q = nextQuarter(today);
	const options = [
		{ label: 'En 2 semanas', value: addDays(today, 14) },
		{ label: 'En 1 mes', value: addDays(today, 30) },
		{ label: `Inicio de ${q.label}`, value: q.date },
	];
	const [until, setUntil] = useState<string | null>(q.date);
	const [body, setBody] = useState('');
	return (
		<div className="w-72">
			<div className="mb-2 text-[13px] font-semibold">Pausar PoC</div>
			<div className="mb-2 text-[11.5px] text-fg-2">Sus tareas desaparecen de Hoy y vuelven solas cuando acabe la pausa.</div>
			<div className="flex flex-wrap gap-1">
				{options.map((o) => (
					<button
						key={o.label}
						type="button"
						onClick={() => setUntil(o.value)}
						className={cx('rounded-lg px-2 py-1 text-left text-[11.5px]', until === o.value ? 'bg-accent-soft text-accent-text' : 'text-fg-2 hover:bg-hover')}
					>
						<div className="font-medium">{o.label}</div>
						<div className="text-[10.5px] opacity-75">{formatDay(o.value, today)}</div>
					</button>
				))}
				<button
					type="button"
					onClick={() => setUntil(null)}
					className={cx('rounded-lg px-2 py-1 text-[11.5px] font-medium', until === null ? 'bg-accent-soft text-accent-text' : 'text-fg-2 hover:bg-hover')}
				>
					Sin fecha
				</button>
			</div>
			<input type="date" value={until ?? ''} onChange={(e) => setUntil(e.target.value || null)} className={cx(inputClass, 'mt-2')} />
			<input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Motivo (p. ej. no hacen PoC hasta Q1)" className={cx(inputClass, 'mt-2')} />
			<div className="mt-3 flex justify-end">
				<Button
					variant="primary"
					onClick={async () => {
						await a.setPocStatus(poc.id, { status: 'paused', paused_until: until, body });
						onDone();
					}}
				>
					Pausar
				</Button>
			</div>
		</div>
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
											{[d.stage, money(d.amount), d.closeDate && `cierre ${formatDay(d.closeDate, today)}`].filter(Boolean).join(' · ')}
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
						money(poc.hubspot_amount),
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

export function PocView({ id }: { id: number }) {
	const today = useToday();
	const { data, isError } = usePoc(id);
	const { data: list } = useItems('poc', { poc: id });
	const a = useActions();
	const go = useUI((s) => s.go);
	const [pauseOpen, setPauseOpen] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [noteText, setNoteText] = useState('');
	const poc = data?.poc;
	const name = useDraft(poc?.name, (v) => v && poc && a.updatePoc(poc.id, { name: v }));
	const company = useDraft(poc?.company, (v) => poc && a.updatePoc(poc.id, { company: v }));
	const country = useDraft(poc?.country, (v) => poc && a.updatePoc(poc.id, { country: v }));
	const notes = useDraft(poc?.notes, (v) => poc && a.updatePoc(poc.id, { notes: v }));
	const items = list?.items ?? [];
	useListIds(items.map((i) => i.id));

	if (isError)
		return (
			<ViewBody>
				<EmptyState icon={<FlaskConical />} title="Esta PoC ya no existe" />
			</ViewBody>
		);
	if (!poc) return null;

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
						<Popover open={pauseOpen} onOpenChange={setPauseOpen} align="end" trigger={<span />}>
							<PauseForm poc={poc} onDone={() => setPauseOpen(false)} />
						</Popover>
						<Menu
							trigger={
								<Button size="sm" icon={<Ellipsis className="size-3.5" />}>
									Estado
								</Button>
							}
						>
							{poc.status !== 'active' && (
								<MenuItem icon={<Play />} onSelect={() => a.setPocStatus(poc.id, { status: 'active' })}>
									Reactivar
								</MenuItem>
							)}
							<MenuItem icon={<Pause />} onSelect={() => setTimeout(() => setPauseOpen(true), 0)}>
								Pausar hasta…
							</MenuItem>
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
					<span>{flagEmoji(poc.country)}</span>
					<input
						{...country}
						placeholder="País"
						maxLength={2}
						className="no-drag h-6 w-12 rounded-md bg-transparent px-1 text-[12.5px] text-fg-2 uppercase outline-none hover:bg-hover focus:bg-hover"
					/>
				</div>
			</header>

			<ViewBody>
				{poc.status === 'paused' && (
					<div className="mb-4 flex items-center gap-3 rounded-xl bg-warn-soft px-3.5 py-2.5 text-[12.5px]">
						<Pause className="size-4 text-warn" />
						<span className="flex-1">
							{poc.paused_until ? `En pausa hasta el ${formatDay(poc.paused_until, today)}.` : 'En pausa.'} Sus tareas no aparecen en Hoy hasta entonces.
						</span>
						<Button size="xs" onClick={() => a.setPocStatus(poc.id, { status: 'active' })}>
							Reactivar ya
						</Button>
					</div>
				)}

				<PocFacts poc={poc} adminCount={data.admins.length} today={today} />
				<HubspotCard poc={poc} today={today} />

				<div className="mt-5 mb-2 flex items-center gap-3">
					<div className="flex-1">
						<ProgressBar done={poc.done} total={poc.total} color={poc.color} />
					</div>
					<span className="text-[12px] text-fg-2">{poc.total ? `${poc.done} de ${poc.total}` : 'Sin tareas'}</span>
				</div>

				<Composer defaults={{ category: 'poc', poc_id: poc.id }} placeholder="Añadir tarea a la PoC… (prueba «Kickoff con Brigitte el jueves»)" />
				<TaskList items={items} today={today} options={{ sortable: true, listKey: `poc-${poc.id}`, queryKey: ['items', 'poc', { poc: poc.id }] }} />
				<DoneSection items={list?.done ?? []} today={today} title="Hechas" defaultOpen />

				<PocAdmins poc={poc} admins={data.admins} />

				<div className="mt-8">
					<SectionTitle>Notas de la PoC</SectionTitle>
					<AutoTextarea {...notes} placeholder="Contexto, contactos, acuerdos…" className="min-h-[60px] rounded-xl bg-hover px-3.5 py-2.5 text-[13px] leading-5" />
				</div>

				<div className="mt-8">
					<SectionTitle>Historial</SectionTitle>
					<input
						value={noteText}
						onChange={(e) => setNoteText(e.target.value)}
						onKeyDown={(e) => e.key === 'Enter' && addNote()}
						placeholder="Añadir una nota al historial de la PoC…"
						className={cx(inputClass, 'mb-3')}
					/>
					<Timeline entries={data.activity} today={today} showItem onDelete={(e) => a.deleteActivity(e.id)} />
				</div>
			</ViewBody>

			<Confirm
				open={confirmDelete}
				onOpenChange={setConfirmDelete}
				title={`¿Borrar ${poc.name}?`}
				description="Se borran la PoC, todas sus tareas y su historial. No se puede deshacer. Si solo ha terminado, márcala como ganada o perdida."
				confirm="Borrar PoC"
				onConfirm={async () => {
					await a.deletePoc(poc.id);
					go({ kind: 'pocs' });
				}}
			/>
		</>
	);
}
