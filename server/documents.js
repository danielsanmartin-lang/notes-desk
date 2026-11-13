// Documentos de las PoCs y las RFPs (pliegos, propuestas, capturas…): una carpeta por ficha junto a la base de
// datos (poc-12, rfp-7). La carpeta manda: no hay tabla, así que lo que se suelte en ella desde Finder también
// aparece en la app.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

const MAX_NAME = 180;

/** Nombre de archivo seguro: sin rutas, sin caracteres de control ni los que macOS no admite. */
export function safeFileName(name) {
	const base = String(name ?? '')
		.normalize('NFC')
		.split(/[/\\]/)
		.pop()
		.replace(/[\u0000-\u001f\u007f:]/g, '')
		.trim();
	if (!base || base === '.' || base === '..' || base.startsWith('.')) return null;
	if (base.length <= MAX_NAME) return base;
	const ext = path.extname(base).slice(0, 16);
	return base.slice(0, MAX_NAME - ext.length) + ext;
}

/**
 * @param {string} rootDir carpeta raíz de los documentos (…/Notes Desk/documentos)
 * @param {{ trash?: (file: string) => Promise<void>, kindOf?: (pocId: number) => 'poc' | 'rfp' }} [opts]
 *   trash: cómo quitar un archivo (en la app, a la Papelera) · kindOf: si la ficha es PoC o RFP (da nombre a su carpeta)
 */
export function createDocuments(rootDir, { trash, kindOf = () => 'rfp' } = {}) {
	const remove = trash ?? ((file) => fs.promises.rm(file, { recursive: true, force: true }));

	/** Carpeta de la ficha. `kind` se pasa cuando la ficha ya no está en la base (al borrarla). */
	const folder = (pocId, kind) => {
		const n = Number(pocId);
		if (!Number.isInteger(n) || n <= 0 || String(pocId) !== String(n)) throw Object.assign(new Error('Ficha no válida'), { status: 400 });
		const k = kind ?? kindOf(n);
		if (k !== 'poc' && k !== 'rfp') throw Object.assign(new Error('Ficha no válida'), { status: 400 });
		return path.join(rootDir, `${k}-${n}`);
	};

	/** Ruta de un documento existente de la ficha, o error si el nombre se sale de su carpeta o no existe. */
	function pathOf(pocId, name) {
		const dir = folder(pocId);
		const clean = safeFileName(name);
		if (!clean || clean !== String(name).normalize('NFC')) throw Object.assign(new Error('Nombre de documento no válido'), { status: 400 });
		const file = path.join(dir, clean);
		if (path.dirname(file) !== dir) throw Object.assign(new Error('Nombre de documento no válido'), { status: 400 });
		if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw Object.assign(new Error('El documento no existe'), { status: 404 });
		return file;
	}

	/** added_at: cuándo llegó a la carpeta (fecha de creación del archivo; si el sistema no la da, la de modificación). */
	const describe = (name, st) => ({
		name: name.normalize('NFC'),
		size: st.size,
		modified_at: st.mtime.toISOString(),
		added_at: (st.birthtimeMs > 0 ? st.birthtime : st.mtime).toISOString(),
	});

	function list(pocId) {
		const dir = folder(pocId);
		if (!fs.existsSync(dir)) return [];
		return fs
			.readdirSync(dir, { withFileTypes: true })
			.filter((e) => e.isFile() && !e.name.startsWith('.'))
			.map((e) => {
				return describe(e.name, fs.statSync(path.join(dir, e.name)));
			})
			.sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
	}

	/** «pliego.pdf» → «pliego (2).pdf» si ya existe. */
	function freeName(dir, name) {
		if (!fs.existsSync(path.join(dir, name))) return name;
		const ext = path.extname(name);
		const stem = name.slice(0, name.length - ext.length);
		for (let i = 2; ; i++) {
			const candidate = `${stem} (${i})${ext}`;
			if (!fs.existsSync(path.join(dir, candidate))) return candidate;
		}
	}

	/** Guarda lo que llega por `stream` como un documento nuevo de la ficha. Escribe a un temporal y renombra. */
	async function save(pocId, name, stream) {
		const clean = safeFileName(name);
		if (!clean) throw Object.assign(new Error('Nombre de documento no válido'), { status: 400 });
		const dir = folder(pocId);
		await fs.promises.mkdir(dir, { recursive: true });
		const tmp = path.join(dir, `.subiendo-${crypto.randomBytes(6).toString('hex')}`);
		try {
			await pipeline(stream, fs.createWriteStream(tmp, { flags: 'wx' }));
			const final = freeName(dir, clean);
			await fs.promises.rename(tmp, path.join(dir, final));
			return describe(final, fs.statSync(path.join(dir, final)));
		} catch (e) {
			await fs.promises.rm(tmp, { force: true });
			throw e;
		}
	}

	async function removeOne(pocId, name) {
		await remove(pathOf(pocId, name));
	}

	/** Al borrar la ficha, su carpeta entera. */
	async function removeAll(pocId, kind) {
		const dir = folder(pocId, kind);
		if (fs.existsSync(dir)) await remove(dir);
	}

	return { root: rootDir, folder, pathOf, list, save, remove: removeOne, removeAll };
}
