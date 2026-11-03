import {
	ArrowRight,
	ChevronDown,
	ChevronRight,
	ListChecks,
	Bell,
	Building2,
	CalendarDays,
	Copy,
	Ellipsis,
	Hand,
	Handshake,
	Hourglass,
	Mail,
	MessageCircle,
	Plus,
	Reply,
	Send,
	Shapes,
	Star,
	Trash2,
	User,
	X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { daysBetween, formatDay } from '../../shared/dates.js';
import { useActions, useItem, usePocs, useSuggestions, useToday } from '../api/hooks';
import type { Item } from '../api/types';
import { openExternal } from '../lib/bridge';
import { CATEGORY_LABEL, cx, daysWaiting, formatMoment, plural } from '../lib/format';
import { useItemOps } from '../lib/ops';
import { partnerOf } from '../lib/pocs';
import { useUI } from '../lib/store';
import { Checkbox, DueChip, PocDot, WaitingChip } from './bits';
import { DatePicker, ReminderPicker } from './DatePicker';
import { ChannelPicker, ReplyForm, TouchForm } from './FollowupForms';
import { Timeline } from './Timeline';
import { AutoTextarea, Button, IconButton, inputClass, Menu, MenuItem, Popover, SectionTitle, useDraft } from './ui';

export function DetailPanel({ id }: { id: number }) {
	const select = useUI((s) => s.select);
	const { data, isError } = useItem(id);
	const today = useToday();

	// El ancho del panel se anima de 0 a 400 px: la columna central se estrecha y se ensancha a la vez,
	// sin quedarse un hueco que luego se rellena de golpe. El contenido, fijo a 400 px, se desliza encima.
	return (
		<motion.aside
			initial={{ width: 0 }}
			animate={{ width: PANEL_WIDTH }}
			exit={{ width: 0 }}
			transition={PANEL_EASE}
			className="h-full shrink-0 overflow-hidden"
		>
			<motion.div
				initial={{ x: 24, opacity: 0 }}
				animate={{ x: 0, opacity: 1 }}
				exit={{ x: 24, opacity: 0 }}
				transition={PANEL_EASE}
				style={{ width: PANEL_WIDTH }}
				className="flex h-full flex-col border-l border-line bg-panel"
			>
				{isError ? (
					<div className="p-6 text-[13px] text-fg-2">
						Esta tarea ya no existe.{' '}
						<button className="text-accent-text" onClick={() => select(null)}>
							Cerrar
						</button>
					</div>
				) : !data ? null : (
					<DetailBody key={data.item.id} item={data.item} subtasks={data.subtasks} activity={data.activity} today={today} />
				)}
			</motion.div>
		</motion.aside>
	);
}

const PANEL_WIDTH = 400;
const PANEL_EASE = { type: 'tween', duration: 0.26, ease: [0.32, 0.72, 0, 1] } as const;

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
	return (
		<div className="flex min-h-8 items-center gap-2">
			<div className="flex w-28 shrink-0 items-center gap-2 text-[12.5px] text-fg-3 [&>svg]:size-3.5">
				{icon}
				{label}
			</div>
			<div className="min-w-0 flex-1">{children}</div>
		</div>
	);
}

