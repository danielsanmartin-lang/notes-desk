import { Archive, CircleCheck, Copy, FlaskConical, Reply, Send } from 'lucide-react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { formatDay, isoWeek, weekLabel } from '../../shared/dates.js';
import { useToday, useWeek, useWeeks } from '../api/hooks';
import type { Item, WeekDetail, WeekLogEntry } from '../api/types';
import { ChannelIcon, EmptyState, PocDot } from '../components/bits';
import { Button, SectionTitle } from '../components/ui';
import { CHANNEL_LABEL, cx, plural } from '../lib/format';
import { useUI } from '../lib/store';
import { useListIds, ViewBody, ViewHeader } from './common';

const POC_EVENT: Record<string, string> = { paused: 'En pausa', resumed: 'Reanudada', won: 'Ganada', lost: 'Perdida' };

/** Resumen en markdown para pegar en el informe semanal o en un mensaje. */
export function weekMarkdown(w: WeekDetail) {
	const line = (i: Item) => `- ${i.title}${i.company ? ` (${i.company})` : ''}`;
	const out = [`## ${weekLabel(w.week)}`, ''];
	const fups = w.done.filter((i) => i.category === 'followup' && !i.parent_id);
	const tasks = w.done.filter((i) => i.category === 'task' && !i.parent_id);
	const poc = w.done.filter((i) => i.category === 'poc');
	if (fups.length) out.push('**Follow-ups cerrados**', ...fups.map(line), '');
	if (tasks.length) out.push('**Tareas completadas**', ...tasks.map(line), '');
	if (poc.length || w.poc_events.length) {
		out.push('**PoCs**');
		const names = [...new Set([...poc.map((i) => i.poc_name), ...w.poc_events.map((e) => e.poc_name)])];
		for (const n of names) {
			const ev = w.poc_events.filter((e) => e.poc_name === n).map((e) => POC_EVENT[e.kind] + (e.body ? `: ${e.body}` : ''));
			out.push(`- ${n}: ${[...poc.filter((i) => i.poc_name === n).map((i) => i.title), ...ev].join('; ')}`);
		}
		out.push('');
	}
	if (w.touches.length) {
		out.push(`**Toques (${w.touches.length})**`);
		for (const t of w.touches)
			out.push(`- ${formatDay(t.occurred_at.slice(0, 10))}: ${t.title}${t.channel ? ` · ${CHANNEL_LABEL[t.channel]}` : ''}${t.body ? ` · ${t.body}` : ''}`);
		out.push('');
	}
	if (w.replies.length) out.push('**Respuestas recibidas**', ...w.replies.map((r) => `- ${r.title}${r.body ? `: ${r.body}` : ''}`), '');
	return out.join('\n').trim() + '\n';
}

