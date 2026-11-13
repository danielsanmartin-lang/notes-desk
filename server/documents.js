// Documentos de las PoCs y las RFPs (pliegos, propuestas, capturas…): una carpeta por ficha junto a la base de
// datos (poc-12, rfp-7). La carpeta manda: no hay tabla, así que lo que se suelte en ella desde Finder también
// aparece en la app. Los enlaces (Google Docs, Sheets…) son archivos .webloc, los de macOS: salen en la misma
// lista, en su orden, y también se abren desde Finder.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { cleanUrl, linkTitle } from '../shared/links.js';

const MAX_NAME = 180;
const LINK_EXT = /\.(webloc|url)$/i;

const xmlEscape = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const xmlUnescape = (t) =>
	t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

const webloc = (url) =>
	`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>URL</key>
	<string>${xmlEscape(url)}</string>
</dict>
</plist>
`;

/**
 * La URL de un .webloc (plist XML, o binario como los que crea Finder al arrastrar un enlace) o de un .url de
 * Windows. null si no se entiende.
 */
export function readLink(buf) {
	if (buf.length > 64 * 1024) return null;
	const text = buf.toString('utf8');
	let url = null;
	if (buf.subarray(0, 6).toString('latin1') === 'bplist') {
		// En un plist binario la cadena ASCII lleva delante su marcador y su longitud: 0x5L, o 0x5F + entero.
		const at = buf.indexOf('http');
		if (at > 0) {
			let len = null;
			if (buf[at - 1] >= 0x50 && buf[at - 1] <= 0x5e) len = buf[at - 1] & 0x0f;
			else if (at >= 3 && buf[at - 3] === 0x5f && buf[at - 2] === 0x10) len = buf[at - 1];
			else if (at >= 4 && buf[at - 4] === 0x5f && buf[at - 3] === 0x11) len = buf.readUInt16BE(at - 2);
			if (len) url = buf.subarray(at, at + len).toString('latin1');
		}
	} else {
		const m = text.match(/<key>URL<\/key>\s*<string>([^<]*)<\/string>/) ?? text.match(/^URL=(.+)$/m);
		if (m) url = xmlUnescape(m[1].trim());
	}
	return url ? cleanUrl(url) : null;
}

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
	const describe = (name, st, dir) => {
		const doc = {
			name: name.normalize('NFC'),
			size: st.size,
			modified_at: st.mtime.toISOString(),
			added_at: (st.birthtimeMs > 0 ? st.birthtime : st.mtime).toISOString(),
		};
		if (LINK_EXT.test(name)) {
			let url = null;
			try {
				url = readLink(fs.readFileSync(path.join(dir, name)));
			} catch {
				// Ilegible: sale como un archivo más.
			}
			if (url) doc.url = url;
		}
		return doc;
	};

	function list(pocId) {
		const dir = folder(pocId);
		if (!fs.existsSync(dir)) return [];
		return fs
			.readdirSync(dir, { withFileTypes: true })
			.filter((e) => e.isFile() && !e.name.startsWith('.'))
			.map((e) => {
				return describe(e.name, fs.statSync(path.join(dir, e.name)), dir);
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
		return write(pocId, clean, stream);
	}

	/** Añade un enlace como «<título>.webloc». Sin título, el tipo de documento de Google o el dominio. */
	async function addLink(pocId, rawUrl, title) {
		const url = cleanUrl(rawUrl);
		if (!url) throw Object.assign(new Error('Ese enlace no parece válido: pega una dirección web (https://…)'), { status: 400 });
		const base = safeFileName(String(title ?? '').trim().replace(/\.(webloc|url)$/i, '')) ?? safeFileName(linkTitle(url)) ?? 'Enlace';
		return write(pocId, `${base.slice(0, MAX_NAME - 7)}.webloc`, Readable.from([Buffer.from(webloc(url))]));
	}

	async function write(pocId, clean, stream) {
		const dir = folder(pocId);
		await fs.promises.mkdir(dir, { recursive: true });
		const tmp = path.join(dir, `.subiendo-${crypto.randomBytes(6).toString('hex')}`);
		try {
			await pipeline(stream, fs.createWriteStream(tmp, { flags: 'wx' }));
			const final = freeName(dir, clean);
			await fs.promises.rename(tmp, path.join(dir, final));
			return describe(final, fs.statSync(path.join(dir, final)), dir);
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

	return { root: rootDir, folder, pathOf, list, save, addLink, remove: removeOne, removeAll };
}
