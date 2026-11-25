// Inicio: cuentas con deal abierto que llevan los días de Ajustes o más sin nada nuevo (ni tarea, follow-up, toque,
// respuesta ni nota en la cuenta). Desaparecen solas en cuanto apuntas algo, o se silencian una semana.

import { BellOff, Briefcase, ExternalLink, StickyNote } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { addDays, formatDay } from '../../shared/dates.js';
import { useActions, useSettings, useStaleDeals } from '../api/hooks';
import type { StaleDeal } from '../api/types';
import { cx, plural } from '../lib/format';
import { useUI } from '../lib/store';
import { accountColor } from '../views/AccountViews';
import { Chip, PocDot } from './bits';
import { Group } from './TaskList';

const actionClass =
	'inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-medium text-fg-3 transition-colors hover:bg-active hover:text-fg';

function StaleDealRow({ deal, today }: { deal: StaleDeal; today: string }) {
	const a = useActions();
	const go = useUI((s) => s.go);
	const [noting, setNoting] = useState(false);
	const [text, setText] = useState('');
	const open = () => go({ kind: 'account', name: deal.name });

	const saveNote = async () => {
		const body = text.trim();
		if (!body) return;
		const note = await a.addNote({ company: deal.name, body }).catch(() => null);
		if (!note) return;
		setNoting(false);
		setText('');
		toast.success(`Nota guardada en ${deal.name}`, {
			description: body,
			action: { label: 'Deshacer', onClick: () => a.deleteActivity(note.id) },
		});
	};

	const snooze = async () => {
		const until = addDays(today, 7);
		await a.snoozeStaleDeal(deal.name, until).catch(() => null);
		toast(`${deal.name}: aviso silenciado hasta el ${formatDay(until, today)}`, {
			action: { label: 'Deshacer', onClick: () => a.snoozeStaleDeal(deal.name, null) },
		});
	};

	const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

	return (
		<div className="rounded-xl transition-colors hover:bg-hover">
			<div role="button" onClick={open} className="flex items-center gap-2.5 px-2.5 py-2">
				<span className="flex size-[18px] shrink-0 items-center justify-center">
					<PocDot color={accountColor(deal.name)} className="size-2.5" />
				</span>
				<div className="min-w-0 flex-1">
					<div className="truncate text-[13.5px] leading-5">
						<span className="font-medium">{deal.name}</span>
						<span className="text-fg-3"> · Deal</span>
					</div>
					<div className="text-[11.5px] text-fg-3">
						{deal.last_change_at && deal.last_change_at >= deal.opened_at
							? `Sin cambios desde el ${formatDay(deal.since, today)}`
							: `Nada nuevo desde que marcaste el deal, el ${formatDay(deal.since, today)}`}
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-0.5" onClick={stop}>
					<button type="button" onClick={() => setNoting((v) => !v)} className={cx(actionClass, noting && 'bg-active text-fg')} title="Apuntar una nota en la cuenta">
						<StickyNote className="size-3" /> Nota
					</button>
					<button type="button" onClick={open} className={actionClass} title="Abrir la cuenta">
						<ExternalLink className="size-3" /> Abrir
					</button>
					<button type="button" onClick={snooze} className={actionClass} title="No avisar de este deal hasta dentro de una semana">
						<BellOff className="size-3" /> Silenciar
					</button>
					<span className="ml-1">
						<Chip tone="warn">{deal.days} días sin cambios</Chip>
					</span>
				</div>
			</div>
			{noting && (
				<div className="px-2.5 pb-2 pl-[38px]">
					<input
						autoFocus
						value={text}
						onChange={(e) => setText(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveNote();
							if (e.key === 'Escape') {
								e.stopPropagation();
								setNoting(false);
								setText('');
							}
						}}
						placeholder={`Nota para ${deal.name}… (↩ guardar, Esc cancelar)`}
						className="h-8 w-full rounded-lg bg-raised px-2.5 text-[13px] text-fg shadow-[0_0_0_1px_var(--line-strong)] outline-none placeholder:text-fg-3"
					/>
				</div>
			)}
		</div>
	);
}

export function StaleDealsGroup({ today }: { today: string }) {
	const { data = [] } = useStaleDeals();
	const { data: s } = useSettings();
	if (!data.length) return null;
	return (
		<Group
			title="Deals sin movimiento"
			icon={<Briefcase />}
			count={data.length}
			tone="warn"
			right={!!s?.deal_stale_days && <span className="text-[11px] text-fg-3">{plural(s.deal_stale_days, 'día', 'días')} o más sin nada nuevo</span>}
		>
			{data.map((d) => (
				<StaleDealRow key={d.key} deal={d} today={today} />
			))}
		</Group>
	);
}