function Stat({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
	return (
		<div className="rounded-xl bg-hover px-4 py-3">
			<div className="flex items-center gap-1.5 text-[11.5px] text-fg-3 [&>svg]:size-3.5">
				{icon}
				{label}
			</div>
			<div className="mt-1 font-display text-[24px] leading-7 font-bold tabular-nums">{value}</div>
		</div>
	);
}

function DoneLine({ item }: { item: Item }) {
	const select = useUI((s) => s.select);
	return (
		<button type="button" onClick={() => select(item.id)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-hover">
			<CircleCheck className="size-4 shrink-0 text-ok" />
			<span className="min-w-0 flex-1 truncate text-[13px]">
				{item.parent_title && <span className="text-fg-3">{item.parent_title} › </span>}
				{item.title}
			</span>
			{item.company && <span className="shrink-0 text-[11.5px] text-fg-3">{item.company}</span>}
			{item.completed_at && <span className="w-16 shrink-0 text-right text-[11px] text-fg-3">{formatDay(item.completed_at.slice(0, 10))}</span>}
		</button>
	);
}

function LogLine({ entry, icon }: { entry: WeekLogEntry; icon: ReactNode }) {
	const select = useUI((s) => s.select);
	return (
		<button
			type="button"
			onClick={() => entry.item_id && select(entry.item_id)}
			className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-hover"
		>
			<span className="mt-0.5 shrink-0 text-fg-3 [&>svg]:size-4">{icon}</span>
			<span className="min-w-0 flex-1">
				<span className="block truncate text-[13px]">{entry.title}</span>
				{entry.body && <span className="block truncate text-[11.5px] text-fg-2">{entry.body}</span>}
			</span>
			<span className="w-16 shrink-0 text-right text-[11px] text-fg-3">{formatDay(entry.occurred_at.slice(0, 10))}</span>
		</button>
	);
}

export function WeeksView({ week }: { week?: string }) {
	const today = useToday();
	const go = useUI((s) => s.go);
	const { data: weeks = [] } = useWeeks();
	const current = week ?? isoWeek(today);
	const { data: w } = useWeek(current);
	useListIds([]);

	const copy = async () => {
		if (!w) return;
		await navigator.clipboard.writeText(weekMarkdown(w));
		toast.success('Resumen copiado', { description: 'Pégalo en el informe semanal o donde quieras.' });
	};

	const byCat = (cat: Item['category']) => (w?.done ?? []).filter((i) => i.category === cat);
	const pocNames = [...new Set([...byCat('poc').map((i) => i.poc_name), ...(w?.poc_events ?? []).map((e) => e.poc_name)])].filter(Boolean) as string[];
	const empty = w && !w.done.length && !w.touches.length && !w.replies.length && !w.poc_events.length;

	return (
		<>
			<ViewHeader
				icon={<Archive />}
				iconClass="bg-hover text-fg-2"
				title="Semanas"
				subtitle="Lo que hiciste cada semana: tareas completadas, toques y respuestas."
				right={
					w && !empty ? (
						<Button icon={<Copy className="size-3.5" />} onClick={copy}>
							Copiar resumen
						</Button>
					) : null
				}
			/>
			<div className="flex min-h-0 flex-1">
				<div className="scroll w-56 shrink-0 border-r border-line px-3 pb-10">
					{weeks.map((s) => (
						<button
							key={s.week}
							type="button"
							onClick={() => go({ kind: 'weeks', week: s.week })}
							className={cx(
								'mb-0.5 flex w-full flex-col rounded-lg px-2.5 py-2 text-left transition-colors',
								s.week === current ? 'bg-active' : 'hover:bg-hover',
							)}
						>
							<span className="text-[12.5px] font-medium">{weekLabel(s.week)}</span>
							<span className="text-[11px] text-fg-3">
								{s.week === isoWeek(today) && <span className="text-accent-text">Esta semana · </span>}
								{plural(s.done, 'hecha', 'hechas')} · {plural(s.touches, 'toque', 'toques')}
							</span>
						</button>
					))}
				</div>
				<ViewBody className="max-w-[720px] pt-1">
					{w && (
						<>
							<div className="mb-6 grid grid-cols-3 gap-3">
								<Stat label="Completadas" value={w.done.length} icon={<CircleCheck />} />
								<Stat label="Toques" value={w.touches.length} icon={<Send />} />
								<Stat label="Respuestas" value={w.replies.length} icon={<Reply />} />
							</div>
							{empty && <EmptyState icon={<Archive />} title="Semana sin movimientos" />}
							{byCat('followup').length > 0 && (
								<section className="mb-6">
									<SectionTitle>Follow-ups cerrados</SectionTitle>
									{byCat('followup').map((i) => (
										<DoneLine key={i.id} item={i} />
									))}
								</section>
							)}
							{byCat('task').length > 0 && (
								<section className="mb-6">
									<SectionTitle>Tareas completadas</SectionTitle>
									{byCat('task').map((i) => (
										<DoneLine key={i.id} item={i} />
									))}
								</section>
							)}
							{pocNames.length > 0 && (
								<section className="mb-6">
									<SectionTitle>PoCs</SectionTitle>
									{pocNames.map((n) => {
										const items = byCat('poc').filter((i) => i.poc_name === n);
										const color = items[0]?.poc_color ?? null;
										return (
											<div key={n} className="mb-3">
												<div className="mb-1 flex items-center gap-2 px-2 text-[12.5px] font-semibold">
													<PocDot color={color} /> {n}
												</div>
												{items.map((i) => (
													<DoneLine key={i.id} item={i} />
												))}
												{w.poc_events
													.filter((e) => e.poc_name === n)
													.map((e) => (
														<LogLine key={e.id} entry={{ ...e, title: POC_EVENT[e.kind] }} icon={<FlaskConical />} />
													))}
											</div>
										);
									})}
								</section>
							)}
							{w.touches.length > 0 && (
								<section className="mb-6">
									<SectionTitle>Toques registrados</SectionTitle>
									{w.touches.map((t) => (
										<LogLine key={t.id} entry={t} icon={t.channel ? <ChannelIcon channel={t.channel} className="size-4" /> : <Send />} />
									))}
								</section>
							)}
							{w.replies.length > 0 && (
								<section className="mb-6">
									<SectionTitle>Respuestas recibidas</SectionTitle>
									{w.replies.map((r) => (
										<LogLine key={r.id} entry={r} icon={<Reply />} />
									))}
								</section>
							)}
						</>
					)}
				</ViewBody>
			</div>
		</>
	);
}
