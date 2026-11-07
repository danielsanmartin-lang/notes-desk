import { Bell, Check, Database, FlaskConical, FolderOpen, Keyboard, Link2, Monitor, Moon, Palette, Power, ScrollText, Send, Settings, Sun } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { CSSProperties, ReactNode } from 'react';
import { THEMES } from '../../shared/themes.js';
import { useActions, useHubspotStatus, useMeta, useSettings } from '../api/hooks';
import { Chip } from '../components/bits';
import { AutoTextarea, Button, inputClass, useDraft } from '../components/ui';
import { isElectron, zd } from '../lib/bridge';
import { cx } from '../lib/format';
import { useMode, type Mode } from '../lib/theme';
import type { Appearance } from '../api/types';
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

const APPEARANCE_OPTIONS: { value: Appearance; label: string; icon: ReactNode }[] = [
	{ value: 'system', label: 'Sistema', icon: <Monitor /> },
	{ value: 'light', label: 'Claro', icon: <Sun /> },
	{ value: 'dark', label: 'Oscuro', icon: <Moon /> },
];

/** Miniatura de un tema en el modo que se ve ahora: barra lateral, una tarea marcada y un botón. */
function ThemePreview({ theme, mode }: { theme: (typeof THEMES)[number]; mode: Mode }) {
	const v = theme[mode] as Record<string, string>;
	return (
		<div className="flex h-[68px] overflow-hidden rounded-lg border" style={{ background: v['--bg'], borderColor: v['--line-strong'] } as CSSProperties}>
			<div className="flex w-[30%] flex-col gap-1.5 p-2" style={{ background: v['--sidebar'] }}>
				<span className="h-1.5 w-4/5 rounded-full" style={{ background: v['--accent-soft'] }} />
				<span className="h-1.5 w-3/5 rounded-full" style={{ background: v['--line-strong'] }} />
				<span className="h-1.5 w-2/3 rounded-full" style={{ background: v['--line-strong'] }} />
			</div>
			<div className="flex flex-1 flex-col gap-2 p-2.5">
				<div className="flex items-center gap-1.5">
					<span className="flex size-2.5 items-center justify-center rounded-full" style={{ background: v['--accent'] }} />
					<span className="h-1.5 flex-1 rounded-full" style={{ background: v['--fg'], opacity: 0.75 }} />
				</div>
				<div className="flex items-center gap-1.5">
					<span className="size-2.5 rounded-full border" style={{ borderColor: v['--fg-3'] }} />
					<span className="h-1.5 w-2/3 rounded-full" style={{ background: v['--fg-3'] }} />
				</div>
				<span className="mt-auto h-3 w-9 self-end rounded-[4px]" style={{ background: v['--accent'] }} />
			</div>
		</div>
	);
}

function AppearanceCard({ appearance, theme, onChange }: { appearance: Appearance; theme: string; onChange: (patch: { appearance?: Appearance; theme?: string }) => void }) {
	const mode = useMode(appearance);
	return (
		<Card icon={<Palette />} title="Apariencia" description="Modo claro u oscuro y el tema de colores de toda la app.">
			<div className="inline-flex rounded-lg bg-hover p-0.5" role="radiogroup" aria-label="Modo">
				{APPEARANCE_OPTIONS.map((o) => (
					<button
						key={o.value}
						type="button"
						role="radio"
						aria-checked={appearance === o.value}
						onClick={() => onChange({ appearance: o.value })}
						className={cx(
							'flex h-7 items-center gap-1.5 rounded-md px-3 text-[12.5px] font-medium transition-colors [&>svg]:size-3.5',
							appearance === o.value ? 'bg-raised text-fg shadow-card' : 'text-fg-2 hover:text-fg',
						)}
					>
						{o.icon}
						{o.label}
					</button>
				))}
			</div>
			{appearance === 'system' && <p className="mt-1.5 text-[11.5px] text-fg-3">Sigue el modo de macOS: ahora, {mode === 'dark' ? 'oscuro' : 'claro'}.</p>}
			<div className="mt-4 grid grid-cols-3 gap-3" role="radiogroup" aria-label="Tema">
				{THEMES.map((t) => {
					const on = t.id === theme;
					return (
						<button
							key={t.id}
							type="button"
							role="radio"
							aria-checked={on}
							onClick={() => onChange({ theme: t.id })}
							className={cx('group rounded-xl p-1.5 text-left transition-colors', on ? 'bg-accent-soft ring-2 ring-accent' : 'hover:bg-hover')}
						>
							<ThemePreview theme={t} mode={mode} />
							<div className="mt-1.5 flex items-center gap-1 px-0.5">
								<span className="text-[12.5px] font-medium">{t.name}</span>
								{on && <Check className="size-3.5 text-accent-text" />}
							</div>
							<div className="px-0.5 text-[11px] text-fg-3">{t.hint}</div>
						</button>
					);
				})}
			</div>
		</Card>
	);
}

export function SettingsView() {
	const { data: s } = useSettings();
	const { data: meta } = useMeta();
	const { data: hs } = useHubspotStatus();
	const a = useActions();
	const qc = useQueryClient();
	const template = useDraft(s?.poc_template, (v) => a.saveSettings({ poc_template: v }));
	const rfpTemplate = useDraft(s?.rfp_template, (v) => a.saveSettings({ rfp_template: v }));
	useListIds([]);
	if (!s) return null;

	return (
		<>
			<ViewHeader icon={<Settings />} iconClass="bg-hover text-fg-2" title="Ajustes" />
			<ViewBody className="max-w-[680px]">
				<AppearanceCard
					appearance={s.appearance}
					theme={s.theme}
					onChange={(patch) => {
						// Se ve al instante; el servidor lo guarda detrás.
						qc.setQueryData(['settings'], { ...s, ...patch });
						a.saveSettings(patch);
					}}
				/>

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

				<Card icon={<Power />} title="Inicio" description="Notes Desk se queda en la barra de menús aunque cierres la ventana.">
					<label className="flex items-center gap-2 text-[13px]">
						<input
							type="checkbox"
							checked={s.open_at_login}
							onChange={(e) => a.saveSettings({ open_at_login: e.target.checked })}
							className="size-4 accent-[var(--accent)]"
						/>
						Abrir Notes Desk al iniciar sesión
					</label>
				</Card>

				<Card icon={<FlaskConical />} title="Tareas de PoC" description="Una por línea. Salen como sugerencias en cada PoC: haces clic en una y pasa a ser una tarea de esa PoC.">
					<AutoTextarea {...template} className="min-h-[90px] rounded-xl bg-hover px-3 py-2.5 text-[13px] leading-6" />
				</Card>

				<Card icon={<ScrollText />} title="Tareas de RFP" description="Lo mismo para las RFPs: una por línea, y salen como sugerencias en cada RFP.">
					<AutoTextarea {...rfpTemplate} className="min-h-[90px] rounded-xl bg-hover px-3 py-2.5 text-[13px] leading-6" />
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
					{meta?.version && <div className="mt-3 text-[11px] text-fg-3">Notes Desk {meta.version}</div>}
				</Card>
			</ViewBody>
		</>
	);
}
