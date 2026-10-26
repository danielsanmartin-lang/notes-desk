import { Bell, Database, FlaskConical, FolderOpen, Keyboard, Link2, Power, Send, Settings } from 'lucide-react';
import type { ReactNode } from 'react';
import { useActions, useHubspotStatus, useMeta, useSettings } from '../api/hooks';
import { Chip } from '../components/bits';
import { AutoTextarea, Button, inputClass, useDraft } from '../components/ui';
import { isElectron, zd } from '../lib/bridge';
import { cx } from '../lib/format';
import { useListIds, ViewBody, ViewHeader } from './common';

const SHORTCUTS = [
	{ value: 'Alt+Space', label: '⌥ Espacio' },
	{ value: 'Control+Alt+Space', label: '⌃ ⌥ Espacio' },
	{ value: 'Command+Shift+Space', label: '⌘ ⇧ Espacio' },
	{ value: 'Command+Alt+N', label: '⌘ ⌥ N' },
	{ value: '', label: 'Desactivado' },
];

function Card({ icon, title, description, children }: { icon: ReactNode; title: string; description?: string; children: ReactNode }) {
	return (
		<section className="mb-4 rounded-2xl border border-line bg-raised p-5 shadow-card">
			<div className="mb-3 flex items-start gap-3">
				<span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-text [&>svg]:size-4">{icon}</span>
				<div>
					<h2 className="font-display text-[14.5px] font-semibold">{title}</h2>
					{description && <p className="mt-0.5 text-[12.5px] text-fg-2">{description}</p>}
				</div>
			</div>
			<div className="pl-11">{children}</div>
		</section>
	);
}

export function SettingsView() {
	const { data: s } = useSettings();
	const { data: meta } = useMeta();
	const { data: hs } = useHubspotStatus();
	const a = useActions();
	const template = useDraft(s?.poc_template, (v) => a.saveSettings({ poc_template: v }));
	useListIds([]);
	if (!s) return null;

	return (
		<>
			<ViewHeader icon={<Settings />} iconClass="bg-hover text-fg-2" title="Ajustes" />
			<ViewBody className="max-w-[680px]">
				<Card icon={<Send />} title="Follow-ups" description="Cuando registras un toque, el siguiente follow-up se programa solo (nunca en fin de semana).">
					<div className="flex items-center gap-2 text-[13px]">
						Volver a perseguir a los
						<select
							value={s.fup_days}
							onChange={(e) => a.saveSettings({ fup_days: Number(e.target.value) })}
							className={cx(inputClass, 'w-auto')}
						>
							{[1, 2, 3, 4, 5, 7, 10, 14].map((n) => (
								<option key={n} value={n}>
									{n} {n === 1 ? 'día' : 'días'}
								</option>
							))}
						</select>
						sin respuesta
					</div>
				</Card>

				<Card icon={<Bell />} title="Avisos" description="Un resumen con lo de hoy y los follow-ups que toca perseguir, más un aviso para cada tarea con recordatorio.">
					<div className="flex items-center gap-2 text-[13px]">
						Resumen diario a las
						<input type="time" value={s.digest_time} onChange={(e) => e.target.value && a.saveSettings({ digest_time: e.target.value })} className={cx(inputClass, 'w-28')} />
					</div>
					{!isElectron && <p className="mt-2 text-[11.5px] text-fg-3">Los avisos solo salen desde la app de escritorio.</p>}
				</Card>

				<Card icon={<Keyboard />} title="Captura rápida" description="Abre una ventanita para apuntar una tarea desde cualquier app, sin cambiar de ventana.">
					<div className="flex flex-wrap gap-1.5">
						{SHORTCUTS.map((o) => (
							<button
								key={o.value || 'off'}
								type="button"
								onClick={() => a.saveSettings({ shortcut: o.value })}
								className={cx(
									'h-8 rounded-lg px-3 text-[12.5px] font-medium transition-colors',
									s.shortcut === o.value ? 'bg-accent text-accent-fg' : 'bg-hover text-fg-2 hover:text-fg',
								)}
							>
								{o.label}
							</button>
						))}
					</div>
				</Card>

				<Card icon={<Power />} title="Inicio" description="Zepo Desk se queda en la barra de menús aunque cierres la ventana.">
					<label className="flex items-center gap-2 text-[13px]">
						<input
							type="checkbox"
							checked={s.open_at_login}
							onChange={(e) => a.saveSettings({ open_at_login: e.target.checked })}
							className="size-4 accent-[var(--accent)]"
						/>
						Abrir Zepo Desk al iniciar sesión
					</label>
				</Card>

				<Card icon={<FlaskConical />} title="Plantilla de PoC" description="Una tarea por línea. Se ofrece al crear una PoC nueva.">
					<AutoTextarea {...template} className="min-h-[90px] rounded-xl bg-hover px-3 py-2.5 text-[13px] leading-6" />
				</Card>

				<Card icon={<Link2 />} title="HubSpot" description="Solo lectura: la app nunca escribe en HubSpot.">
					<div className="flex items-center gap-2 text-[13px]">
						{hs?.connected ? <Chip tone="ok">Conectado</Chip> : <Chip tone="neutral">Sin token</Chip>}
						<span className="text-fg-2">
							{hs?.connected
								? 'Las PoCs enlazadas pueden sincronizar etapa, importe y fecha de cierre.'
								: 'Añade HUBSPOT_TOKEN=… a ~/.hermes/.env (el mismo que usa hubspot_fechas.py) y reinicia la app.'}
						</span>
					</div>
				</Card>

				<Card icon={<Database />} title="Datos" description="Todo se guarda en una base de datos SQLite local, con una copia de seguridad diaria (se guardan 14).">
					<div className="space-y-1.5 text-[12px]">
						<div className="selectable truncate font-mono text-fg-2">{meta?.dbPath}</div>
						{meta?.backupsDir && <div className="selectable truncate font-mono text-fg-3">{meta.backupsDir}</div>}
					</div>
					{zd && meta?.dbPath && (
						<Button className="mt-3" icon={<FolderOpen className="size-3.5" />} onClick={() => zd!.showInFolder(meta.dbPath!)}>
							Mostrar en Finder
						</Button>
					)}
					{meta?.version && <div className="mt-3 text-[11px] text-fg-3">Zepo Desk {meta.version}</div>}
				</Card>
			</ViewBody>
		</>
	);
}
