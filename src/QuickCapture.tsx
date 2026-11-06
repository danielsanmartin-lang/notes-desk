// Ventana de captura rápida (⌥Espacio desde cualquier app). Estilo Spotlight: escribe, ↩ y desaparece.

import { CornerDownLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useToday } from './api/hooks';
import type { Category } from './api/types';
import { Logo } from './components/Logo';
import { ParsedChips, useCreateFromParsed, useQuickParse } from './components/Composer';
import { Kbd } from './components/ui';
import { zd } from './lib/bridge';
import { CATEGORY_LABEL, cx } from './lib/format';

const CATS: Category[] = ['followup', 'task', 'poc'];

export function QuickCapture() {
	const [text, setText] = useState('');
	const [category, setCategory] = useState<Category>('task');
	const [saved, setSaved] = useState(false);
	const ref = useRef<HTMLInputElement>(null);
	const today = useToday();
	const parsed = useQuickParse(text);
	const create = useCreateFromParsed();
	const effective = parsed.category ?? category;

	useEffect(() => {
		const reset = () => {
			setText('');
			setSaved(false);
			setTimeout(() => ref.current?.focus(), 30);
		};
		reset();
		return zd?.onQuickShown(reset);
	}, []);

	const submit = async (open: boolean) => {
		const res = await create(parsed, { category }).catch(() => null);
		if (!res) return;
		setSaved(true);
		if (open && 'item' in res) zd?.openItem(res.item.id);
		setTimeout(() => zd?.closeQuick(), open ? 0 : 450);
	};

	return (
		<div className="flex h-full items-start justify-center p-2">
			<div
				className={cx(
					'w-full overflow-hidden rounded-2xl border border-line-strong bg-panel/95 shadow-float transition-transform duration-200',
					saved && 'scale-[0.98]',
				)}
			>
				<div className="flex h-14 items-center gap-3 px-4">
					<Logo className="size-6 shrink-0" />
					<input
						ref={ref}
						autoFocus
						value={text}
						onChange={(e) => setText(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit(e.metaKey);
							if (e.key === 'Escape') zd?.closeQuick();
							if (e.key === 'Tab') {
								e.preventDefault();
								setCategory(CATS[(CATS.indexOf(category) + (e.shiftKey ? 2 : 1)) % 3]);
							}
						}}
						placeholder={saved ? 'Guardada ✓' : 'Apunta algo… «FUP Catalina BCI el viernes»'}
						className="h-full min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-fg-3"
					/>
				</div>
				<div className="flex min-h-11 items-center gap-2 border-t border-line px-4">
					<div className="flex gap-0.5 rounded-lg bg-hover p-0.5">
						{CATS.map((c) => (
							<button
								key={c}
								type="button"
								onClick={() => {
									setCategory(c);
									ref.current?.focus();
								}}
								className={cx(
									'h-6 rounded-md px-2 text-[11.5px] font-medium transition-colors',
									effective === c ? 'bg-raised text-fg shadow-sm' : 'text-fg-3 hover:text-fg-2',
								)}
							>
								{CATEGORY_LABEL[c]}
							</button>
						))}
					</div>
					<div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
						<ParsedChips parsed={{ ...parsed, category: parsed.category === 'note' ? 'note' : null }} defaults={{ category }} today={today} />
					</div>
					<div className="flex shrink-0 items-center gap-1.5 text-[11px] text-fg-3">
						<Kbd>Tab</Kbd> tipo
						<Kbd>
							<CornerDownLeft className="size-2.5" />
						</Kbd>
						guardar
						<Kbd>⌘↩</Kbd> y abrir
					</div>
				</div>
			</div>
		</div>
	);
}