function DetailBody({
	item,
	subtasks,
	activity,
	today,
}: {
	item: Item;
	subtasks: Item[];
	activity: Parameters<typeof Timeline>[0]['entries'];
	today: string;
}) {
	const a = useActions();
	const ops = useItemOps();
	const { select, touchOpen, setTouchOpen, replyOpen, setReplyOpen, go } = useUI();
	const { data: pocs = [] } = usePocs();
	const { data: sugg } = useSuggestions();
	const save = (patch: Partial<Item>) => a.update(item.id, patch);
	const title = useDraft(item.title, (v) => v && save({ title: v }));
	const notes = useDraft(item.notes, (v) => save({ notes: v }));
	const message = useDraft(item.message_template, (v) => save({ message_template: v }));
	const company = useDraft(item.company, (v) => save({ company: v }));
	const contact = useDraft(item.contact, (v) => {
		const known = sugg?.contacts.find((c) => c.value.toLowerCase() === v.toLowerCase());
		save({ contact: v, ...(known?.company && !item.company ? { company: known.company } : {}) });
	});
	const [noteText, setNoteText] = useState('');
	const [subText, setSubText] = useState('');

	const done = item.state === 'done';
	// Las subtareas siempre admiten toques: cada una lleva su propio contador.
	const followable = item.category === 'followup' || item.category === 'poc' || !!item.parent_id;
	const hasOpenSubs = subtasks.some((x) => x.state !== 'done');
	const activePocs = pocs.filter((p) => p.status === 'active' || p.status === 'paused');
	const pocCompany = pocs.find((p) => p.id === item.poc_id)?.company ?? null;
	const partner = partnerOf(pocs, item);

	const addNote = async () => {
		if (!noteText.trim()) return;
		await a.note(item.id, noteText.trim());
		setNoteText('');
	};

	const addSub = async () => {
		if (!subText.trim()) return;
		await a.create({ parent_id: item.id, title: subText.trim() });
		setSubText('');
	};

	const copyMessage = async () => {
		await navigator.clipboard.writeText(item.message_template ?? '');
		toast.success('Mensaje copiado');
	};

	return (
		<>
			<div className="drag flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
				<button
					type="button"
					onClick={() => go(item.poc_id ? { kind: 'poc', id: item.poc_id } : item.category === 'followup' ? { kind: 'followups' } : { kind: 'tasks' })}
					className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md bg-hover px-2 text-[11.5px] font-medium whitespace-nowrap text-fg-2 hover:text-fg"
				>
					{item.poc_name ? (
						<>
							<PocDot color={item.poc_color} className="size-1.5" /> {item.poc_name}
						</>
					) : (
						CATEGORY_LABEL[item.category]
					)}
				</button>
				{item.parent_id && item.parent_title && (
					<button
						type="button"
						onClick={() => select(item.parent_id)}
						className="min-w-0 truncate rounded-md px-1 text-[11.5px] text-fg-3 hover:bg-hover hover:text-fg-2"
						title="Ir a la tarea principal"
					>
						↳ {item.parent_title}
					</button>
				)}
				<div className="ml-auto flex items-center gap-0.5">
					<IconButton
						label="Borrar (va a la papelera)"
						onClick={() => {
							ops.remove(item);
							select(null);
						}}
						className="hover:bg-danger-soft hover:text-danger"
					>
						<Trash2 className="size-4" />
					</IconButton>
					<Menu
						trigger={
							<IconButton label="Más acciones">
								<Ellipsis className="size-4" />
							</IconButton>
						}
					>
						<MenuItem
							icon={<Copy />}
							onSelect={() => {
								navigator.clipboard.writeText(item.title);
								toast.success('Título copiado');
							}}
						>
							Copiar título
						</MenuItem>
						<MenuItem
							icon={<Trash2 />}
							danger
							onSelect={() => {
								ops.remove(item);
								select(null);
							}}
						>
							Mover a la papelera
						</MenuItem>
					</Menu>
					<IconButton label="Cerrar (Esc)" onClick={() => select(null)}>
						<X className="size-4" />
					</IconButton>
				</div>
			</div>

			<div className="scroll flex-1 px-5 pt-4 pb-8">
				<div className="flex items-start gap-3">
					<div className="pt-1">
						<Checkbox checked={done} waiting={item.state === 'waiting'} size={20} onToggle={() => ops.toggle(item)} />
					</div>
					<AutoTextarea
						{...title}
						onKeyDown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								(e.target as HTMLTextAreaElement).blur();
							}
						}}
						className={cx('font-display text-[18px] leading-6 font-semibold', done && 'text-fg-3 line-through')}
					/>
				</div>

				{!done && hasOpenSubs && (
					<div className="mt-4 flex items-start gap-2 rounded-xl bg-hover p-3 text-[12.5px] text-fg-2">
						<ListChecks className="mt-0.5 size-3.5 shrink-0 text-fg-3" />
						<span>El seguimiento va por subtarea: cada una tiene su fecha, sus toques y sus días esperando. Usa «Toque» en la subtarea o ábrela.</span>
					</div>
				)}
				{followable && !done && !hasOpenSubs && (
					<div
						className={cx(
							'mt-4 rounded-xl p-3',
							item.state === 'waiting' ? 'bg-warn-soft/60' : 'bg-accent-soft/70',
						)}
					>
						<div className="flex items-center gap-2 text-[12.5px] font-medium">
							{item.state === 'waiting' ? (
								<>
									<Hourglass className="size-3.5 text-warn" />
									<span>Esperando respuesta</span>
									<WaitingChip item={item} today={today} long />
								</>
							) : (
								<>
									<Hand className="size-3.5 text-accent-text" />
									<span className="text-accent-text">Te toca a ti</span>
								</>
							)}
						</div>
						{(item.touch_count > 0 || item.last_touch_at) && (
							<div className="mt-1 text-[11.5px] text-fg-2">
								{plural(item.touch_count, 'toque', 'toques')}
								{item.last_touch_at &&
									` · último ${
										daysBetween(item.last_touch_at.slice(0, 10), today) === 0
											? 'hoy'
											: `hace ${plural(daysBetween(item.last_touch_at.slice(0, 10), today), 'día', 'días')}`
									}`}
								{item.state === 'waiting' && item.due_date && ` · volver a perseguir ${formatDay(item.due_date, today)}`}
							</div>
						)}
						<div className="mt-2.5 flex gap-2">
							<Popover
								open={touchOpen}
								onOpenChange={setTouchOpen}
								trigger={
									<Button variant="primary" size="sm" icon={<Send className="size-3.5" />}>
										Registrar toque
									</Button>
								}
							>
								<TouchForm item={item} onDone={() => setTouchOpen(false)} />
							</Popover>
							{item.state === 'waiting' ? (
								<Popover
									open={replyOpen}
									onOpenChange={setReplyOpen}
									trigger={
										<Button size="sm" icon={<Reply className="size-3.5" />}>
											Han respondido
										</Button>
									}
								>
									<ReplyForm item={item} onDone={() => setReplyOpen(false)} />
								</Popover>
							) : (
								<Button size="sm" variant="ghost" icon={<Hourglass className="size-3.5" />} onClick={() => save({ state: 'waiting' })}>
									En espera
								</Button>
							)}
						</div>
					</div>
				)}

				<div className="mt-4 space-y-0.5">
					<Row icon={<Shapes />} label="Tipo">
						{item.parent_id ? (
							<span className="px-2 text-[12.5px] text-fg-3">Subtarea: el tipo lo marca su tarea madre</span>
						) : (
							<TypePicker
								item={item}
								pocs={activePocs}
								onChange={async (category, pocId) => {
									await save({ category, poc_id: pocId ?? null });
									toast.success(
										category === 'poc' ? `Movida a ${activePocs.find((p) => p.id === pocId)?.name}` : category === 'followup' ? 'Ahora es un follow-up' : 'Ahora es una tarea',
									);
								}}
							/>
						)}
					</Row>
					{partner && (
						<Row icon={<Handshake />} label="Con quién">
							<div className="inline-flex gap-0.5 rounded-lg bg-hover p-0.5">
								{([null, 'partner'] as const).map((v) => (
									<button
										key={v ?? 'client'}
										type="button"
										onClick={() => item.audience !== v && save({ audience: v })}
										className={cx(
											'inline-flex h-6.5 items-center rounded-md px-2.5 text-[12.5px] font-medium transition-colors',
											item.audience === v ? 'bg-raised text-fg shadow-sm' : 'text-fg-3 hover:text-fg-2',
										)}
									>
										{v ? partner : 'Cliente'}
									</button>
								))}
							</div>
						</Row>
					)}
					<Row icon={<CalendarDays />} label={item.state === 'waiting' ? 'Próximo FUP' : 'Fecha'}>
						<DatePicker value={item.due_date} onChange={(v) => save({ due_date: v })} />
					</Row>
					<Row icon={<Bell />} label="Recordatorio">
						<ReminderPicker value={item.remind_at} dueDate={item.due_date} onChange={(v) => save({ remind_at: v })} />
					</Row>
					<Row icon={<Building2 />} label="Empresa">
						<div className="group/company flex items-center">
							<input {...company} list="zd-companies" placeholder="Añadir empresa" className={fieldClass} />
							{(item.company ?? item.poc_name) && (
								<button
									type="button"
									onClick={() => go({ kind: 'account', name: item.company ?? pocCompany ?? item.poc_name! })}
									className="ml-1 hidden h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-medium text-accent-text group-hover/company:inline-flex hover:bg-accent-soft"
								>
									Ver cuenta <ArrowRight className="size-3" />
								</button>
							)}
						</div>
					</Row>
					<Row icon={<User />} label="Contacto">
						<input {...contact} list="zd-contacts" placeholder="Añadir contacto" className={fieldClass} />
					</Row>
					<Row icon={<MessageCircle />} label="Canal">
						<ChannelPicker value={item.channel} onChange={(c) => save({ channel: c })} />
					</Row>
					{!item.parent_id && (
						<Row icon={<Star />} label="Destacada">
							<button
								type="button"
								onClick={() => save({ flagged: !item.flagged })}
								className={cx('inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[12.5px] hover:bg-hover', item.flagged ? 'text-warn' : 'text-fg-3')}
							>
								<Star className="size-3.5" fill={item.flagged ? 'currentColor' : 'none'} />
								{item.flagged ? 'Sí, aparece en Inicio' : 'No'}
							</button>
						</Row>
					)}
				</div>

				<div className="mt-4">
					<AutoTextarea {...notes} placeholder="Notas…" className="min-h-[44px] rounded-lg bg-hover px-3 py-2 text-[13px] leading-5" />
				</div>

				<div className="mt-5">
					<SectionTitle
						right={
							item.message_template ? (
								<div className="flex gap-1">
									<Button size="xs" variant="ghost" icon={<Copy className="size-3" />} onClick={copyMessage}>
										Copiar
									</Button>
									<Button
										size="xs"
										variant="ghost"
										icon={<MessageCircle className="size-3" />}
										onClick={() => openExternal(`whatsapp://send?text=${encodeURIComponent(item.message_template ?? '')}`)}
									>
										WhatsApp
									</Button>
									<Button
										size="xs"
										variant="ghost"
										icon={<Mail className="size-3" />}
										onClick={() => openExternal(`mailto:?body=${encodeURIComponent(item.message_template ?? '')}`)}
									>
										Email
									</Button>
								</div>
							) : null
						}
					>
						Mensaje
					</SectionTitle>
					<AutoTextarea
						{...message}
						placeholder="Escribe aquí el mensaje que vas a mandar para copiarlo con un clic"
						className="rounded-lg border border-dashed border-line-strong px-3 py-2 text-[13px] leading-5"
					/>
				</div>

				{!item.parent_id && (
					<div className="mt-5">
						<SectionTitle right={subtasks.length ? <span className="text-[11px] text-fg-3">{subtasks.filter((s) => s.state === 'done').length}/{subtasks.length}</span> : null}>
							Subtareas
						</SectionTitle>
						<div className="space-y-0.5">
							{subtasks.map((s) => (
								<SubtaskRow key={s.id} item={s} today={today} />
							))}
							<div className="flex h-8 items-center gap-2.5 px-1">
								<Plus className="size-4 text-fg-3" />
								<input
									value={subText}
									onChange={(e) => setSubText(e.target.value)}
									onKeyDown={(e) => e.key === 'Enter' && addSub()}
									placeholder="Añadir subtarea"
									className="h-full flex-1 bg-transparent text-[13px] outline-none placeholder:text-fg-3"
								/>
							</div>
						</div>
					</div>
				)}

				<div className="mt-5">
					<SectionTitle>Bitácora</SectionTitle>
					<input
						value={noteText}
						onChange={(e) => setNoteText(e.target.value)}
						onKeyDown={(e) => e.key === 'Enter' && addNote()}
						placeholder="Añadir una nota a la bitácora…"
						className={cx(inputClass, 'mb-3')}
					/>
					<Timeline
						entries={activity}
						today={today}
						parentId={item.id}
						onDelete={(entry) => a.deleteActivity(entry.id)}
					/>
				</div>

				<div className="mt-4 border-t border-line pt-3 text-[11px] text-fg-3">
					Creada {formatMoment(item.created_at, today)}
					{item.completed_at && ` · completada ${formatMoment(item.completed_at, today)}`}
					{item.state === 'waiting' && ` · ${daysWaiting(item, today)} días en espera`}
				</div>
			</div>
		</>
	);
}

