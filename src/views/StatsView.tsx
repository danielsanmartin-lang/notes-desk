import { BarChart3, Table2 } from 'lucide-react';
import { useState } from 'react';
import { formatDayMonth, weekLabel } from '../../shared/dates.js';
import { useStats } from '../api/hooks';
import type { Channel } from '../api/types';
import { ChannelIcon, EmptyState } from '../components/bits';
import { ChartCard, HBars, Legend, StackedColumns, StatTile, type StackSeries } from '../components/charts';
import { Button } from '../components/ui';
import { CHANNEL_LABEL, cx, plural } from '../lib/format';
import { useUI } from '../lib/store';
import { useListIds, ViewBody, ViewHeader } from './common';

const PERIODS = [
	{ weeks: 4, label: '4 semanas' },
	{ weeks: 12, label: '12 semanas' },
	{ weeks: 26, label: '6 meses' },
	{ weeks: 52, label: '1 año' },
];

type Measure = 'touches' | 'done' | 'replies';
const SERIES: StackSeries<Measure>[] = [
	{ key: 'touches', label: 'Toques', color: 'var(--series-1)' },
	{ key: 'done', label: 'Completadas', color: 'var(--series-2)' },
	{ key: 'replies', label: 'Respuestas', color: 'var(--series-3)' },
];

const BUCKET_COLOR = {
	ok: 'var(--status-good)',
	warn: 'var(--status-warning)',
	late: 'var(--status-serious)',
	cold: 'var(--status-critical)',
};

