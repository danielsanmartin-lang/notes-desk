// Selector de fecha: atajos (Hoy, Mañana, viernes…), fecha escrita en castellano o calendario nativo.

import { Bell, CalendarDays, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { addBusinessDays, addDays, formatDay, isoDow, nextDow, relativeDay, toDateTimeStr } from '../../shared/dates.js';
import { parseQuick } from '../../shared/quickparse.js';
import { useToday } from '../api/hooks';
import { cx } from '../lib/format';
import { Button, inputClass, Popover } from './ui';

export function quickDates(today: string) {
	const dow = isoDow(today);
	return [
		{ label: 'Hoy', value: today },
		{ label: 'Mañana', value: addDays(today, 1) },
		{ label: 'En 3 días laborables', value: addBusinessDays(today, 3) },
		dow < 5 ? { label: 'Este viernes', value: nextDow(today, 5) } : { label: 'Lunes', value: nextDow(today, 1) },
		{ label: 'Próximo lunes', value: nextDow(today, 1) },
		{ label: 'En 1 semana', value: addDays(today, 7) },
		{ label: 'En 2 semanas', value: addDays(today, 14) },
	].filter((o, i, arr) => arr.findIndex((x) => x.value === o.value) === i);
}

export function DatePicker({
	value,
	onChange,
	trigger,
	allowClear = true,
}: {
	value: string | null;
	onChange: (v: string | null) => void;
	trigger?: ReactNode;
	allowClear?: boolean;
}) {
	const today = useToday();
	const [open, setOpen] = useState(false);
	const [text, setText] = useState('');
	const parsed = text ? (parseQuick(`x ${text}`, { now: new Date() }).dueDate as string | null) : null;
	const pick = (v: string | null) => {
		onChange(v);
		setOpen(false);
		setText('');
	};

	return (
		<Popover
			open={open}
			onOpenChange={setOpen}
			className="w-64"
			trigger={
				trigger ?? (
					<button
						type="button"
						className={cx(
							'inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[12.5px] hover:bg-hover',
							value ? 'text-fg' : 'text-fg-3',
						)}
					>
						<CalendarDays className="size-3.5" />
						{value ? relativeDay(value, today) : 'Sin fecha'}
					</button>
				)
			}
		>
			<div className="grid grid-cols-2 gap-1">
				{quickDates(today).map((o) => (
					<button
						key={o.label}
						type="button"
						onClick={() => pick(o.value)}
						className={cx(
							'flex flex-col items-start rounded-lg px-2 py-1.5 text-left hover:bg-hover',
							value === o.value && 'bg-active',
						)}
					>
						<span className="text-[12.5px] font-medium">{o.label}</span>
						<span className="text-[11px] text-fg-3">{formatDay(o.value, today)}</span>
					</button>
				))}
			</div>
			<div className="mt-2 border-t border-line pt-2">
				<input
					autoFocus
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter' && parsed) pick(parsed);
					}}
					placeholder="viernes, 15 nov, en 3 días…"
					className={inputClass}
				/>
				{text && (
					<div className="mt-1.5 px-1 text-[11.5px] text-fg-2">
						{parsed ? (
							<>
								↩ {formatDay(parsed, today)} <span className="text-fg-3">({relativeDay(parsed, today)})</span>
							</>
						) : (
							<span className="text-fg-3">No entiendo esa fecha</span>
						)}
					</div>
				)}
				<div className="mt-2 flex items-center gap-2">
					<input
						type="date"
						value={value ?? ''}
						onChange={(e) => e.target.value && pick(e.target.value)}
						className={cx(inputClass, 'flex-1')}
					/>
					{allowClear && value && (
						<Button variant="ghost" size="sm" icon={<X className="size-3.5" />} onClick={() => pick(null)}>
							Quitar
						</Button>
					)}
				</div>
			</div>
		</Popover>
	);
}

/** Recordatorio con hora: atajos (en 1 hora, mañana a las 9…) o fecha y hora a mano. */
export function ReminderPicker({
	value,
	dueDate,
	onChange,
}: {
	value: string | null;
	dueDate: string | null;
	onChange: (v: string | null) => void;
}) {
	const today = useToday();
	const [open, setOpen] = useState(false);
	const now = new Date();
	const inHour = new Date(now.getTime() + 3600_000);
	inHour.setMinutes(Math.ceil(inHour.getMinutes() / 5) * 5, 0, 0);
	const options = [
		{ label: 'En 1 hora', value: toDateTimeStr(inHour) },
		...(now.getHours() < 16 ? [{ label: 'Hoy a las 16:00', value: `${today}T16:00:00` }] : []),
		{ label: 'Mañana a las 9:00', value: `${addDays(today, 1)}T09:00:00` },
		...(dueDate && dueDate > addDays(today, 1)
			? [{ label: `${relativeDay(dueDate, today)} a las 9:00`, value: `${dueDate}T09:00:00` }]
			: []),
	];
	const pick = (v: string | null) => {
		onChange(v);
		setOpen(false);
	};
	return (
		<Popover
			open={open}
			onOpenChange={setOpen}
			className="w-60"
			trigger={
				<button
					type="button"
					className={cx(
						'inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[12.5px] hover:bg-hover',
						value ? 'text-fg' : 'text-fg-3',
					)}
				>
					<Bell className="size-3.5" />
					{value ? `${relativeDay(value.slice(0, 10), today)} · ${value.slice(11, 16)}` : 'Sin recordatorio'}
				</button>
			}
		>
			<div className="flex flex-col">
				{options.map((o) => (
					<button
						key={o.label}
						type="button"
						onClick={() => pick(o.value)}
						className="flex h-8 items-center justify-between rounded-lg px-2 text-left text-[12.5px] hover:bg-hover"
					>
						<span className="font-medium">{o.label}</span>
						<span className="text-[11px] text-fg-3">{o.value.slice(11, 16)}</span>
					</button>
				))}
			</div>
			<div className="mt-2 flex items-center gap-2 border-t border-line pt-2">
				<input
					type="datetime-local"
					value={value?.slice(0, 16) ?? ''}
					onChange={(e) => e.target.value && onChange(e.target.value)}
					className={cx(inputClass, 'flex-1')}
				/>
				{value && (
					<Button variant="ghost" size="sm" icon={<X className="size-3.5" />} onClick={() => pick(null)}>
						Quitar
					</Button>
				)}
			</div>
		</Popover>
	);
}