function TypePicker({
	item,
	pocs,
	onChange,
}: {
	item: Item;
	pocs: { id: number; name: string; color: string | null }[];
	onChange: (category: Item['category'], pocId?: number) => void;
}) {
	const seg = (on: boolean) =>
		cx(
			'inline-flex h-6.5 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors',
			on ? 'bg-raised text-fg shadow-sm' : 'text-fg-3 hover:text-fg-2',
		);
	return (
		<div className="inline-flex gap-0.5 rounded-lg bg-hover p-0.5">
			<button type="button" onClick={() => item.category !== 'task' && onChange('task')} className={seg(item.category === 'task')}>
				Tarea
			</button>
			<button type="button" onClick={() => item.category !== 'followup' && onChange('followup')} className={seg(item.category === 'followup')}>
				Follow-up
			</button>
			<Menu
				align="start"
				trigger={
					<button type="button" className={seg(item.category === 'poc')}>
						{item.category === 'poc' ? (
							<>
								<PocDot color={item.poc_color} className="size-1.5" />
								<span className="max-w-28 truncate">{item.poc_name}</span>
							</>
						) : (
							'PoC'
						)}
						<ChevronDown className="size-3" />
					</button>
				}
			>
				{pocs.length ? (
					pocs.map((p) => (
						<MenuItem key={p.id} icon={<PocDot color={p.color} />} onSelect={() => p.id !== item.poc_id && onChange('poc', p.id)}>
							{p.name}
						</MenuItem>
					))
				) : (
					<MenuItem disabled onSelect={() => {}}>
						No hay PoCs activas
					</MenuItem>
				)}
			</Menu>
		</div>
	);
}

