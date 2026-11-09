import { BarChart3, Table2 } from 'lucide-react';
import { useState } from 'react';
import { formatDayMonth, weekLabel } from '../../shared/dates.js';
import { useStats } from '../api/hooks';
import type { Channel, RegionKey, Stats } from '../api/types';
import { ChannelIcon, EmptyState } from '../components/bits';
import { ChartCard, HBars, Legend, StackedColumns, StatTile, type StackSeries } from '../components/charts';
import { Button } from '../components/ui';
import { capFirst, CHANNEL_LABEL, cx, flagEmoji, plural } from '../lib/format';
import { countryName, formatSums, REGION_LABEL, usePersistentState } from '../lib/pocs';
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

const REGION_FILTERS = [
	{ value: 'all', label: 'Todas' },
	{ value: 'iberia', label: 'Iberia' },
	{ value: 'latam', label: 'LATAM' },
] as const;

const REGION_COLOR: Record<RegionKey, string> = {
	iberia: 'var(--region-iberia)',
	latam: 'var(--region-latam)',
	none: 'var(--region-none)',
};
const REGION_ICON: Record<RegionKey, string> = { iberia: '🇪🇸 🇵🇹', latam: '🌎', none: '🏳️' };
const MONTH = new Intl.DateTimeFormat('es-ES', { month: 'short' });
const MONTH_YEAR = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
const monthDate = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1);

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void }) {
	return (
		<div className="flex gap-0.5 rounded-lg bg-hover p-0.5">
			{options.map((o) => (
				<button
					key={o.value}
					type="button"
					onClick={() => onChange(o.value)}
					className={cx(
						'h-6.5 rounded-md px-2.5 text-[12px] font-medium transition-colors',
						value === o.value ? 'bg-raised text-fg shadow-sm' : 'text-fg-3 hover:text-fg-2',
					)}
				>
					{o.label}
				</button>
			))}
		</div>
	);
}

function RegionCard({ r }: { r: Stats['regions'][number] }) {
	return (
		<div className="rounded-2xl border border-line bg-raised p-4 shadow-card">
			<div className="flex items-center gap-2">
				<span className="size-2.5 rounded-[3px]" style={{ background: REGION_COLOR[r.region] }} />
				<span className="text-[13.5px] font-semibold">
					{REGION_ICON[r.region]} {REGION_LABEL[r.region]}
				</span>
			</div>
			<div className="mt-3 text-[11.5px] text-fg-3">En curso</div>
			<div className="text-[22px] leading-7 font-semibold">{formatSums(r.amounts) ?? '—'}</div>
			<div className="mt-3 grid grid-cols-4 gap-2 text-[12px]">
				<div>
					<div className="text-fg-3">Activas</div>
					<div className="text-[15px] font-semibold">{r.active}</div>
				</div>
				<div>
					<div className="text-fg-3">En pausa</div>
					<div className="text-[15px] font-semibold">{r.paused}</div>
				</div>
				<div title="La prueba terminó y falta la decisión del cliente">
					<div className="text-fg-3">Finalizadas</div>
					<div className="text-[15px] font-semibold">{r.finished}</div>
				</div>
				<div>
					<div className="text-fg-3">Éxito</div>
					<div className="text-[15px] font-semibold">{r.win_rate == null ? '—' : `${r.win_rate}%`}</div>
				</div>
			</div>
			<div className="mt-2 text-[11.5px] text-fg-3">
				{plural(r.won, 'ganada', 'ganadas')} · {plural(r.lost, 'perdida', 'perdidas')}
				{r.avg_days != null && ` · ${r.avg_days} días de media`}
				{r.won_amounts.length > 0 && ` · ganado ${formatSums(r.won_amounts)}`}
			</div>
		</div>
	);
}

