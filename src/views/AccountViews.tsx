// Vista por cuenta: cada empresa con todo lo suyo (follow-ups, tareas, PoCs, contactos e historial).
// Las cuentas no se dan de alta: salen de la empresa de cada tarea y de cada PoC.

import { Building2, ChevronRight, Hand, Hourglass, Mail, Search, Send, Timer } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { daysBetween, formatDay } from '../../shared/dates.js';
import { fold } from '../../shared/quickparse.js';
import { useAccount, useAccounts, useToday } from '../api/hooks';
import type { AccountSummary } from '../api/types';
import { Chip, EmptyState, PocDot } from '../components/bits';
import { Composer } from '../components/Composer';
import { Avatar } from '../components/PocDetails';
import { DoneSection, Group, TaskList } from '../components/TaskList';
import { Timeline } from '../components/Timeline';
import { inputClass, SectionTitle } from '../components/ui';
import { openExternal } from '../lib/bridge';
import { cx, plural } from '../lib/format';
import { useUI } from '../lib/store';
import { useListIds, ViewBody, ViewHeader } from './common';
import { PocCard } from './PocViews';

const ACCOUNT_COLORS = ['#142CD1', '#1D9E75', '#D85A30', '#7F77DD', '#D4537E', '#BA7517', '#0E9AA7', '#639922'];

