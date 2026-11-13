// Documentos de una PoC (actas, capturas, presupuestos…) o de una RFP (pliegos, anexos, la propuesta…): se añaden
// arrastrando archivos o con el botón, y se abren con su app. Viven en una carpeta por ficha junto a la base de
// datos (ver server/documents.js).

import {
	ExternalLink,
	File,
	FileArchive,
	FileImage,
	FileSpreadsheet,
	FileText,
	FolderOpen,
	Paperclip,
	Presentation,
	Search,
	Upload,
	X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { formatDay } from '../../shared/dates.js';
import { apiUrl } from '../api/client';
import { useActions, useDocuments } from '../api/hooks';
import type { PocDocument } from '../api/types';
import { isElectron, zd } from '../lib/bridge';
import { cx, plural } from '../lib/format';
import { Button, Confirm, IconButton, SectionTitle } from './ui';

const ICONS: [RegExp, ReactNode, string][] = [
	[/\.(pdf)$/i, <FileText />, 'text-danger'],
	[/\.(docx?|odt|rtf|txt|md|pages)$/i, <FileText />, 'text-accent-text'],
	[/\.(xlsx?|xlsm|csv|ods|numbers)$/i, <FileSpreadsheet />, 'text-ok'],
	[/\.(pptx?|odp|key)$/i, <Presentation />, 'text-warn'],
	[/\.(zip|rar|7z|tar|gz)$/i, <FileArchive />, 'text-fg-2'],
	[/\.(png|jpe?g|gif|webp|heic|svg)$/i, <FileImage />, 'text-teal'],
];

function DocIcon({ name }: { name: string }) {
	const hit = ICONS.find(([re]) => re.test(name));
	return <span className={cx('flex size-4 shrink-0 items-center justify-center [&>svg]:size-4', hit?.[2] ?? 'text-fg-3')}>{hit?.[1] ?? <File />}</span>;
}

export function formatBytes(n: number) {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
	return `${(n / (1024 * 1024)).toLocaleString('es-ES', { maximumFractionDigits: n < 10 * 1024 * 1024 ? 1 : 0 })} MB`;
}

const docPath = (pocId: number, name: string) => `/pocs/${pocId}/documents/${encodeURIComponent(name)}`;

function openDoc(pocId: number, name: string) {
	if (zd) zd.openDocument(pocId, name);
	else window.open(apiUrl(docPath(pocId, name)), '_blank', 'noopener');
}

function DocRow({ pocId, doc, date, today, onRemove }: { pocId: number; doc: PocDocument; date: string; today: string; onRemove: () => void }) {
	return (
		<motion.div
			layout
			initial={{ opacity: 0, y: -4 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, height: 0 }}
			onDoubleClick={() => openDoc(pocId, doc.name)}
			className="group flex cursor-default items-center gap-2.5 rounded-xl px-2.5 py-1.5 hover:bg-hover"
			title="Doble clic para abrirlo"
		>
			<DocIcon name={doc.name} />
			<span className="min-w-0 flex-1 truncate text-[13px]">{doc.name}</span>
			<span className="shrink-0 text-[11.5px] text-fg-3 tabular-nums">{formatBytes(doc.size)}</span>
			<span className="w-16 shrink-0 text-right text-[11.5px] text-fg-3">{formatDay(date.slice(0, 10), today)}</span>
			<div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
				<IconButton label="Abrir" onClick={() => openDoc(pocId, doc.name)}>
					<ExternalLink className="size-3.5" />
				</IconButton>
				{zd && (
					<IconButton label="Mostrar en Finder" onClick={() => zd!.revealDocument(pocId, doc.name)}>
						<Search className="size-3.5" />
					</IconButton>
				)}
				<IconButton label="Quitar" onClick={onRemove}>
					<X className="size-3.5" />
				</IconButton>
			</div>
		</motion.div>
	);
}

const COPY = {
	poc: {
		title: 'Documentos de la PoC',
		empty: 'Arrastra aquí PDFs, imágenes, presentaciones o cualquier archivo de la PoC, o haz clic para elegirlos.',
		drop: 'Suelta para adjuntarlos a la PoC',
		folder: 'la PoC',
	},
	rfp: {
		title: 'Documentación',
		empty: 'Arrastra aquí los pliegos, anexos y la propuesta (PDF, Word, Excel…) o haz clic para elegirlos.',
		drop: 'Suelta para añadirlos a la RFP',
		folder: 'la RFP',
	},
};

/**
 * Bloque de documentos de la ficha de una PoC o RFP: lista, zona para soltar archivos y botones. Las PoCs los
 * listan en el orden en que se adjuntaron (el último, abajo); las RFPs, por nombre (pliego, anexo 1, anexo 2…).
 */
export function Documents({ pocId, kind, today }: { pocId: number; kind: 'poc' | 'rfp'; today: string }) {
	const copy = COPY[kind];
	const { data = [], isLoading } = useDocuments(pocId);
	const byAdded = kind === 'poc';
	const docs = byAdded ? [...data].sort((x, y) => x.added_at.localeCompare(y.added_at) || x.name.localeCompare(y.name, 'es', { numeric: true })) : data;
	const a = useActions();
	const input = useRef<HTMLInputElement>(null);
	const [over, setOver] = useState(false);
	const [uploading, setUploading] = useState(0);
	const [removing, setRemoving] = useState<PocDocument | null>(null);

	const add = async (files: File[]) => {
		const list = files.filter((f) => f.size > 0 || f.type);
		if (!list.length) return;
		setUploading(list.length);
		try {
			const saved = await a.uploadDocuments(pocId, list);
			const renamed = saved.filter((d, i) => d.name !== list[i].name.normalize('NFC'));
			toast.success(saved.length === 1 ? `Añadido ${saved[0].name}` : `${plural(saved.length, 'documento añadido', 'documentos añadidos')}`, {
				description: renamed.length ? `Ya había uno con ese nombre: guardado como ${renamed.map((d) => d.name).join(', ')}` : undefined,
			});
		} catch {
			// El toast de error ya lo saca useActions.
		} finally {
			setUploading(0);
		}
	};

	const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files');
	const dropProps = {
		onDragEnter: (e: DragEvent) => {
			if (!hasFiles(e)) return;
			e.preventDefault();
			setOver(true);
		},
		onDragOver: (e: DragEvent) => {
			if (!hasFiles(e)) return;
			e.preventDefault();
			e.dataTransfer.dropEffect = 'copy';
		},
		onDragLeave: (e: DragEvent) => {
			if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
		},
		onDrop: (e: DragEvent) => {
			if (!hasFiles(e)) return;
			e.preventDefault();
			setOver(false);
			add(Array.from(e.dataTransfer.files));
		},
	};

	return (
		<div className="mt-6" {...dropProps}>
			<SectionTitle
				right={
					<div className="flex items-center gap-1">
						{isElectron && (
							<Button size="xs" variant="ghost" icon={<FolderOpen className="size-3" />} onClick={() => zd!.openDocumentsFolder(pocId)}>
								Abrir carpeta
							</Button>
						)}
						<Button size="xs" icon={<Upload className="size-3" />} onClick={() => input.current?.click()} disabled={uploading > 0}>
							Añadir
						</Button>
					</div>
				}
			>
				{copy.title}{docs.length > 0 && <span className="ml-1.5 font-normal text-fg-3">{docs.length}</span>}
			</SectionTitle>
			<input
				ref={input}
				type="file"
				multiple
				className="hidden"
				onChange={(e) => {
					add(Array.from(e.target.files ?? []));
					e.target.value = '';
				}}
			/>
			<div className={cx('rounded-xl transition-colors', over && 'bg-accent-soft ring-2 ring-accent/60')}>
				{docs.length > 0 ? (
					<div className="flex flex-col py-0.5">
						<AnimatePresence initial={false}>
							{docs.map((d) => (
								<DocRow
									key={d.name}
									pocId={pocId}
									doc={d}
									date={byAdded ? d.added_at : d.modified_at}
									today={today}
									onRemove={() => setRemoving(d)}
								/>
							))}
						</AnimatePresence>
					</div>
				) : (
					!isLoading && (
						<button
							type="button"
							onClick={() => input.current?.click()}
							className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-line-strong px-3.5 py-3 text-left text-[12.5px] text-fg-3 hover:text-fg-2"
						>
							<Paperclip className="size-4 shrink-0" />
							{copy.empty}
						</button>
					)
				)}
				{(uploading > 0 || over) && (
					<div className="px-2.5 py-1.5 text-[12px] text-accent-text">
						{uploading > 0 ? `Guardando ${plural(uploading, 'documento', 'documentos')}…` : copy.drop}
					</div>
				)}
			</div>
			<Confirm
				open={!!removing}
				onOpenChange={(open) => !open && setRemoving(null)}
				title={`¿Quitar ${removing?.name ?? ''}?`}
				description={
					isElectron
						? 'Se mueve a la Papelera de macOS: si lo necesitas, lo recuperas desde allí.'
						: `Se borra de la carpeta de ${copy.folder}.`
				}
				confirm="Quitar"
				onConfirm={async () => {
					if (!removing) return;
					await a.deleteDocument(pocId, removing.name).catch(() => null);
				}}
			/>
		</div>
	);
}
