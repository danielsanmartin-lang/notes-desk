import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, test } from 'node:test';
import { createDocuments, safeFileName } from '../server/documents.js';

let dir;
let docs;
beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-desk-docs-'));
	docs = createDocuments(dir);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const body = (text) => Readable.from([Buffer.from(text)]);

test('guarda, lista y quita documentos de una RFP', async () => {
	assert.deepEqual(docs.list(3), [], 'sin carpeta todavía: lista vacía');
	const a = await docs.save(3, 'Pliego técnico.pdf', body('pdf'));
	assert.equal(a.name, 'Pliego técnico.pdf');
	assert.equal(a.size, 3);
	const b = await docs.save(3, 'Pliego técnico.pdf', body('otro'));
	assert.equal(b.name, 'Pliego técnico (2).pdf', 'no pisa uno que ya existe');
	await docs.save(3, 'anexo 10.docx', body('x'));
	await docs.save(3, 'anexo 2.docx', body('x'));
	assert.deepEqual(
		docs.list(3).map((d) => d.name),
		['anexo 2.docx', 'anexo 10.docx', 'Pliego técnico (2).pdf', 'Pliego técnico.pdf'],
	);
	assert.deepEqual(docs.list(4), [], 'cada RFP tiene su carpeta');
	assert.equal(fs.readFileSync(docs.pathOf(3, 'Pliego técnico (2).pdf'), 'utf8'), 'otro');

	await docs.remove(3, 'Pliego técnico.pdf');
	assert.equal(docs.list(3).length, 3);
	await docs.removeAll(3);
	assert.equal(fs.existsSync(docs.folder(3)), false);
});

test('lo que se deja en la carpeta desde Finder también sale; los ocultos no', () => {
	fs.mkdirSync(docs.folder(5), { recursive: true });
	fs.writeFileSync(path.join(docs.folder(5), 'Oferta.xlsx'), 'x');
	fs.writeFileSync(path.join(docs.folder(5), '.DS_Store'), 'x');
	assert.deepEqual(docs.list(5).map((d) => d.name), ['Oferta.xlsx']);
});

test('los nombres no pueden salirse de la carpeta de su RFP', async () => {
	assert.equal(safeFileName('../../etc/passwd'), 'passwd');
	assert.equal(safeFileName('C:\\\\temp\\\\oferta.pdf'), 'oferta.pdf');
	assert.equal(safeFileName('..'), null);
	assert.equal(safeFileName('.oculto'), null);
	assert.equal(safeFileName('a\u0000b:c.pdf'), 'abc.pdf');
	const saved = await docs.save(1, '../fuera.pdf', body('x'));
	assert.equal(saved.name, 'fuera.pdf');
	assert.ok(fs.existsSync(path.join(docs.folder(1), 'fuera.pdf')));
	assert.throws(() => docs.pathOf(1, '../rfp-2/secreto.pdf'), /no válido/);
	assert.throws(() => docs.pathOf(1, 'no-existe.pdf'), /no existe/);
	assert.throws(() => docs.folder('1/../2'), /no válida/);
	await assert.rejects(docs.remove(1, '../../x'), /no válido/);
});
