// Editor de «Tareas de PoC» / «Tareas de RFP» en Ajustes: una fila por tarea, con editar, borrar, añadir y un botón de
// guardar. Se sigue guardando como texto con una tarea por línea, que es lo que leen las PoCs y el servidor.

import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from '../lib/format';
import { Button } from './ui';

type Row = { id: number; text: string };

const parse = (v: string | null | undefined) =>
	(v ?? '')
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean);

let seq = 0;
const toRows = (lines: string[]): Row[] => lines.map((text) => ({ id: ++seq, text }));

function RowIcon({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: ReactNode }) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			// Sin esto el clic quita el foco al campo antes de llegar aquí.
			onMouseDown={(e) => e.preventDefault()}
			onClick={onClick}
			className={cx(
				'inline-flex size-6 shrink-0 items-center justify-center rounded-md text-fg-3 transition-colors [&>svg]:size-3.5',
				danger ? 'hover:bg-danger-soft hover:text-danger' : 'hover:bg-active hover:text-fg',
			)}
		>
			{children}
		</button>
	);
}

const fieldClass =
	'h-7 min-w-0 flex-1 rounded-md bg-raised px-2 text-[13px] text-fg outline-none ring-2 ring-accent/40 placeholder:text-fg-3';

export function TaskTemplateEditor({
	value,
	onSave,
	addLabel = 'Añadir tarea',
}: {
	value: string | null | undefined;
	onSave: (v: string) => Promise<unknown>;
	addLabel?: string;
}) {
	const savedKey = parse(value).join('\n');
	const [rows, setRows] = useState<Row[]>(() => toRows(parse(value)));
	const [edit, setEdit] = useState<{ id: number; text: string } | null>(null);
	const [adding, setAdding] = useState<string | null>(null); // null = cerrado
	const [saving, setSaving] = useState(false);
	const [justSaved, setJustSaved] = useState(false);

	// Si el valor cambia fuera (otra ventana, el servidor) y aquí no había cambios, se recarga.
	const prevSaved = useRef(savedKey);
	useEffect(() => {
		const was = prevSaved.current;
		prevSaved.current = savedKey;
		setRows((prev) => (prev.map((r) => r.text).join('\n') === was ? toRows(parse(savedKey)) : prev));
	}, [savedKey]);

	useEffect(() => {
		if (!justSaved) return;
		const t = setTimeout(() => setJustSaved(false), 2000);
		return () => clearTimeout(t);
	}, [justSaved]);

	// Lo que se guardaría ahora mismo, contando lo que está a medio escribir.
	const effective: Row[] = [
		...rows.flatMap((r) => (edit?.id === r.id ? (edit.text.trim() ? [{ ...r, text: edit.text.trim() }] : []) : [r])),
		...(adding?.trim() ? [{ id: -1, text: adding.trim() }] : []),
	];
	const dirty = effective.map((r) => r.text).join('\n') !== savedKey;

	// Los blur pueden llegar cuando el campo ya se ha cerrado (Esc, Guardar): se lee siempre el último estado.
	const editRef = useRef(edit);
	editRef.current = edit;
	const addingRef = useRef(adding);
	addingRef.current = adding;

	const commitEdit = () => {
		const cur = editRef.current;
		if (!cur) return;
		editRef.current = null;
		const text = cur.text.trim();
		setRows((rs) => (text ? rs.map((r) => (r.id === cur.id ? { ...r, text } : r)) : rs.filter((r) => r.id !== cur.id)));
		setEdit(null);
	};

	const startEdit = (r: Row) => {
		commitEdit();
		setEdit({ id: r.id, text: r.text });
	};

	const commitAdd = (keepOpen: boolean) => {
		const cur = addingRef.current;
		if (cur === null) return;
		const text = cur.trim();
		if (text) setRows((rs) => [...rs, { id: ++seq, text }]);
		addingRef.current = keepOpen ? '' : null;
		setAdding(addingRef.current);
	};

	const cancelEdit = () => {
		editRef.current = null;
		setEdit(null);
	};

	const cancelAdd = () => {
		addingRef.current = null;
		setAdding(null);
	};

	const remove = (id: number) => {
		setRows((rs) => rs.filter((r) => r.id !== id));
		if (editRef.current?.id === id) cancelEdit();
	};

	const discard = () => {
		setRows(toRows(parse(savedKey)));
		cancelEdit();
		cancelAdd();
	};

	const save = async () => {
		const next = effective.map((r) => (r.id === -1 ? { ...r, id: ++seq } : r));
		setRows(next);
		cancelEdit();
		cancelAdd();
		setSaving(true);
		try {
			await onSave(next.map((r) => r.text).join('\n'));
			setJustSaved(true);
		} finally {
			setSaving(false);
		}
	};

	const editKeys = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
			e.preventDefault();
			commitEdit();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			cancelEdit();
		}
	};

	const addKeys = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
			e.preventDefault();
			commitAdd(true);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			cancelAdd();
		}
	};

	return (
		<div className="-ml-2">
			<ul>
				<AnimatePresence initial={false}>
					{rows.map((r) => {
						const editing = edit?.id === r.id;
						return (
							<motion.li
								key={r.id}
								layout="position"
								initial={{ opacity: 0, height: 0 }}
								animate={{ opacity: 1, height: 'auto' }}
								exit={{ opacity: 0, height: 0 }}
								transition={{ duration: 0.16 }}
								className="overflow-hidden"
							>
								<div className={cx('group flex h-9 items-center gap-2 rounded-lg px-2', !editing && 'hover:bg-hover')}>
									<span className="size-1.5 shrink-0 rounded-full bg-fg-3/60" />
									{editing ? (
										<>
											<input
												autoFocus
												value={edit.text}
												onChange={(e) => setEdit({ id: r.id, text: e.target.value })}
												onKeyDown={editKeys}
												onBlur={commitEdit}
												aria-label="Editar tarea"
												className={fieldClass}
											/>
											<RowIcon label="Aceptar" onClick={commitEdit}>
												<Check />
											</RowIcon>
											<RowIcon label="Cancelar" onClick={cancelEdit}>
												<X />
											</RowIcon>
										</>
									) : (
										<>
											<span
												className="min-w-0 flex-1 truncate text-[13px] text-fg"
												onDoubleClick={() => startEdit(r)}
												title={r.text}
											>
												{r.text}
											</span>
											<div className="flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
												<RowIcon label="Editar" onClick={() => startEdit(r)}>
													<Pencil />
												</RowIcon>
												<RowIcon label="Borrar" danger onClick={() => remove(r.id)}>
													<Trash2 />
												</RowIcon>
											</div>
										</>
									)}
								</div>
							</motion.li>
						);
					})}
				</AnimatePresence>
			</ul>

			{!rows.length && adding === null && (
				<p className="px-2 py-2 text-[12.5px] text-fg-3">Sin tareas: no saldrán sugerencias.</p>
			)}

			{adding !== null ? (
				<div className="flex h-9 items-center gap-2 px-2">
					<Plus className="size-3.5 shrink-0 text-accent-text" />
					<input
						autoFocus
						value={adding}
						placeholder="Nueva tarea…"
						onChange={(e) => setAdding(e.target.value)}
						onKeyDown={addKeys}
						onBlur={() => commitAdd(false)}
						aria-label="Nueva tarea"
						className={fieldClass}
					/>
					<RowIcon label="Añadir" onClick={() => commitAdd(true)}>
						<Check />
					</RowIcon>
					<RowIcon label="Cancelar" onClick={cancelAdd}>
						<X />
					</RowIcon>
				</div>
			) : (
				<button
					type="button"
					onClick={() => {
						commitEdit();
						setAdding('');
					}}
					className="flex h-9 items-center gap-2 rounded-lg px-2 text-[13px] text-fg-3 transition-colors hover:bg-hover hover:text-fg [&>svg]:size-3.5"
				>
					<Plus />
					{addLabel}
				</button>
			)}

			<div className="mt-3 ml-2 flex items-center gap-2 border-t border-line pt-3">
				<span className="text-[11.5px] text-fg-3">
					{dirty ? (
						'Cambios sin guardar'
					) : justSaved ? (
						<span className="inline-flex items-center gap-1 text-accent-text">
							<Check className="size-3.5" />
							Guardado
						</span>
					) : null}
				</span>
				<div className="ml-auto flex gap-2">
					{dirty && (
						<Button variant="ghost" onMouseDown={(e) => e.preventDefault()} onClick={discard} disabled={saving}>
							Descartar
						</Button>
					)}
					<Button variant="primary" onMouseDown={(e) => e.preventDefault()} onClick={save} disabled={!dirty || saving}>
						{saving ? 'Guardando…' : 'Guardar'}
					</Button>
				</div>
			</div>
		</div>
	);
}
