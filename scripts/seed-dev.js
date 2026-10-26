// Siembra data/dev.db con las tareas de la captura del Google Doc (semana W44), para desarrollar con
// datos realistas. Las fechas son relativas a hoy. Borra la dev.db anterior. La DB real no se toca.
//   npm run seed

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../server/db.js';
import { createRepo } from '../server/repo.js';
import { addDays, toDateStr } from '../shared/dates.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = path.join(root, 'data', 'dev.db');
for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) fs.rmSync(f, { force: true });

const today = toDateStr(new Date());
const day = (offset) => addDays(today, offset);
let clock = new Date();
const at = (offset, time = '10:00') => {
	clock = new Date(`${day(offset)}T${time}:00`);
};
const repo = createRepo(openDb(dbPath), { now: () => clock });

// ── Follow-ups ──
at(-18);
const bci = repo.createItem({
	category: 'followup',
	title: 'BCI: respuesta a las preguntas de la PoC',
	company: 'BCI',
	contact: 'Catalina',
	channel: 'email',
	notes: 'Están en PoC. Catalina mandó una serie amplia de preguntas.',
});
at(-17, '12:30');
repo.touchItem(bci.id, { channel: 'email', body: 'Contestadas todas sus preguntas', next_date: day(-10) });
at(-10, '09:15');
repo.touchItem(bci.id, { channel: 'email', body: 'Follow-up enviado', next_date: day(0) });

at(-3);
repo.createItem({
	category: 'followup',
	title: 'Llamar a Alberto Olivares: ¿van al ENISE?',
	company: 'IMQ',
	contact: 'Alberto Olivares',
	channel: 'call',
	due_date: day(0),
});
repo.createItem({
	category: 'followup',
	title: 'Llamar a Juan Caubet',
	company: 'Eurecat',
	contact: 'Juan Caubet',
	channel: 'call',
	due_date: day(0),
	notes: 'Si no lo coge, WhatsApp breve: dos líneas separadas, nada más.',
	message_template: 'Cómo vais Juan.\nAquí Dani de Zepo, ¿qué tal?',
});

at(-14);
const ccn = repo.createItem({
	category: 'followup',
	title: 'Centro Cuesta Nacional: slots con el CISO',
	company: 'Centro Cuesta Nacional',
	channel: 'email',
	notes: 'Mirar historias de clientes retail y fábricas. Tiene que coordinar con el CISO fechas para la siguiente semana y me mandará slots.',
});
const precio = repo.createItem({ parent_id: ccn.id, title: 'Preparar precio' });
at(-12);
repo.completeItem(precio.id);
at(-11, '11:00');
repo.touchItem(ccn.id, { channel: 'email', body: 'FUP', next_date: day(0) });
at(0, '09:05');
repo.touchItem(ccn.id, { channel: 'email', body: 'FUP', next_date: day(3) });

// ── Tareas ──
at(-5);
repo.createItem({ category: 'task', title: 'Grandvalira: consultar con Alberto', company: 'Grandvalira' });
at(-4);
repo.createItem({ category: 'task', title: 'Revisar los deals de LATAM en HubSpot', due_date: day(1), flagged: true });
at(-6);
const diego = repo.createItem({ category: 'task', title: 'Pedir a Diego que reagende Intercorp y BanBif', contact: 'Diego' });
at(0, '09:20');
repo.addNote({ item_id: diego.id, body: 'Reagendadas' });
repo.completeItem(diego.id);

// ── PoCs ──
at(-9);
const cafam = repo.createPoc({ name: 'Cafam', company: 'Cafam', country: 'CO' });
const escribir = repo.createItem({
	category: 'poc',
	poc_id: cafam.id,
	title: 'Escribir a Alida Brigitte Albarracín Veloza para confirmar PoC',
	contact: 'Brigitte',
});
at(-1, '17:00');
repo.completeItem(escribir.id);
at(-1, '17:05');
const confirmar = repo.createItem({ category: 'poc', poc_id: cafam.id, title: 'Confirmar la PoC con Brigitte', contact: 'Brigitte' });
at(0, '09:30');
repo.touchItem(confirmar.id, { channel: 'whatsapp', body: 'Enviado WhatsApp', next_date: day(2) });
at(0, '09:31');
repo.createItem({ category: 'poc', poc_id: cafam.id, title: 'Preparar el kickoff de la PoC' });

at(-12);
const corp = repo.createPoc({ name: 'Corporación América', company: 'Aeropuertos Argentinos', country: 'AR' });
const matias = repo.createItem({ category: 'poc', poc_id: corp.id, title: 'Escribir a Matías para agendar la llamada de la PoC', contact: 'Matías' });
at(-8);
repo.touchItem(matias.id, { channel: 'email', body: 'Escrito a Matías', next_date: day(-5) });
at(-5);
repo.replyItem(matias.id, { body: 'Celina le llama, que se lleva con Matías', complete: true });
at(-2);
repo.setPocStatus(corp.id, {
	status: 'paused',
	paused_until: addDays(today, 70),
	body: 'Matías habla con su jefa: en principio no van a hacer PoC hasta Q1',
});

console.log(`dev.db sembrada en ${dbPath}`);