export function accountColor(name: string) {
	let h = 0;
	for (const c of fold(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
	return ACCOUNT_COLORS[h % ACCOUNT_COLORS.length];
}

const openCount = (a: AccountSummary) => a.followups + a.waiting + a.tasks + a.poc_items;

function idleText(last: string | null, today: string) {
	if (!last) return 'Sin movimientos';
	const d = daysBetween(last.slice(0, 10), today);
	return d === 0 ? 'Movimiento hoy' : d === 1 ? 'Movimiento ayer' : `Último movimiento hace ${d} días`;
}

function AccountRow({ account, today }: { account: AccountSummary; today: string }) {
	const go = useUI((s) => s.go);
	return (
		<button
			type="button"
			onClick={() => go({ kind: 'account', name: account.name })}
			className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-hover"
		>
			<Avatar name={account.name} color={accountColor(account.name)} size={32} />
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="truncate text-[13.5px] font-medium">{account.name}</span>
					{account.pocs.map((p) => (
						<Chip key={p.id} tone="neutral" icon={<PocDot color={p.color} className="size-1.5" />}>
							{p.name}
						</Chip>
					))}
				</div>
				<div className="mt-1 flex flex-wrap items-center gap-1.5">
					{account.followups + account.poc_items > 0 && (
						<Chip tone="accent" icon={<Hand />}>
							{account.followups + account.poc_items} me toca
						</Chip>
					)}
					{account.waiting > 0 && (
						<Chip tone="warn" icon={<Hourglass />}>
							{account.waiting} esperando
						</Chip>
					)}
					{account.tasks > 0 && <Chip tone="neutral">{plural(account.tasks, 'tarea', 'tareas')}</Chip>}
					{account.overdue > 0 && <Chip tone="danger">{plural(account.overdue, 'atrasada', 'atrasadas')}</Chip>}
					{!openCount(account) && <span className="text-[11.5px] text-fg-3">Nada abierto</span>}
				</div>
			</div>
			<div className="hidden shrink-0 flex-col items-end gap-0.5 text-[11.5px] sm:flex">
				{account.next_due && <span className="text-fg-2">Próximo: {formatDay(account.next_due, today)}</span>}
				<span className="text-fg-3">{idleText(account.last_activity_at, today)}</span>
			</div>
			<ChevronRight className="size-4 shrink-0 text-fg-3 opacity-0 transition-opacity group-hover:opacity-100" />
		</button>
	);
}

export function AccountsView() {
	const today = useToday();
	const { data: accounts = [], isLoading } = useAccounts();
	const [q, setQ] = useState('');
	useListIds([]);
	const shown = useMemo(() => {
		const fq = fold(q.trim());
		return fq ? accounts.filter((a) => fold(a.name).includes(fq)) : accounts;
	}, [accounts, q]);
	const active = shown.filter((a) => openCount(a) > 0);
	const quiet = shown.filter((a) => openCount(a) === 0);

	return (
		<>
			<ViewHeader
				icon={<Building2 />}
				iconClass="bg-accent-soft text-accent-text"
				title="Cuentas"
				subtitle={
					isLoading ? ' ' : `${plural(accounts.length, 'cuenta', 'cuentas')} · ${accounts.filter((a) => openCount(a) > 0).length} con algo abierto`
				}
				right={
					<div className="relative">
						<Search className="pointer-events-none absolute top-2 left-2.5 size-3.5 text-fg-3" />
						<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar cuentas" className={cx(inputClass, 'w-52 pl-8')} />
					</div>
				}
			/>
			<ViewBody>
				{!isLoading && !accounts.length && (
					<EmptyState icon={<Building2 />} title="Todavía no hay cuentas">
						Las cuentas salen solas: cada vez que pones la empresa en una tarea o creas una PoC, aparece aquí con todo lo suyo.
					</EmptyState>
				)}
				{active.length > 0 && (
					<Group title="Con algo abierto" count={active.length}>
						{active.map((a) => (
							<AccountRow key={a.key} account={a} today={today} />
						))}
					</Group>
				)}
				{quiet.length > 0 && (
					<Group title="Sin nada abierto" count={quiet.length}>
						{quiet.map((a) => (
							<AccountRow key={a.key} account={a} today={today} />
						))}
					</Group>
				)}
				{accounts.length > 0 && !shown.length && <div className="px-3 py-6 text-[13px] text-fg-3">Ninguna cuenta coincide con «{q}».</div>}
			</ViewBody>
		</>
	);
}

function Tile({ icon, label, value, hint }: { icon: ReactNode; label: string; value: ReactNode; hint?: string }) {
	return (
		<div className="rounded-xl bg-hover px-3.5 py-3">
			<div className="flex items-center gap-1.5 text-[11.5px] text-fg-3 [&>svg]:size-3.5">
				{icon}
				{label}
			</div>
			<div className="mt-1 text-[22px] leading-7 font-semibold">{value}</div>
			{hint && <div className="text-[11px] text-fg-3">{hint}</div>}
		</div>
	);
}

export function AccountView({ name }: { name: string }) {
	const today = useToday();
	const { data, isError } = useAccount(name);
	useListIds((data?.open ?? []).map((i) => i.id));

	if (isError)
		return (
			<ViewBody>
				<EmptyState icon={<Building2 />} title="Esta cuenta ya no tiene nada">
					Puede que hayas cambiado el nombre de la empresa en sus tareas.
				</EmptyState>
			</ViewBody>
		);
	if (!data) return null;

	const mine = data.open.filter((i) => i.state === 'todo');
	const waiting = data.open.filter((i) => i.state === 'waiting');
	const opts = { showPoc: true, showCategory: true, sortable: false, listKey: `account-${data.key}` };

	return (
		<>
			<ViewHeader
				icon={<Avatar name={data.name} color={accountColor(data.name)} size={32} />}
				title={data.name}
				subtitle={idleText(data.last_activity_at, today)}
			/>
			<ViewBody>
				<div className="mb-5 grid grid-cols-4 gap-2.5">
					<Tile icon={<Hand />} label="Te toca" value={mine.length} />
					<Tile icon={<Hourglass />} label="Esperando" value={waiting.length} />
					<Tile icon={<Send />} label="Toques" value={data.stats.touches_30d} hint="últimos 30 días" />
					<Tile
						icon={<Timer />}
						label="Tardan en responder"
						value={data.stats.avg_response_days == null ? '—' : `${data.stats.avg_response_days.toLocaleString('es-ES')} d`}
						hint={data.stats.avg_response_days == null ? 'sin respuestas todavía' : 'de media'}
					/>
				</div>

				<Composer defaults={{ category: 'followup', company: data.name }} placeholder={`Nuevo follow-up para ${data.name}… (#tarea para una tarea)`} />

				{data.pocs.length > 0 && (
					<section className="mb-6">
						<SectionTitle>PoCs</SectionTitle>
						<div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
							{data.pocs.map((p) => (
								<PocCard key={p.id} poc={p} today={today} />
							))}
						</div>
					</section>
				)}

				{mine.length > 0 && (
					<Group title="Te toca" icon={<Hand />} count={mine.length} tone="accent">
						<TaskList items={mine} today={today} options={opts} />
					</Group>
				)}
				{waiting.length > 0 && (
					<Group title="Esperando respuesta" icon={<Hourglass />} count={waiting.length} tone="warn">
						<TaskList items={waiting} today={today} options={opts} />
					</Group>
				)}
				{!data.open.length && <div className="mb-5 px-2.5 text-[12.5px] text-fg-3">Nada abierto con esta cuenta.</div>}
				<DoneSection items={data.done} today={today} title="Completadas en los últimos 30 días" options={opts} />

				{data.contacts.length > 0 && (
					<section className="mt-8">
						<SectionTitle>Contactos</SectionTitle>
						{data.contacts.map((c) => (
							<div key={c.name} className="group flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-hover">
								<Avatar name={c.name} color={accountColor(data.name)} size={28} />
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2 text-[13px] font-medium">
										<span className="truncate">{c.name}</span>
										{c.poc && <Chip tone="neutral">Admin en {c.poc}</Chip>}
									</div>
									<div className="truncate text-[11.5px] text-fg-3">
										{[c.role, c.email, c.tasks ? plural(c.tasks, 'tarea', 'tareas') : null].filter(Boolean).join(' · ') || '—'}
									</div>
								</div>
								{c.email && (
									<button
										type="button"
										onClick={() => openExternal(`mailto:${c.email}`)}
										aria-label={`Escribir a ${c.email}`}
										className="flex size-7 items-center justify-center rounded-md text-fg-3 opacity-0 group-hover:opacity-100 hover:bg-hover hover:text-fg"
									>
										<Mail className="size-3.5" />
									</button>
								)}
							</div>
						))}
					</section>
				)}

				<section className="mt-8">
					<SectionTitle>Historial</SectionTitle>
					<Timeline entries={data.activity} today={today} showItem />
				</section>
			</ViewBody>
		</>
	);
}
