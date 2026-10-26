// Selector de país con buscador: bandera, nombre en castellano y código. Arriba, Iberia y LATAM.

import { Command } from 'cmdk';
import { ChevronDown, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { COUNTRY_CODES, FREQUENT_COUNTRIES } from '../../shared/countries.js';
import { fold } from '../../shared/quickparse.js';
import { cx, flagEmoji } from '../lib/format';
import { countryName } from '../lib/pocs';
import { Popover } from './ui';

const ALL = [...COUNTRY_CODES].map((code) => ({ code, name: countryName(code) })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
const FREQUENT = FREQUENT_COUNTRIES.map((code) => ({ code, name: countryName(code) }));

const itemClass =
	'flex h-8 cursor-default items-center gap-2 rounded-lg px-2 text-[13px] data-[selected=true]:bg-active';
const groupClass =
	'[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-fg-3';

export function CountryPicker({
	value,
	onChange,
	trigger,
	className,
}: {
	value: string | null;
	onChange: (code: string | null) => void;
	/** Botón propio; si no, uno con la bandera y el nombre. */
	trigger?: ReactNode;
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	const [q, setQ] = useState('');
	const results = useMemo(() => {
		const f = fold(q.trim());
		if (!f) return null;
		return ALL.filter((c) => fold(c.name).includes(f) || c.code.toLowerCase() === f);
	}, [q]);

	const pick = (code: string | null) => {
		onChange(code);
		setOpen(false);
		setQ('');
	};
	const row = (c: { code: string; name: string }) => (
		<Command.Item key={c.code} value={c.code} onSelect={() => pick(c.code)} className={itemClass}>
			<span className="w-5 text-center">{flagEmoji(c.code)}</span>
			<span className="flex-1 truncate">{c.name}</span>
			<span className="text-[11px] text-fg-3">{c.code}</span>
		</Command.Item>
	);

	return (
		<Popover
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (!o) setQ('');
			}}
			className="w-72 p-0"
			trigger={
				trigger ?? (
					<button
						type="button"
						className={cx(
							'flex h-8 w-full items-center gap-2 rounded-lg bg-hover px-2.5 text-left text-[13px] outline-none focus:ring-2 focus:ring-accent/40',
							className,
						)}
					>
						{value ? (
							<>
								<span>{flagEmoji(value)}</span>
								<span className="min-w-0 flex-1 truncate">{countryName(value)}</span>
							</>
						) : (
							<span className="flex-1 text-fg-3">Elegir país</span>
						)}
						<ChevronDown className="size-3.5 shrink-0 text-fg-3" />
					</button>
				)
			}
		>
			<Command shouldFilter={false} loop>
				<Command.Input
					autoFocus
					value={q}
					onValueChange={setQ}
					placeholder="Busca un país (México, Chile…)"
					className="h-10 w-full border-b border-line bg-transparent px-3 text-[13px] outline-none placeholder:text-fg-3"
				/>
				<Command.List className="scroll max-h-72 p-1">
					<Command.Empty className="px-3 py-4 text-center text-[12.5px] text-fg-3">Ningún país coincide</Command.Empty>
					{value && !q && (
						<Command.Item value="__none" onSelect={() => pick(null)} className={cx(itemClass, 'text-fg-2')}>
							<X className="size-4 text-fg-3" />
							Quitar país
						</Command.Item>
					)}
					{results ? (
						results.map(row)
					) : (
						<>
							<Command.Group heading="Iberia y LATAM" className={groupClass}>
								{FREQUENT.map(row)}
							</Command.Group>
							<Command.Group heading="Todos los países" className={groupClass}>
								{ALL.filter((c) => !FREQUENT_COUNTRIES.includes(c.code)).map(row)}
							</Command.Group>
						</>
					)}
				</Command.List>
			</Command>
		</Popover>
	);
}