export function StatsView() {
	const [weeks, setWeeks] = useState(12);
	const [asTable, setAsTable] = useState(false);
	const [regionPref, setRegionPref] = usePersistentState<{ region: 'all' | 'iberia' | 'latam' }>('zd.stats.region', { region: 'all' });
	const regionFilter = regionPref.region;
	const { data: s } = useStats(weeks, regionFilter);
	const go = useUI((st) => st.go);
	useListIds([]);

	const empty = s && !s.totals.done && !s.totals.touches && !s.totals.replies && !s.now.waiting && !s.now.mine;

	return (
		<>
			<ViewHeader
				icon={<BarChart3 />}
				iconClass="bg-teal-soft text-teal"
				title="Estadísticas"
				subtitle={
					s
						? `${regionFilter === 'all' ? 'Todas las regiones' : REGION_LABEL[regionFilter]} · ${weekLabel(s.weekly[0].week).split(' · ')[0]} – ${weekLabel(s.weekly.at(-1)!.week).split(' · ')[0]} · desde el ${formatDayMonth(s.from)}`
						: ' '
				}
				right={
					<div className="flex items-center gap-2">
						<Segmented value={regionFilter} options={REGION_FILTERS} onChange={(region) => setRegionPref({ region })} />
						<Segmented
							value={String(weeks)}
							options={PERIODS.map((p) => ({ value: String(p.weeks), label: p.label }))}
							onChange={(v) => setWeeks(Number(v))}
						/>
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
							<ChartCard title="Actividad por región" subtitle={regionFilter === 'all' ? 'Toques, completadas y respuestas en el periodo' : 'Cambia a «Todas» para comparar regiones'}>
								{regionFilter === 'all' ? (
									<StackedColumns
										height={170}
										label="Actividad por región"
										data={s.activity_by_region.filter((r) => r.region !== 'none' || r.touches + r.done + r.replies > 0).map((r) => ({ ...r, id: r.region }))}
										series={SERIES}
										labelOf={(d) => (d.id === 'none' ? 'Sin región' : REGION_LABEL[d.id as RegionKey])}
										tooltipTitle={(d) => (d.id === 'none' ? 'Sin región' : REGION_LABEL[d.id as RegionKey])}
									/>
								) : (
									<p className="py-4 text-[12.5px] text-fg-3">Estás viendo solo {REGION_LABEL[regionFilter]}.</p>
								)}
							</ChartCard>
						</div>

						<h2 className="pt-4 font-display text-[16px] font-semibold">PoCs</h2>
						{(() => {
							const cards = s.regions.filter((r) => regionFilter === 'all' || r.region === regionFilter);
							return (
								<div className={cx('grid gap-4', cards.length >= 3 ? 'grid-cols-3' : cards.length === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
									{cards.map((r) => (
										<RegionCard key={r.region} r={r} />
									))}
								</div>
							);
						})()}
						<div className="grid grid-cols-2 gap-4">
							<ChartCard title="PoCs por país" subtitle="En curso (activas y en pausa)">
								{s.countries.length ? (
									<HBars
										rows={s.countries.map((c) => ({
											id: c.country,
											label: c.country === 'none' ? 'Sin país' : `${flagEmoji(c.country)} ${countryName(c.country)}`,
											value: c.n,
											color: REGION_COLOR[c.region],
											detail: formatSums(c.amounts) ?? undefined,
										}))}
									/>
								) : (
									<p className="py-4 text-[12.5px] text-fg-3">Sin PoCs en curso.</p>
								)}
							</ChartCard>
							<ChartCard
								title="Días en PoC"
								subtitle="PoCs activas, desde su fecha de inicio"
								right={regionFilter === 'all' ? <Legend items={(['iberia', 'latam'] as const).map((r) => ({ label: REGION_LABEL[r], color: REGION_COLOR[r] }))} /> : undefined}
							>
								{s.poc_days.length ? (
									<HBars
										rows={s.poc_days.map((p) => ({
											id: String(p.id),
											label: p.name,
											value: p.days,
											color: REGION_COLOR[p.region],
											detail: p.country ? countryName(p.country) : undefined,
											onClick: () => go({ kind: 'poc', id: p.id }),
										}))}
									/>
								) : (
									<p className="py-4 text-[12.5px] text-fg-3">Ninguna PoC activa con fecha de inicio.</p>
								)}
							</ChartCard>
						</div>
						<ChartCard
							title="Cierres previstos por mes"
							subtitle={`Fecha de cierre del deal de las PoCs en curso${s.closes_earlier ? ` · ${plural(s.closes_earlier, 'tiene', 'tienen')} la fecha de cierre ya pasada` : ''}`}
							right={
								<Legend
									items={(['iberia', 'latam', 'none'] as const)
										.filter((r) => (regionFilter === 'all' || r === regionFilter) && (r !== 'none' || s.closes.some((c) => c.none)))
										.map((r) => ({ label: REGION_LABEL[r], color: REGION_COLOR[r] }))}
								/>
							}
						>
							<StackedColumns
								height={180}
								label="Cierres previstos por mes"
								data={s.closes.map((c) => ({ id: c.month, iberia: c.iberia, latam: c.latam, none: c.none }))}
								series={(['iberia', 'latam', 'none'] as const).map((r) => ({ key: r, label: REGION_LABEL[r], color: REGION_COLOR[r] }))}
								labelOf={(d) => MONTH.format(monthDate(d.id)).replace('.', '')}
								tooltipTitle={(d) => capFirst(MONTH_YEAR.format(monthDate(d.id)))}
								tooltipExtra={(d) => formatSums(s.closes.find((c) => c.month === d.id)?.amounts ?? [])}
							/>
						</ChartCard>
					</div>
				)}
			</ViewBody>
		</>
	);
}
