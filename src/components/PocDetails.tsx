// Ficha de la PoC: owner, fecha de inicio y admins del cliente (los que usarán la plataforma).

import { Banknote, CalendarDays, Clock, Copy, Handshake, Mail, Plus, UserRound, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { formatDay } from '../../shared/dates.js';
import { useActions } from '../api/hooks';
import type { ContactKind, Poc, PocAdmin } from '../api/types';
import { openExternal } from '../lib/bridge';
import { cx, initials, plural } from '../lib/format';
import { formatAmount, openSince, pocAmount } from '../lib/pocs';
import { Chip } from './bits';
import { DatePicker } from './DatePicker';
import { Button, IconButton, inputClass, SectionTitle, useDraft } from './ui';

/** Chip con los días que lleva abierta la PoC (o cuánto falta para que empiece). */
export function OpenDays({ poc, today }: { poc: Poc; today: string }) {
	const o = openSince(poc, today);
	return (
		<Chip tone={o.future ? 'neutral' : 'accent'} icon={<Clock />} title={`${poc.start_date ? 'Desde la fecha de inicio' : 'Desde que se creó (no tiene fecha de inicio)'}${poc.status === 'paused' ? '. Sigue contando aunque esté en pausa.' : ''}`}>
			{o.label}
		</Chip>
	);
}

export function Avatar({ name, color, size = 26 }: { name: string; color?: string | null; size?: number }) {
	return (
		<span
			className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
			style={{ width: size, height: size, fontSize: size * 0.4, background: color ?? 'var(--accent)' }}
			aria-hidden="true"
		>
			{initials(name) || '?'}
		</span>
	);
}

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
	return (
		<div className="min-w-0 rounded-xl bg-hover px-3 py-2.5">
			<div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-fg-3 [&>svg]:size-3.5">
				{icon}
				{label}
			</div>
			{children}
		</div>
	);
}

export function PocFacts({ poc, today }: { poc: Poc; today: string }) {
	const a = useActions();
	const owner = useDraft(poc.owner, (v) => a.updatePoc(poc.id, { owner: v }));
	const partner = useDraft(poc.partner, (v) => a.updatePoc(poc.id, { partner: v }));
	const amount = pocAmount(poc);
	const manualAmount = useDraft(poc.amount == null ? '' : poc.amount.toLocaleString('es-ES'), (v) =>
		a.updatePoc(poc.id, { amount: v as unknown as number, currency: poc.currency ?? 'EUR' }),
	);

	return (
		<div className="mb-4 grid grid-cols-4 gap-2.5">
			<Fact icon={<UserRound />} label="Owner">
				<div className="flex items-center gap-2">
					{poc.owner && <Avatar name={poc.owner} color={poc.color} size={22} />}
					<input
						{...owner}
						list="zd-owners"
						placeholder="¿Quién la lleva?"
						onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
						className="h-6 min-w-0 flex-1 bg-transparent text-[13px] font-medium outline-none placeholder:font-normal placeholder:text-fg-3"
					/>
				</div>
			</Fact>
			<Fact icon={<CalendarDays />} label="Fecha de inicio">
				<DatePicker
					value={poc.start_date}
					onChange={(v) => a.updatePoc(poc.id, { start_date: v })}
					trigger={
						<button type="button" className="flex h-6 w-full items-center gap-2 text-left">
							<span className={cx('text-[13px] whitespace-nowrap', poc.start_date ? 'font-medium' : 'text-fg-3')}>
								{poc.start_date ? formatDay(poc.start_date, today) : 'Sin fecha'}
							</span>
						</button>
					}
				/>
			</Fact>
			<Fact icon={<Banknote />} label="Importe">
				{amount?.source === 'hubspot' ? (
					<div className="flex h-6 items-baseline gap-1.5" title="Viene del deal de HubSpot">
						<span className="text-[13px] font-semibold">{formatAmount(amount)}</span>
						<span className="text-[11px] text-fg-3">de HubSpot</span>
					</div>
				) : (
					<div className="flex h-6 items-center gap-1">
						<input
							{...manualAmount}
							inputMode="decimal"
							placeholder="Sin importe"
							onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
							className="h-6 min-w-0 flex-1 bg-transparent text-[13px] font-semibold outline-none placeholder:font-normal placeholder:text-fg-3"
						/>
						<select
							value={poc.currency ?? 'EUR'}
							onChange={(e) => a.updatePoc(poc.id, { currency: e.target.value })}
							className="h-6 rounded bg-transparent text-[12px] text-fg-2 outline-none hover:bg-hover"
							aria-label="Moneda"
						>
							<option value="EUR">€</option>
							<option value="USD">US$</option>
						</select>
					</div>
				)}
			</Fact>
			<Fact icon={<Handshake />} label="Partner">
				<input
					{...partner}
					list="zd-partners"
					placeholder="Sin partner"
					onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
					className="h-6 w-full min-w-0 bg-transparent text-[13px] font-medium outline-none placeholder:font-normal placeholder:text-fg-3"
				/>
			</Fact>
		</div>
	);
}

