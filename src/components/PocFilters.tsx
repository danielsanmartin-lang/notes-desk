// Barra de filtros de las PoCs: buscador, estado, país, owner, orden y vista (tarjetas o lista). Una fila.

import { ArrowDownWideNarrow, ArrowUpNarrowWide, Check, LayoutGrid, List, Search, X } from 'lucide-react';
import type { Poc } from '../api/types';
import { cx, flagEmoji } from '../lib/format';
import {
	countryName,
	DEFAULT_DIR,
	EMPTY_FILTERS,
	hasFilters,
	SORT_LABEL,
	type PocFilterState,
	type PocSort,
	type SortKey,
	type StatusFilter,
} from '../lib/pocs';
import { Button, inputClass, Menu, MenuItem } from './ui';

export type PocViewMode = 'cards' | 'list';

const selectClass = 'h-8 rounded-lg bg-hover px-2 text-[12.5px] text-fg outline-none focus:ring-2 focus:ring-accent/40';

export function PocFilters({
	pocs,
	filters,
	onFilters,
	sort,
	onSort,
	mode,
	onMode,
	statuses,
}: {
	pocs: Poc[];
	filters: PocFilterState;
	onFilters: (f: PocFilterState) => void;
	sort: PocSort;
	onSort: (s: PocSort) => void;
	mode: PocViewMode;
	onMode: (m: PocViewMode) => void;
	statuses: { value: StatusFilter; label: string }[];
}) {
	const countries = [...new Set(pocs.map((p) => p.country).filter(Boolean) as string[])].sort((a, b) =>
		countryName(a).localeCompare(countryName(b)),
	);
	const owners = [...new Set(pocs.map((p) => p.owner).filter(Boolean) as string[])].sort();
	const set = (patch: Partial<PocFilterState>) => onFilters({ ...filters, ...patch });

	return (
		<div className="no-drag mb-5 flex flex-wrap items-center gap-2">
			<div className="relative">
				<Search className="pointer-events-none absolute top-2.5 left-2.5 size-3.5 text-fg-3" />
				<input
					value={filters.q}
					onChange={(e) => set({ q: e.target.value })}
					placeholder="Buscar PoC, empresa o partner"
					className={cx(inputClass, 'w-56 pl-8')}
				/>
			</div>
			<div className="flex gap-0.5 rounded-lg bg-hover p-0.5">
				{statuses.map((s) => (
					<button
						key={s.value}
						type="button"
						onClick={() => set({ status: s.value })}
						className={cx(
							'h-7 rounded-md px-2.5 text-[12px] font-medium transition-colors',
							filters.status === s.value ? 'bg-raised text-fg shadow-sm' : 'text-fg-3 hover:text-fg-2',
						)}
					>
						{s.label}
					</button>
				))}
			</div>
			<select value={filters.country} onChange={(e) => set({ country: e.target.value })} className={selectClass} aria-label="País">
				<option value="">Todos los países</option>
				{countries.map((c) => (
					<option key={c} value={c}>
						{flagEmoji(c)} {countryName(c)}
					</option>
				))}
			</select>
			{owners.length > 0 && (
				<select value={filters.owner} onChange={(e) => set({ owner: e.target.value })} className={selectClass} aria-label="Owner">
					<option value="">Todos los owners</option>
					{owners.map((o) => (
						<option key={o} value={o}>
							{o}
						</option>
					))}
				</select>
			)}
			{hasFilters(filters) && (
				<Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={() => onFilters(EMPTY_FILTERS)}>
					Limpiar
				</Button>
			)}

			<div className="ml-auto flex items-center gap-1.5">
				<Menu
					trigger={
						<Button size="sm" icon={sort.dir === 'desc' ? <ArrowDownWideNarrow className="size-3.5" /> : <ArrowUpNarrowWide className="size-3.5" />}>
							{SORT_LABEL[sort.key]}
						</Button>
					}
				>
					{(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
						<MenuItem key={k} icon={sort.key === k ? <Check /> : null} onSelect={() => onSort({ key: k, dir: sort.key === k ? sort.dir : DEFAULT_DIR[k] })}>
							{SORT_LABEL[k]}
						</MenuItem>
					))}
				</Menu>
				<button
					type="button"
					onClick={() => onSort({ ...sort, dir: sort.dir === 'asc' ? 'desc' : 'asc' })}
					className="flex h-7 items-center rounded-lg px-2 text-[12px] text-fg-2 hover:bg-hover"
					title="Cambiar el sentido del orden"
				>
					{sort.dir === 'asc' ? 'Ascendente' : 'Descendente'}
				</button>
				<div className="flex gap-0.5 rounded-lg bg-hover p-0.5">
					{(
						[
							{ value: 'cards', label: 'Tarjetas', icon: <LayoutGrid className="size-3.5" /> },
							{ value: 'list', label: 'Lista', icon: <List className="size-3.5" /> },
						] as const
					).map((m) => (
						<button
							key={m.value}
							type="button"
							onClick={() => onMode(m.value)}
							aria-label={m.label}
							title={m.label}
							className={cx(
								'flex h-7 w-8 items-center justify-center rounded-md transition-colors',
								mode === m.value ? 'bg-raised text-fg shadow-sm' : 'text-fg-3 hover:text-fg-2',
							)}
						>
							{m.icon}
						</button>
					))}
				</div>
			</div>
		</div>
	);
}
