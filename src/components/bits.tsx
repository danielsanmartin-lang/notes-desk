// Checkbox animado, chips de estado y pequeños indicadores que comparten filas, panel y tarjetas.

import { Bell, Building2, Hourglass, Mail, MessageCircle, Phone, Star, User, Video } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { daysBetween, relativeDay, waitingLevel } from '../../shared/dates.js';
import { fold } from '../../shared/quickparse.js';
import type { Channel, Item } from '../api/types';
import { CHANNEL_LABEL, cx, daysWaiting, timeOf } from '../lib/format';

export function Checkbox({
	checked,
	waiting,
	onToggle,
	size = 18,
	label,
}: {
	checked: boolean;
	waiting?: boolean;
	onToggle: () => void;
	size?: number;
	label?: string;
}) {
	return (
		<button
			type="button"
			role="checkbox"
			aria-checked={checked}
			aria-label={label ?? (checked ? 'Marcar como pendiente' : 'Completar')}
			onClick={(e) => {
				e.stopPropagation();
				onToggle();
			}}
			className="group relative flex shrink-0 items-center justify-center rounded-full"
			style={{ width: size, height: size }}
		>
			<motion.span
				className={cx(
					'absolute inset-0 rounded-full border-[1.5px] transition-colors duration-150',
					checked
						? 'border-accent bg-accent'
						: waiting
							? 'border-dashed border-warn group-hover:border-solid group-hover:border-accent'
							: 'border-fg-3/70 group-hover:border-accent',
				)}
				initial={false}
				animate={checked ? { scale: [1, 1.22, 1] } : { scale: 1 }}
				transition={{ duration: 0.3, ease: 'easeOut' }}
			/>
			<svg viewBox="0 0 16 16" width={size * 0.66} height={size * 0.66} className="relative">
				{!checked && (
					<path
						d="M3.5 8.5l3 3 6-7"
						fill="none"
						stroke="var(--accent)"
						strokeWidth={2}
						strokeLinecap="round"
						strokeLinejoin="round"
						className="opacity-0 transition-opacity group-hover:opacity-50"
					/>
				)}
				<motion.path
					d="M3.5 8.5l3 3 6-7"
					fill="none"
					stroke="white"
					strokeWidth={2.2}
					strokeLinecap="round"
					strokeLinejoin="round"
					initial={false}
					animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
					transition={{ duration: 0.22, delay: checked ? 0.08 : 0 }}
				/>
			</svg>
		</button>
	);
}

type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' | 'teal' | 'ghost';

const TONES: Record<Tone, string> = {
	neutral: 'bg-hover text-fg-2',
	ghost: 'text-fg-3',
	accent: 'bg-accent-soft text-accent-text',
	ok: 'bg-ok-soft text-ok',
	warn: 'bg-warn-soft text-warn',
	danger: 'bg-danger-soft text-danger',
	teal: 'bg-teal-soft text-teal',
};

export function Chip({
	tone = 'neutral',
	icon,
	children,
	title,
	className,
}: {
	tone?: Tone;
	icon?: ReactNode;
	children?: ReactNode;
	title?: string;
	className?: string;
}) {
	return (
		<span
			title={title}
			className={cx(
				'inline-flex h-5 max-w-full shrink-0 items-center gap-1 rounded-md px-1.5 text-[11.5px] leading-none font-medium whitespace-nowrap [&>svg]:size-3 [&>svg]:shrink-0',
				TONES[tone],
				className,
			)}
		>
			{icon}
			{children != null && <span className="truncate">{children}</span>}
		</span>
	);
}

export function ChannelIcon({ channel, className = 'size-3.5' }: { channel: Channel; className?: string }) {
	if (channel === 'linkedin')
		return (
			<span
				className={cx(
					'inline-flex items-center justify-center rounded-[3px] bg-current text-[8px] leading-none font-bold',
					className,
				)}
			>
				<span className="text-bg">in</span>
			</span>
		);
	const Icon = { email: Mail, whatsapp: MessageCircle, call: Phone, meeting: Video }[channel];
	return <Icon className={className} aria-label={CHANNEL_LABEL[channel]} />;
}

export function DueChip({ date, today, done }: { date: string; today: string; done?: boolean }) {
	const diff = daysBetween(today, date);
	const tone: Tone = done ? 'ghost' : diff < 0 ? 'danger' : diff === 0 ? 'accent' : 'ghost';
	return <Chip tone={tone}>{relativeDay(date, today)}</Chip>;
}

export function WaitingChip({ item, today, long }: { item: Pick<Item, 'waiting_since'>; today: string; long?: boolean }) {
	const days = daysWaiting(item, today);
	const level = waitingLevel(days);
	const tone: Tone = level === 'ok' ? 'ok' : level === 'warn' ? 'warn' : 'danger';
	const text = days === 0 ? 'Esperando desde hoy' : `${days} ${days === 1 ? 'día' : 'días'}${long ? ' sin respuesta' : ''}`;
	return (
		<Chip tone={tone} icon={<Hourglass />} title="Días esperando respuesta desde el primer toque">
			{text}
		</Chip>
	);
}

export const ReminderChip = ({ at, today }: { at: string; today: string }) => (
	<Chip tone="ghost" icon={<Bell />} title="Recordatorio">
		{at.slice(0, 10) === today ? timeOf(at) : `${relativeDay(at.slice(0, 10), today)} ${timeOf(at)}`}
	</Chip>
);