const days = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('es-ES')} ${n === 1 ? 'día' : 'días'}`);

export function StatsView() {
	const [weeks, setWeeks] = useState(12);
	const [asTable, setAsTable] = useState(false);
	const { data: s } = useStats(weeks);
	const go = useUI((st) => st.go);
	useListIds([]);

	const empty = s && !s.totals.done && !s.totals.touches && !s.totals.replies && !s.now.waiting && !s.now.mine;

	return (
		<>
			<ViewHeader
				icon={<BarChart3 />}
				iconClass="bg-teal-soft text-teal"
				title="Estadísticas"
				subtitle={s ? `${weekLabel(s.weekly[0].week).split(' · ')[0]} – ${weekLabel(s.weekly.at(-1)!.week).split(' · ')[0]} · desde el ${formatDayMonth(s.from)}` : ' '}
				right={
					<div className="flex gap-0.5 rounded-lg bg-hover p-0.5">
						{PERIODS.map((p) => (
							<button
								key={p.weeks}
								type="button"
								onClick={() => setWeeks(p.weeks)}
								className={cx(
									'h-6.5 rounded-md px-2.5 text-[12px] font-medium transition-colors',
									weeks === p.weeks ? 'bg-raised text-fg shadow-sm' : 'text-fg-3 hover:text-fg-2',
								)}
							>
								{p.label}
							</button>
						))}
					</div>
				}
			/>
			<ViewBody className="max-w-[980px]">
				{!s ? null : empty ? (
					<EmptyState icon={<BarChart3 />} title="Todavía no hay datos">
						En cuanto registres toques, completes tareas o te respondan, aquí verás cómo va tu semana.
					</EmptyState>
				) : (
					<div className="space-y-4">
						<div className="grid grid-cols-5 gap-2.5">
							<StatTile label="Completadas" value={s.totals.done} delta={{ now: s.totals.done, prev: s.previous.done }} />
							<StatTile label="Toques" value={s.totals.touches} delta={{ now: s.totals.touches, prev: s.previous.touches }} />
							<StatTile label="Respuestas" value={s.totals.replies} delta={{ now: s.totals.replies, prev: s.previous.replies }} />
							<StatTile
								label="Tasa de respuesta"
								value={s.response.rate == null ? '—' : `${s.response.rate}%`}
								hint={s.response.touched ? `${s.response.answered} de ${plural(s.response.touched, 'follow-up', 'follow-ups')}` : 'sin toques en el periodo'}
							/>
							<StatTile label="Tardan en responder" value={days(s.response.avg_days)} hint="de media, desde el primer toque" />
						</div>

						<div className="flex items-center gap-4 rounded-xl border border-line px-4 py-2.5 text-[12.5px]">
							<span className="font-medium text-fg-2">Ahora mismo</span>
							<span>
								<b className="font-semibold">{s.now.mine}</b> <span className="text-fg-2">te tocan</span>
							</span>
							<span>
								<b className="font-semibold">{s.now.waiting}</b> <span className="text-fg-2">esperando respuesta</span>
							</span>
							<span className={s.now.overdue ? 'text-danger' : ''}>
								<b className="font-semibold">{s.now.overdue}</b> <span className={s.now.overdue ? '' : 'text-fg-2'}>atrasadas</span>
							</span>
						</div>

						<ChartCard
							title="Actividad por semana"
							subtitle="Toques enviados, tareas completadas y respuestas recibidas"
							right={
								<div className="flex items-center gap-3">
									<Legend items={SERIES.map((x) => ({ label: x.label, color: x.color }))} />
									<Button
										size="xs"
										variant="ghost"
										icon={asTable ? <BarChart3 className="size-3" /> : <Table2 className="size-3" />}
										onClick={() => setAsTable(!asTable)}
									>
										{asTable ? 'Ver gráfica' : 'Ver tabla'}
									</Button>
								</div>
							}
						>
							{asTable ? (
								<div className="scroll max-h-64">
									<table className="w-full text-[12px]">
										<thead className="text-left text-fg-3">
											<tr>
												<th className="py-1 font-medium">Semana</th>
												{SERIES.map((x) => (
													<th key={x.key} className="py-1 text-right font-medium">
														{x.label}
													</th>
												))}
											</tr>
										</thead>
										<tbody className="tabular-nums">
											{[...s.weekly].reverse().map((w) => (
												<tr key={w.week} className="border-t border-line">
													<td className="py-1">{weekLabel(w.week)}</td>
													<td className="py-1 text-right">{w.touches}</td>
													<td className="py-1 text-right">{w.done}</td>
													<td className="py-1 text-right">{w.replies}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							) : (
								<StackedColumns
									data={s.weekly.map((w) => ({ ...w, id: w.week }))}
									series={SERIES}
									labelOf={(d) => `W${d.id.split('-W')[1]}`}
									tooltipTitle={(d) => weekLabel(d.id)}
								/>
							)}
						</ChartCard>

						<div className="grid grid-cols-2 gap-4">
							<ChartCard title="Esperando respuesta" subtitle="Follow-ups abiertos según cuánto llevan sin respuesta">
								{s.now.waiting ? (
									<HBars
										max={Math.max(...s.waiting_buckets.map((b) => b.n))}
										rows={s.waiting_buckets.map((b) => ({ id: b.label, label: b.label, value: b.n, color: BUCKET_COLOR[b.level] }))}
									/>
								) : (
									<p className="py-4 text-[12.5px] text-fg-3">Nadie te debe una respuesta ahora mismo.</p>
								)}
							</ChartCard>
							<ChartCard title="Toques por canal" subtitle="En el periodo">
								{s.channels.length ? (
									<HBars
										rows={s.channels.map((c) => ({
											id: c.channel,
											label: c.channel === 'none' ? 'Sin canal' : CHANNEL_LABEL[c.channel as Channel],
											icon: c.channel === 'none' ? undefined : <ChannelIcon channel={c.channel as Channel} className="size-3.5" />,
											value: c.n,
											color: 'var(--series-1)',
										}))}
									/>
								) : (
									<p className="py-4 text-[12.5px] text-fg-3">Sin toques en el periodo.</p>
								)}
							</ChartCard>
						</div>

						<div className="grid grid-cols-2 gap-4">
							<ChartCard title="Cuentas con más actividad" subtitle="Toques, tareas completadas y respuestas en el periodo">
								{s.accounts.length ? (
									<HBars
										rows={s.accounts.map((a) => ({
											id: a.name,
											label: a.name,
											value: a.total,
											color: 'var(--series-1)',
											detail: [plural(a.touches, 'toque', 'toques'), plural(a.done, 'hecha', 'hechas'), plural(a.replies, 'respuesta', 'respuestas')].join(' · '),
											onClick: () => go({ kind: 'account', name: a.name }),
										}))}
									/>
								) : (
									<p className="py-4 text-[12.5px] text-fg-3">Pon la empresa en tus tareas para ver aquí las cuentas que más mueves.</p>
								)}
							</ChartCard>
							<ChartCard title="PoCs" subtitle="Todas, desde el principio">
								<div className="grid grid-cols-3 gap-2">
									<StatTile label="Activas" value={s.pocs.active} />
									<StatTile label="En pausa" value={s.pocs.paused} />
									<StatTile label="Ganadas" value={s.pocs.won} />
									<StatTile label="Perdidas" value={s.pocs.lost} />
									<StatTile label="Tasa de éxito" value={s.pocs.win_rate == null ? '—' : `${s.pocs.win_rate}%`} hint="ganadas / cerradas" />
									<StatTile label="Duración media" value={days(s.pocs.avg_days)} hint="de inicio a cierre" />
								</div>
							</ChartCard>
						</div>
					</div>
				)}
			</ViewBody>
		</>
	);
}
