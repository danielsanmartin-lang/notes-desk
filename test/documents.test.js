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

test('las PoCs tienen su propia carpeta y los documentos dicen cuándo se adjuntaron', async () => {
	const kinds = { 1: 'poc', 2: 'rfp' };
	const both = createDocuments(dir, { kindOf: (id) => kinds[id] });
	assert.equal(path.basename(both.folder(1)), 'poc-1');
	assert.equal(path.basename(both.folder(2)), 'rfp-2');
	assert.equal(path.basename(both.folder(9, 'poc')), 'poc-9', 'al borrar la ficha se pasa el tipo');
	assert.throws(() => both.folder(3), /no válida/, 'una ficha que no existe no tiene carpeta');

	const first = await both.save(1, 'Captura.png', body('png'));
	assert.ok(!Number.isNaN(Date.parse(first.added_at)));
	await both.save(1, 'Acta kickoff.pdf', body('pdf'));
	assert.deepEqual(both.list(1).map((d) => d.name), ['Acta kickoff.pdf', 'Captura.png']);
	assert.deepEqual(both.list(2), [], 'la RFP no ve los de la PoC');
	await both.removeAll(1, 'poc');
	assert.equal(fs.existsSync(both.folder(1)), false);
});

test('enlaces: se guardan como .webloc, salen con su URL y en su orden', async () => {
	const sheet = 'https://docs.google.com/spreadsheets/d/abc123/edit#gid=0';
	const a = await docs.addLink(3, sheet, '');
	assert.equal(a.name, 'Google Sheet.webloc');
	assert.equal(a.url, sheet);
	const b = await docs.addLink(3, 'docs.google.com/document/d/x/edit', 'Plan de la PoC');
	assert.equal(b.name, 'Plan de la PoC.webloc');
	assert.equal(b.url, 'https://docs.google.com/document/d/x/edit', 'sin esquema se entiende https');
	const c = await docs.addLink(3, 'https://www.notion.so/zepo?a=1&b=<2>', null);
	assert.equal(c.name, 'notion.so.webloc');
	assert.equal(c.url, 'https://www.notion.so/zepo?a=1&b=%3C2%3E');
	assert.equal((await docs.addLink(3, sheet)).name, 'Google Sheet (2).webloc', 'no pisa uno que ya existe');
	assert.equal(docs.list(3).find((d) => d.name === 'Plan de la PoC.webloc').url, 'https://docs.google.com/document/d/x/edit');

	for (const bad of ['', 'javascript:alert(1)', 'file:///etc/passwd', 'hola', 'mailto:a@b.com']) {
		await assert.rejects(docs.addLink(3, bad), /no parece válido/, bad);
	}
});

test('enlaces que llegan desde Finder: .webloc binario y .url de Windows', () => {
	const dir5 = docs.folder(5);
	fs.mkdirSync(dir5, { recursive: true });
	const url = 'https://docs.google.com/presentation/d/zz/edit';
	// bplist00 con un dict { URL: <cadena ASCII de 46 bytes> }: marcador 0x5F + entero 0x10 + longitud.
	const bin = Buffer.concat([Buffer.from('bplist00\xd1\x01\x02SURL', 'latin1'), Buffer.from([0x5f, 0x10, url.length]), Buffer.from(url), Buffer.alloc(40)]);
	fs.writeFileSync(path.join(dir5, 'Deck.webloc'), bin);
	fs.writeFileSync(path.join(dir5, 'Web.url'), '[InternetShortcut]\r\nURL=https://zepo.app/\r\n');
	fs.writeFileSync(path.join(dir5, 'Roto.webloc'), 'nada');
	const byName = Object.fromEntries(docs.list(5).map((d) => [d.name, d.url]));
	assert.deepEqual(byName, { 'Deck.webloc': url, 'Roto.webloc': undefined, 'Web.url': 'https://zepo.app/' });
});