/** Resalta en `text` las palabras buscadas (ya plegadas: sin mayúsculas ni acentos). */
export function Highlight({ text, terms }: { text: string; terms?: string[] }) {
	if (!terms?.length) return <>{text}</>;
	// Se pliega carácter a carácter para saber a qué letra del original corresponde cada posición.
	const chars = [...text];
	let folded = '';
	const origin: number[] = [];
	chars.forEach((c, i) => {
		const f = fold(c);
		folded += f;
		for (let k = 0; k < f.length; k++) origin.push(i);
	});
	const marked = new Array<boolean>(chars.length).fill(false);
	for (const t of terms) {
		for (let at = folded.indexOf(t); at !== -1; at = folded.indexOf(t, at + t.length)) {
			for (let k = at; k < at + t.length; k++) marked[origin[k]] = true;
		}
	}
	const parts: { text: string; mark: boolean }[] = [];
	chars.forEach((c, i) => {
		const last = parts[parts.length - 1];
		if (last && last.mark === marked[i]) last.text += c;
		else parts.push({ text: c, mark: marked[i] });
	});
	return (
		<>
			{parts.map((p, i) =>
				p.mark ? (
					<mark key={i} className="rounded-[3px] bg-warn-soft text-fg [box-decoration-break:clone]">
						{p.text}
					</mark>
				) : (
					p.text
				),
			)}
		</>
	);
}

export const PocDot = ({ color, className = 'size-2' }: { color: string | null; className?: string }) => (
	<span className={cx('inline-block shrink-0 rounded-full', className)} style={{ background: color ?? 'var(--fg-3)' }} />
);

export const PocTag = ({ name, color }: { name: string; color: string | null }) => (
	<Chip tone="neutral" icon={<PocDot color={color} className="size-1.5" />}>
		{name}
	</Chip>
);

export const WhoChip = ({
	company,
	contact,
	onCompany,
	companyTitle,
	highlight,
}: {
	company: string | null;
	contact: string | null;
	highlight?: string[];
	/** Si se pasa, el nombre de la empresa es un enlace (a HubSpot o a la cuenta). */
	onCompany?: () => void;
	companyTitle?: string;
}) =>
	company || contact ? (
		<span className="inline-flex min-w-0 items-center gap-1 text-[11.5px] text-fg-3">
			{company ? <Building2 className="size-3 shrink-0" /> : <User className="size-3 shrink-0" />}
			{company && onCompany ? (
				<button
					type="button"
					title={companyTitle}
					onClick={(e) => {
						e.stopPropagation();
						onCompany();
					}}
					className="truncate rounded-sm hover:text-accent-text hover:underline"
				>
					<Highlight text={company} terms={highlight} />
				</button>
			) : (
				company && (
					<span className="truncate">
						<Highlight text={company} terms={highlight} />
					</span>
				)
			)}
			{contact && (
				<span className="truncate">
					{company && '· '}
					<Highlight text={contact} terms={highlight} />
				</span>
			)}
		</span>
	) : null;

export const FlagStar = ({ on, onClick }: { on: boolean; onClick?: () => void }) => (
	<button
		type="button"
		onClick={(e) => {
			e.stopPropagation();
			onClick?.();
		}}
		aria-label={on ? 'Quitar destacada' : 'Destacar'}
		title={on ? 'Quitar destacada' : 'Destacar (aparece en Inicio)'}
		className={cx('flex size-6 items-center justify-center rounded-md transition-colors hover:bg-hover', on ? 'text-warn' : 'text-fg-3')}
	>
		<Star className="size-3.5" fill={on ? 'currentColor' : 'none'} />
	</button>
);

export function ProgressBar({ done, total, color }: { done: number; total: number; color?: string | null }) {
	const pct = total ? Math.round((done / total) * 100) : 0;
	return (
		<div className="h-1.5 w-full overflow-hidden rounded-full bg-hover">
			<motion.div
				className="h-full rounded-full"
				style={{ background: color ?? 'var(--accent)' }}
				initial={false}
				animate={{ width: `${pct}%` }}
				transition={{ type: 'spring', stiffness: 160, damping: 24 }}
			/>
		</div>
	);
}

export function ProgressRing({ done, total, color, size = 14 }: { done: number; total: number; color?: string | null; size?: number }) {
	const r = size / 2 - 1.5;
	const c = 2 * Math.PI * r;
	const pct = total ? done / total : 0;
	return (
		<svg width={size} height={size} className="shrink-0 -rotate-90">
			<circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-strong)" strokeWidth={2} />
			<circle
				cx={size / 2}
				cy={size / 2}
				r={r}
				fill="none"
				stroke={color ?? 'var(--accent)'}
				strokeWidth={2}
				strokeDasharray={c}
				strokeDashoffset={c * (1 - pct)}
				strokeLinecap="round"
				style={{ transition: 'stroke-dashoffset .4s ease' }}
			/>
		</svg>
	);
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			className="flex flex-col items-center px-6 py-16 text-center"
		>
			<div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-text [&>svg]:size-6">
				{icon}
			</div>
			<div className="font-display text-[15px] font-semibold">{title}</div>
			{children && <div className="mt-1 max-w-80 text-[12.5px] text-fg-2">{children}</div>}
		</motion.div>
	);
}
