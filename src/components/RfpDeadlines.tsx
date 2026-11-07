// Inicio: las fechas límite de las RFPs en preparación que vencen en los próximos 7 días (límite de preguntas y
// entrega). Las entregas vencidas siguen saliendo, en rojo, hasta que la RFP se presente o se cierre.

import { CalendarClock, ExternalLink, Send } from 'lucide-react';
import { toast } from 'sonner';
import { formatDay } from '../../shared/dates.js';
import { useActions, useRfpDeadlines } from '../api/hooks';
import type { RfpDeadline } from '../api/types';
import { useUI } from '../lib/store';
import { Chip, PocDot } from './bits';
import { Group } from './TaskList';

const actionClass =
	'inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-medium text-fg-3 transition-colors hover:bg-active hover:text-fg';

function whenLabel(days: number) {
	if (days < 0) return `Vencida hace ${-days} ${days === -1 ? 'día' : 'días'}`;
	if (days === 0) return 'Hoy';
	if (days === 1) return 'Mañana';
	return `En ${days} días`;
}

function DeadlineRow({ d, today }: { d: RfpDeadline; today: string }) {
	const a = useActions();
	const go = useUI((s) => s.go);
	const open = () => go({ kind: 'poc', id: d.id });
	const showCompany = d.company && d.company.trim().toLowerCase() !== d.name.trim().toLowerCase();

	const submit = async () => {
		await a.setPocStatus(d.id, { status: 'submitted' }).catch(() => null);
		toast.success(`${d.name}: presentada`, { action: { label: 'Deshacer', onClick: () => a.setPocStatus(d.id, { status: 'preparing' }) } });
	};

	return (
		<div role="button" onClick={open} className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors hover:bg-hover">
			<span className="flex size-[18px] shrink-0 items-center justify-center">
				<PocDot color={d.color} className="size-2.5" />
			</span>
			<div className="min-w-0 flex-1">
				<div className="truncate text-[13.5px] leading-5">
					<span className="font-medium">{d.name}</span>
					{showCompany && <span className="text-fg-3"> · {d.company}</span>}
				</div>
				<div className="text-[11.5px] text-fg-3">
					{d.what === 'questions' ? 'Límite de preguntas' : 'Entrega'}: {formatDay(d.date, today)}
				</div>
			</div>
			<div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
				{d.what === 'submission' && (
					<button type="button" onClick={submit} className={actionClass} title="Marcar la RFP como presentada hoy">
						<Send className="size-3" /> Presentada
					</button>
				)}
				<button type="button" onClick={open} className={actionClass} title="Abrir la RFP">
					<ExternalLink className="size-3" /> Abrir
				</button>
				<span className="ml-1">
					<Chip tone={d.days <= 0 ? 'danger' : 'warn'}>{whenLabel(d.days)}</Chip>
				</span>
			</div>
		</div>
	);
}

export function RfpDeadlinesGroup({ today }: { today: string }) {
	const { data = [] } = useRfpDeadlines();
	if (!data.length) return null;
	return (
		<Group
			title="RFPs con entrega próxima"
			icon={<CalendarClock />}
			count={data.length}
			tone="warn"
			right={<span className="text-[11px] text-fg-3">Preguntas y entregas de los próximos 7 días</span>}
		>
			{data.map((d) => (
				<DeadlineRow key={`${d.id}-${d.what}`} d={d} today={today} />
			))}
		</Group>
	);
}
