// Gráficas sin librería, siguiendo la skill dataviz: barras finas con el extremo redondeado, 2px de
// separación entre segmentos, rejilla discreta, leyenda, valores en la punta y detalle al pasar el ratón.

import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '../lib/format';

export function StatTile({
	label,
	value,
	hint,
	delta,
}: {
	label: string;
	value: ReactNode;
	hint?: string;
	/** Diferencia con el periodo anterior; subir es bueno. */
	delta?: { now: number; prev: number };
}) {
	const diff = delta ? delta.now - delta.prev : 0;
	return (
		<div className="rounded-xl bg-hover px-4 py-3">
			<div className="text-[11.5px] text-fg-3">{label}</div>
			<div className="mt-1 text-[24px] leading-7 font-semibold">{value}</div>
			{delta ? (
				<div
					className={cx(
						'mt-1 inline-flex items-center gap-0.5 text-[11.5px] [&>svg]:size-3.5',
						diff > 0 ? 'text-ok' : diff < 0 ? 'text-danger' : 'text-fg-3',
					)}
				>
					{diff > 0 ? <ArrowUpRight /> : diff < 0 ? <ArrowDownRight /> : <Minus />}
					{diff > 0 ? `+${diff}` : diff} <span className="text-fg-3">vs periodo anterior</span>
				</div>
			) : (
				hint && <div className="mt-1 text-[11.5px] text-fg-3">{hint}</div>
			)}
		</div>
	);
}

export function ChartCard({ title, subtitle, right, children }: { title: string; subtitle?: string; right?: ReactNode; children: ReactNode }) {
	return (
		<section className="rounded-2xl border border-line bg-raised p-4 shadow-card">
			<div className="mb-3 flex items-start gap-3">
				<div className="min-w-0 flex-1">
					<h2 className="text-[13.5px] font-semibold">{title}</h2>
					{subtitle && <p className="mt-0.5 text-[11.5px] text-fg-3">{subtitle}</p>}
				</div>
				{right}
			</div>
			{children}
		</section>
	);
}

export const Legend = ({ items }: { items: { label: string; color: string }[] }) => (
	<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
		{items.map((i) => (
			<span key={i.label} className="inline-flex items-center gap-1.5 text-[11.5px] text-fg-2">
				<span className="size-2.5 rounded-[3px]" style={{ background: i.color }} />
				{i.label}
			</span>
		))}
	</div>
);

function useWidth<T extends HTMLElement>() {
	const ref = useRef<T>(null);
	const [width, setWidth] = useState(0);
	useLayoutEffect(() => {
		if (!ref.current) return;
		const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
		ro.observe(ref.current);
		return () => ro.disconnect();
	}, []);
	return [ref, width] as const;
}

function niceMax(v: number) {
	if (v <= 4) return 4;
	const step = 10 ** Math.floor(Math.log10(v));
	const n = Math.ceil(v / step);
	const m = n <= 2 ? 2 : n <= 4 ? 4 : n <= 5 ? 5 : 10;
	return m * step;
}

