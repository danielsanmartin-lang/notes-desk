// Campo de "nueva tarea" con lenguaje natural. Muestra en chips lo que ha entendido antes de guardar.

import { Bell, Building2, CalendarDays, Plus, Star } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { relativeDay } from '../../shared/dates.js';
import { parseQuick } from '../../shared/quickparse.js';
import { useActions, usePocs, useSuggestions, useToday } from '../api/hooks';
import type { Category, Item } from '../api/types';
import { CATEGORY_LABEL, cx, timeOf } from '../lib/format';
import { useUI } from '../lib/store';
import { Chip, PocDot } from './bits';

export interface ComposerDefaults {
	category: Category;
	poc_id?: number;
	due_date?: string;
}

export interface Parsed {
	title: string;
	category: Category | null;
	pocId: number | null;
	pocName: string | null;
	pocColor: string | null;
	dueDate: string | null;
	remindAt: string | null;
	flagged: boolean;
	company: string | null;
}

export function useQuickParse(text: string): Parsed {
	const { data: pocs = [] } = usePocs();
	const { data: sugg } = useSuggestions();
	return useMemo(
		() =>
			parseQuick(text, {
				now: new Date(),
				pocs: pocs.filter((p) => p.status !== 'won' && p.status !== 'lost'),
				companies: sugg?.companies ?? [],
			}) as Parsed,
		[text, pocs, sugg],
	);
}

export function useCreateFromParsed() {
	const a = useActions();
	return async (parsed: Parsed, defaults: ComposerDefaults): Promise<Item | null> => {
		const category = parsed.category ?? defaults.category;
		const pocId = parsed.pocId ?? (category === 'poc' ? defaults.poc_id : undefined);
		if (!parsed.title) return null;
		if (category === 'poc' && !pocId) {
			toast.error('¿De qué PoC? Escríbela con @, por ejemplo @Cafam');
			return null;
		}
		return a.create({
			title: parsed.title,
			category,
			poc_id: pocId ?? null,
			due_date: parsed.dueDate ?? defaults.due_date ?? null,
			remind_at: parsed.remindAt,
			flagged: parsed.flagged,
			company: parsed.company,
		});
	};
}

export function ParsedChips({ parsed, defaults, today }: { parsed: Parsed; defaults: ComposerDefaults; today: string }) {
	const chips = [];
	if (parsed.category && parsed.category !== defaults.category && parsed.category !== 'poc')
		chips.push(
			<Chip key="cat" tone="accent">
				{CATEGORY_LABEL[parsed.category]}
			</Chip>,
		);
	if (parsed.pocName)
		chips.push(
			<Chip key="poc" tone="accent" icon={<PocDot color={parsed.pocColor} className="size-1.5" />}>
				{parsed.pocName}
			</Chip>,
		);
	if (parsed.dueDate)
		chips.push(
			<Chip key="date" tone="accent" icon={<CalendarDays />}>
				{relativeDay(parsed.dueDate, today)}
			</Chip>,
		);
	if (parsed.remindAt)
		chips.push(
			<Chip key="time" tone="accent" icon={<Bell />}>
				Aviso {timeOf(parsed.remindAt)}
			</Chip>,
		);
	if (parsed.company)
		chips.push(
			<Chip key="company" tone="neutral" icon={<Building2 />}>
				{parsed.company}
			</Chip>,
		);
	if (parsed.flagged)
		chips.push(
			<Chip key="flag" tone="warn" icon={<Star />}>
				Destacada
			</Chip>,
		);
	return <>{chips}</>;
}

export function Composer({ defaults, placeholder }: { defaults: ComposerDefaults; placeholder: string }) {
	const [text, setText] = useState('');
	const [focused, setFocused] = useState(false);
	const ref = useRef<HTMLInputElement>(null);
	const today = useToday();
	const parsed = useQuickParse(text);
	const create = useCreateFromParsed();
	const composerFocus = useUI((s) => s.composerFocus);

	useEffect(() => {
		if (composerFocus) ref.current?.focus();
	}, [composerFocus]);

	const select = useUI((s) => s.select);
	const submit = async () => {
		const item = await create(parsed, defaults).catch(() => null);
		if (!item) return;
		setText('');
		// Si la tarea no va a la lista que estás viendo, dilo para que no parezca que se ha perdido.
		const elsewhere = item.category !== defaults.category || (defaults.poc_id != null && item.poc_id !== defaults.poc_id);
		if (elsewhere) {
			toast.success(`Añadida a ${item.poc_name ?? (item.category === 'followup' ? 'Follow-ups' : 'Tareas pendientes')}`, {
				description: item.title,
				action: { label: 'Abrir', onClick: () => select(item.id) },
			});
		}
	};

	const hasChips = !!(parsed.dueDate || parsed.pocName || parsed.flagged || parsed.company || parsed.remindAt);

	return (
		<div
			className={cx(
				'mb-3 rounded-xl px-2.5 transition-[background,box-shadow]',
				focused ? 'bg-raised shadow-[0_0_0_1px_var(--line-strong),var(--shadow)]' : 'hover:bg-hover',
			)}
		>
			<div className="flex h-10 items-center gap-2.5">
				<Plus className={cx('size-[18px] shrink-0 transition-colors', focused ? 'text-accent' : 'text-fg-3')} />
				<input
					ref={ref}
					value={text}
					onChange={(e) => setText(e.target.value)}
					onFocus={() => setFocused(true)}
					onBlur={() => setFocused(false)}
					onKeyDown={(e) => {
						if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit();
						if (e.key === 'Escape') {
							setText('');
							ref.current?.blur();
						}
					}}
					placeholder={placeholder}
					className="h-full min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-fg-3"
				/>
				{focused && text && <span className="text-[11px] text-fg-3">↩ añadir</span>}
			</div>
			<AnimatePresence>
				{focused && text && hasChips && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: 'auto', opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						className="flex flex-wrap gap-1.5 overflow-hidden pb-2.5 pl-7"
					>
						<ParsedChips parsed={parsed} defaults={defaults} today={today} />
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