const fieldClass =
	'h-7 w-full rounded-lg bg-transparent px-2 text-[12.5px] text-fg outline-none placeholder:text-fg-3 hover:bg-hover focus:bg-hover';

function SubtaskRow({ item, today }: { item: Item; today: string }) {
	const a = useActions();
	const ops = useItemOps();
	const { select, setTouchOpen } = useUI();
	const title = useDraft(item.title, (v) => v && a.update(item.id, { title: v }));
	const done = item.state === 'done';
	return (
		<div className="group flex min-h-8 items-center gap-2 rounded-lg px-1 hover:bg-hover">
			<Checkbox checked={done} waiting={item.state === 'waiting'} size={16} onToggle={() => ops.toggle(item)} />
			<input
				{...title}
				onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
				className={cx('h-8 min-w-0 flex-1 bg-transparent text-[13px] outline-none', done && 'text-fg-3 line-through')}
			/>
			{!done && item.state === 'waiting' && <WaitingChip item={item} today={today} />}
			{!done && item.due_date && <DueChip date={item.due_date} today={today} />}
			{!done && (
				<button
					type="button"
					onClick={() => {
						select(item.id);
						setTouchOpen(true);
					}}
					className="hidden h-6 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-medium text-accent-text group-hover:inline-flex hover:bg-accent-soft"
					title="Registrar toque en esta subtarea"
				>
					<Send className="size-3" /> Toque
				</button>
			)}
			<button
				type="button"
				onClick={() => select(item.id)}
				aria-label="Abrir subtarea"
				title="Abrir subtarea (fecha, toques, bitácora)"
				className="hidden size-6 items-center justify-center rounded-md text-fg-3 group-hover:flex hover:bg-hover hover:text-fg"
			>
				<ChevronRight className="size-3.5" />
			</button>
			<button
				type="button"
				onClick={() => ops.remove(item)}
				aria-label="Borrar subtarea"
				className="hidden size-6 items-center justify-center rounded-md text-fg-3 group-hover:flex hover:text-danger"
			>
				<X className="size-3.5" />
			</button>
		</div>
	);
}