/** Rectángulo con las esquinas de arriba redondeadas (extremo de dato), recto en la base. */
function topRounded(x: number, y: number, w: number, h: number, r: number) {
	const rr = Math.min(r, w / 2, h);
	return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export interface StackSeries<K extends string> {
	key: K;
	label: string;
	color: string;
}

/** Columnas apiladas por periodo con tooltip por columna. */
export function StackedColumns<K extends string>({
	data,
	series,
	labelOf,
	tooltipTitle,
	height = 200,
}: {
	data: (Record<K, number> & { id: string })[];
	series: StackSeries<K>[];
	labelOf: (d: { id: string }) => string;
	tooltipTitle: (d: { id: string }) => string;
	height?: number;
}) {
	const [ref, width] = useWidth<HTMLDivElement>();
	const [hover, setHover] = useState<number | null>(null);
	const padL = 28;
	const padB = 22;
	const padT = 8;
	const plotW = Math.max(0, width - padL);
	const plotH = height - padB - padT;
	const max = niceMax(Math.max(1, ...data.map((d) => series.reduce((sum, s) => sum + d[s.key], 0))));
	const ticks = [0, max / 2, max];
	const band = data.length ? plotW / data.length : 0;
	const barW = Math.min(24, band * 0.6);
	const k = plotH / max;
	const every = data.length > 26 ? 4 : data.length > 13 ? 2 : 1;

	return (
		<div ref={ref} className="relative w-full select-none" style={{ height }}>
			{width > 0 && (
				<svg width={width} height={height} role="img" aria-label="Actividad por semana">
					{ticks.map((t) => {
						const y = padT + plotH - t * k;
						return (
							<g key={t}>
								<line x1={padL} x2={width} y1={y} y2={y} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth={1} />
								<text x={padL - 6} y={y + 3.5} textAnchor="end" fontSize={10.5} fill="var(--fg-3)" style={{ fontVariantNumeric: 'tabular-nums' }}>
									{t}
								</text>
							</g>
						);
					})}
					{data.map((d, i) => {
						const cx0 = padL + band * i + band / 2;
						const x = cx0 - barW / 2;
						const visible = series.filter((s) => d[s.key] > 0);
						let base = padT + plotH;
						return (
							<g key={d.id} opacity={hover == null || hover === i ? 1 : 0.45}>
								{visible.map((s, j) => {
									const h = d[s.key] * k;
									const y = base - h;
									base = y;
									const top = j === visible.length - 1;
									const hh = Math.max(1, top ? h : h - 2);
									return top ? (
										<path key={s.key} d={topRounded(x, y, barW, hh, 4)} fill={s.color} />
									) : (
										<rect key={s.key} x={x} y={y + 2} width={barW} height={hh} fill={s.color} />
									);
								})}
								{i % every === 0 && (
									<text x={cx0} y={height - 6} textAnchor="middle" fontSize={10.5} fill="var(--fg-3)">
										{labelOf(d)}
									</text>
								)}
								<rect
									x={padL + band * i}
									y={padT}
									width={band}
									height={plotH}
									fill="transparent"
									onMouseEnter={() => setHover(i)}
									onMouseLeave={() => setHover(null)}
								/>
							</g>
						);
					})}
				</svg>
			)}
			{hover != null && data[hover] && (
				<div
					className="pointer-events-none absolute z-10 min-w-36 rounded-lg border border-line bg-raised px-3 py-2 text-[12px] shadow-float"
					style={{
						left: Math.min(Math.max(padL + band * hover + band / 2 - 72, 0), Math.max(0, width - 150)),
						top: 0,
					}}
				>
					<div className="mb-1 font-semibold">{tooltipTitle(data[hover])}</div>
					{series.map((s) => (
						<div key={s.key} className="flex items-center gap-2">
							<span className="size-2 rounded-[2px]" style={{ background: s.color }} />
							<span className="flex-1 text-fg-2">{s.label}</span>
							<span className="font-medium tabular-nums">{data[hover][s.key]}</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

export interface BarRow {
	id: string;
	label: string;
	value: number;
	color: string;
	/** Detalle que aparece al pasar el ratón. */
	detail?: string;
	icon?: ReactNode;
	onClick?: () => void;
}

/** Barras horizontales con el valor en la punta. */
export function HBars({ rows, max }: { rows: BarRow[]; max?: number }) {
	const top = max ?? Math.max(1, ...rows.map((r) => r.value));
	const [hover, setHover] = useState<string | null>(null);
	return (
		<div className="flex flex-col gap-1">
			{rows.map((r) => {
				const Tag = r.onClick ? 'button' : 'div';
				return (
					<Tag
						key={r.id}
						type={r.onClick ? 'button' : undefined}
						onClick={r.onClick}
						onMouseEnter={() => setHover(r.id)}
						onMouseLeave={() => setHover(null)}
						className={cx('grid grid-cols-[120px_1fr] items-center gap-3 rounded-lg px-1.5 py-1 text-left', r.onClick && 'hover:bg-hover')}
					>
						<span className="flex min-w-0 items-center gap-1.5 text-[12px] text-fg-2 [&>svg]:size-3.5 [&>svg]:shrink-0">
							{r.icon}
							<span className="truncate" title={r.label}>
								{r.label}
							</span>
						</span>
						<span className="flex min-w-0 items-center gap-2">
							<span
								className="h-3 shrink-0 rounded-r-[4px] transition-[width] duration-500"
								style={{ width: `${r.value ? Math.max(2, (r.value / top) * 85) : 0}%`, background: r.color }}
							/>
							<span className="shrink-0 text-[12px] font-medium tabular-nums">{r.value}</span>
							{hover === r.id && r.detail && <span className="truncate text-[11.5px] text-fg-3">{r.detail}</span>}
						</span>
					</Tag>
				);
			})}
		</div>
	);
}
