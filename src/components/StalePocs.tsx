// Inicio: PoCs activas que llevan una semana o más sin nada nuevo (ni tarea, follow-up, toque, respuesta ni
// nota, en la PoC o en su cuenta). Desaparecen solas en cuanto apuntas algo, o se silencian una semana.

import { BellOff, ExternalLink, Snowflake, StickyNote } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { addDays, formatDay } from '../../shared/dates.js';
import { useActions, useStalePocs } from '../api/hooks';
import type { StalePoc } from '../api/types';
import { cx } from '../lib/format';
import { useUI } from '../lib/store';
import { Chip, PocDot } from './bits';
import { Group } from './TaskList';

const actionClass =
	'inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-medium text-fg-3 transition-colors hover:bg-active hover:text-fg';

function StaleRow({ poc, today }: { poc: StalePoc; today: string }) {
	const a = useActions();
	const go = useUI((s) => s.go);
	const [noting, setNoting] = useState(false);
	const [text, setText] = useState('');

	const saveNote = async () => {
		const body = text.trim();
		if (!body) return;
		const note = await a.pocNote(poc.id, body).catch(() => null);
		if (!note) return;
		setNoting(false);
		setText('');
		toast.success(`Nota guardada en ${poc.name}`, {
			description: body,
			action: { label: 'Deshacer', onClick: () => a.deleteActivity(note.id) },
		});
	};

	const snooze = async () => {
		const until = addDays(today, 7);
		await a.snoozeStale(poc.id, until).catch(() => null);
		toast(`${poc.name}: aviso silenciado hasta el ${formatDay(until, today)}`, {
			action: { label: 'Deshacer', onClick: () => a.snoozeStale(poc.id, null) },
		});
	};

	const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
	const showCompany = poc.company && poc.company.trim().toLowerCase() !== poc.name.trim().toLowerCase();

	return (
		<div className="rounded-xl transition-colors hover:bg-hover">
			<div role="button" onClick={() => go({ kind: 'poc', id: poc.id })} className="flex items-center gap-2.5 px-2.5 py-2">
				<span className="flex size-[18px] shrink-0 items-center justify-center">
					<PocDot color={poc.color} className="size-2.5" />
				</span>
				<div className="min-w-0 flex-1">
					<div className="truncate text-[13.5px] leading-5">
						<span className="font-medium">{poc.name}</span>
						{showCompany && <span className="text-fg-3"> · {poc.company}</span>}
					</div>
					<div className="text-[11.5px] text-fg-3">
						{poc.last_change_at ? `Sin cambios desde el ${formatDay(poc.since, today)}` : `Nada apuntado desde que empezó, el ${formatDay(poc.since, today)}`}
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-0.5" onClick={stop}>
					<button type="button" onClick={() => setNoting((v) => !v)} className={cx(actionClass, noting && 'bg-active text-fg')} title="Apuntar una nota en la PoC">
						<StickyNote className="size-3" /> Nota
					</button>
					<button type="button" onClick={() => go({ kind: 'poc', id: poc.id })} className={actionClass} title="Abrir la PoC">
						<ExternalLink className="size-3" /> Abrir
					</button>
					<button type="button" onClick={snooze} className={actionClass} title="No avisar de esta PoC hasta dentro de una semana">
						<BellOff className="size-3" /> Silenciar
					</button>
					<span className="ml-1">
						<Chip tone="warn">{poc.days} días sin cambios</Chip>
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
						placeholder={`Nota para ${poc.name}… (↩ guardar, Esc cancelar)`}
						className="h-8 w-full rounded-lg bg-raised px-2.5 text-[13px] text-fg shadow-[0_0_0_1px_var(--line-strong)] outline-none placeholder:text-fg-3"
					/>
				</div>
			)}
		</div>
	);
}

export function StalePocsGroup({ today }: { today: string }) {
	const { data = [] } = useStalePocs();
	if (!data.length) return null;
	return (
		<Group
			title="PoCs sin movimiento"
			icon={<Snowflake />}
			count={data.length}
			tone="warn"
			right={<span className="text-[11px] text-fg-3">Una semana o más sin nada nuevo</span>}
		>
			{data.map((p) => (
				<StaleRow key={p.id} poc={p} today={today} />
			))}
		</Group>
	);
}