function AdminRow({ admin, color }: { admin: PocAdmin; color: string | null }) {
	const a = useActions();
	const name = useDraft(admin.name, (v) => v && a.updateAdmin(admin.id, { name: v }));
	const role = useDraft(admin.role, (v) => a.updateAdmin(admin.id, { role: v }));
	const email = useDraft(admin.email, (v) => a.updateAdmin(admin.id, { email: v }));
	const blurOnEnter = (e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && e.currentTarget.blur();
	const field = 'h-6 min-w-0 rounded-md bg-transparent px-1 outline-none hover:bg-hover focus:bg-hover';

	return (
		<motion.div
			layout
			initial={{ opacity: 0, y: -4 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, height: 0 }}
			className="group flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-hover"
		>
			<Avatar name={admin.name} color={color} size={30} />
			<div className="grid min-w-0 flex-1 grid-cols-[1.5fr_1fr_1.3fr] items-center gap-2">
				<input {...name} onKeyDown={blurOnEnter} className={cx(field, 'text-[13px] font-medium')} />
				<input {...role} onKeyDown={blurOnEnter} placeholder="Cargo" className={cx(field, 'text-[12.5px] text-fg-2 placeholder:text-fg-3')} />
				<input {...email} onKeyDown={blurOnEnter} placeholder="email" className={cx(field, 'text-[12.5px] text-fg-2 placeholder:text-fg-3')} />
			</div>
			<div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
				{admin.email && (
					<IconButton label={`Escribir a ${admin.email}`} onClick={() => openExternal(`mailto:${admin.email}`)}>
						<Mail className="size-3.5" />
					</IconButton>
				)}
				<IconButton
					label="Quitar"
					onClick={async () => {
						await a.deleteAdmin(admin.id);
						toast('Contacto quitado', {
							description: admin.name,
							action: { label: 'Deshacer', onClick: () => a.addAdmin(admin.poc_id, admin) },
						});
					}}
				>
					<X className="size-3.5" />
				</IconButton>
			</div>
		</motion.div>
	);
}

const PEOPLE: Record<ContactKind, { title: (p: Poc) => string; hint: (p: Poc) => string; noun: string }> = {
	main: {
		title: () => 'Contacto principal',
		hint: () => 'La persona del cliente con la que llevas la PoC.',
		noun: 'contacto',
	},
	admin: {
		title: () => 'Admins del cliente',
		hint: () => 'Quienes van a usar la plataforma durante la PoC.',
		noun: 'admin',
	},
	partner: {
		title: (p) => `Contacto del partner · ${p.partner}`,
		hint: (p) => `Con quién hablas en ${p.partner}.`,
		noun: 'contacto',
	},
};

/** Una lista de personas de la PoC (contacto principal, admins o contacto del partner), editable en línea. */
export function PocPeople({ poc, people, kind }: { poc: Poc; people: PocAdmin[]; kind: ContactKind }) {
	const a = useActions();
	const [form, setForm] = useState({ name: '', role: '', email: '' });
	const list = people.filter((x) => x.kind === kind);
	const emails = list.map((x) => x.email).filter(Boolean) as string[];
	const meta = PEOPLE[kind];

	const add = async () => {
		if (!form.name.trim()) return;
		await a.addAdmin(poc.id, { ...form, kind });
		setForm({ name: '', role: '', email: '' });
	};

	const copyEmails = async () => {
		await navigator.clipboard.writeText(emails.join(', '));
		toast.success(plural(emails.length, 'email copiado', 'emails copiados'));
	};

	const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
	const onKey = (e: KeyboardEvent) => e.key === 'Enter' && add();

	return (
		<div className="mt-8">
			<SectionTitle
				right={
					emails.length > 0 && (
						<Button size="xs" variant="ghost" icon={<Copy className="size-3" />} onClick={copyEmails}>
							Copiar emails
						</Button>
					)
				}
			>
				{meta.title(poc)}
			</SectionTitle>
			<p className="mb-2 text-[12px] text-fg-3">{meta.hint(poc)}</p>
			<div className="flex flex-col">
				<AnimatePresence initial={false}>
					{list.map((person) => (
						<AdminRow key={person.id} admin={person} color={poc.color} />
					))}
				</AnimatePresence>
			</div>
			<div className="mt-2 flex items-center gap-2">
				<input value={form.name} onChange={set('name')} onKeyDown={onKey} placeholder="Nombre" className={cx(inputClass, 'flex-[1.5]')} />
				<input value={form.role} onChange={set('role')} onKeyDown={onKey} placeholder="Cargo" className={cx(inputClass, 'flex-1')} />
				<input
					value={form.email}
					onChange={set('email')}
					onKeyDown={onKey}
					placeholder={kind === 'partner' ? 'email@partner.com' : 'email@cliente.com'}
					className={cx(inputClass, 'flex-[1.3]')}
				/>
				<Button onClick={add} disabled={!form.name.trim()} icon={<Plus className="size-3.5" />}>
					Añadir
				</Button>
			</div>
		</div>
	);
}
