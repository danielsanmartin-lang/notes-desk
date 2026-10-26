// "Registrar toque" y "Han respondido": los dos gestos del flujo de follow-up.

import { useEffect, useRef, useState } from 'react';
import { addDays, formatDay, skipWeekend } from '../../shared/dates.js';
import { useSettings, useToday } from '../api/hooks';
import type { Channel, Item } from '../api/types';
import { CHANNEL_LABEL, CHANNELS, cx } from '../lib/format';
import { useItemOps } from '../lib/ops';
import { ChannelIcon } from './bits';
import { Button, inputClass, Kbd } from './ui';

export function ChannelPicker({ value, onChange }: { value: Channel | null; onChange: (c: Channel | null) => void }) {
	return (
		<div className="flex gap-1">
			{CHANNELS.map((c) => (
				<button
					key={c}
					type="button"
					title={CHANNEL_LABEL[c]}
					aria-label={CHANNEL_LABEL[c]}
					aria-pressed={value === c}
					onClick={() => onChange(value === c ? null : c)}
					className={cx(
						'flex h-7 items-center gap-1.5 rounded-lg px-2 text-[12px] transition-colors',
						value === c ? 'bg-accent text-accent-fg' : 'text-fg-2 hover:bg-hover',
					)}
				>
					<ChannelIcon channel={c} className="size-3.5" />
					{value === c && <span>{CHANNEL_LABEL[c]}</span>}
				</button>
			))}
		</div>
	);
}

const NEXT_OPTIONS = [2, 3, 5, 7, 14];

export function TouchForm({ item, onDone }: { item: Item; onDone: () => void }) {
	const today = useToday();
	const { data: settings } = useSettings();
	const ops = useItemOps();
	const [channel, setChannel] = useState<Channel | null>(item.channel ?? 'email');
	const [body, setBody] = useState('');
	const defaultDays = settings?.fup_days ?? 3;
	const [next, setNext] = useState<string | null>(skipWeekend(addDays(today, defaultDays)));
	const [busy, setBusy] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		setNext(skipWeekend(addDays(today, defaultDays)));
	}, [defaultDays, today]);

	const submit = async () => {
		if (busy) return;
		setBusy(true);
		try {
			await ops.touch(item, { channel, body, next_date: next });
			onDone();
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="w-80" onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.target === inputRef.current) && submit()}>
			<div className="mb-2.5 text-[13px] font-semibold">Registrar toque</div>
			<ChannelPicker value={channel} onChange={setChannel} />
			<input
				ref={inputRef}
				autoFocus
				value={body}
				onChange={(e) => setBody(e.target.value)}
				placeholder="¿Qué has enviado? (opcional)"
				className={cx(inputClass, 'mt-2.5')}
			/>
			<div className="mt-3 mb-1.5 text-[11.5px] font-medium text-fg-3">Próximo follow-up</div>
			<div className="flex flex-wrap gap-1">
				{NEXT_OPTIONS.map((n) => {
					const d = skipWeekend(addDays(today, n));
					return (
						<button
							key={n}
							type="button"
							onClick={() => setNext(d)}
							className={cx(
								'rounded-lg px-2 py-1 text-left text-[11.5px] transition-colors',
								next === d ? 'bg-accent-soft text-accent-text' : 'text-fg-2 hover:bg-hover',
							)}
						>
							<div className="font-medium">{n === 7 ? '1 semana' : n === 14 ? '2 semanas' : `${n} días`}</div>
							<div className="text-[10.5px] opacity-75">{formatDay(d, today)}</div>
						</button>
					);
				})}
				<button
					type="button"
					onClick={() => setNext(null)}
					className={cx(
						'rounded-lg px-2 py-1 text-[11.5px] font-medium transition-colors',
						next === null ? 'bg-accent-soft text-accent-text' : 'text-fg-2 hover:bg-hover',
					)}
				>
					Sin fecha
				</button>
			</div>
			<input type="date" value={next ?? ''} onChange={(e) => setNext(e.target.value || null)} className={cx(inputClass, 'mt-2')} />
			<div className="mt-3 flex items-center justify-between">
				<span className="text-[11px] text-fg-3">
					<Kbd>↩</Kbd> registrar
				</span>
				<Button variant="primary" onClick={submit} disabled={busy}>
					Registrar toque
				</Button>
			</div>
		</div>
	);
}

export function ReplyForm({ item, onDone }: { item: Item; onDone: () => void }) {
	const ops = useItemOps();
	const [body, setBody] = useState('');
	const send = async (complete: boolean) => {
		await ops.reply(item, { body, complete });
		onDone();
	};
	return (
		<div className="w-80">
			<div className="mb-2.5 text-[13px] font-semibold">Han respondido</div>
			<input
				autoFocus
				value={body}
				onChange={(e) => setBody(e.target.value)}
				onKeyDown={(e) => e.key === 'Enter' && send(false)}
				placeholder="¿Qué te han dicho? (opcional)"
				className={inputClass}
			/>
			<div className="mt-3 flex justify-end gap-2">
				<Button onClick={() => send(false)}>Me toca a mí</Button>
				<Button variant="primary" onClick={() => send(true)}>
					Cerrar follow-up
				</Button>
			</div>
		</div>
	);
}
