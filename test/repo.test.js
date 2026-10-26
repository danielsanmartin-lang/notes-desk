import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { openDb } from '../server/db.js';
import { createRepo } from '../server/repo.js';

let clock;
let repo;
const at = (s) => {
	clock = new Date(s);
};

beforeEach(() => {
	at('2026-10-26T10:00:00');
	repo = createRepo(openDb(':memory:'), { now: () => clock });
});

test('flujo de follow-up: toque → espera → respuesta → completado', () => {
	const fup = repo.createItem({ category: 'followup', title: 'BCI: preguntas de la PoC', company: 'BCI', contact: 'Catalina' });
	assert.equal(fup.state, 'todo');

	const { item: waiting } = repo.touchItem(fup.id, { channel: 'email', body: 'Contestadas sus preguntas' });
	assert.equal(waiting.state, 'waiting');
	assert.equal(waiting.touch_count, 1);
	assert.equal(waiting.waiting_since, '2026-10-26T10:00:00');
	assert.equal(waiting.due_date, '2026-10-29'); // +3 días por defecto
	assert.equal(waiting.channel, 'email');

	at('2026-10-29T09:00:00');
	const { item: again } = repo.touchItem(fup.id, { next_date: '2026-11-03' });
	assert.equal(again.touch_count, 2);
	assert.equal(again.waiting_since, '2026-10-26T10:00:00', 'la espera cuenta desde el primer toque sin respuesta');
	assert.equal(again.due_date, '2026-11-03');

	const { item: replied } = repo.replyItem(fup.id, { body: 'Nos pasan slots' });
	assert.equal(replied.state, 'todo');
	assert.equal(replied.waiting_since, null);
	assert.equal(replied.due_date, '2026-10-29');

	const done = repo.completeItem(fup.id);
	assert.equal(done.state, 'done');
	const kinds = repo.getItem(fup.id).activity.map((a) => a.kind);
	assert.deepEqual(kinds, ['done', 'reply', 'touch', 'touch', 'created']);
});

test('el siguiente follow-up por defecto salta el fin de semana', () => {
	at('2026-10-29T10:00:00'); // jueves + 3 = domingo → lunes
	const fup = repo.createItem({ category: 'followup', title: 'Eurecat' });
	assert.equal(repo.touchItem(fup.id, {}).item.due_date, '2026-11-02');
});

test('deshacer un toque restaura el estado anterior', () => {
	const fup = repo.createItem({ category: 'followup', title: 'IMQ', due_date: '2026-10-26' });
	const { activity_id } = repo.touchItem(fup.id, { channel: 'call' });
	const restored = repo.deleteActivity(activity_id);
	assert.equal(restored.state, 'todo');
	assert.equal(restored.touch_count, 0);
	assert.equal(restored.due_date, '2026-10-26');
	assert.equal(restored.channel, null);

	const { activity_id: replyId } = repo.replyItem(fup.id, { complete: true });
	assert.equal(repo.getItem(fup.id).item.state, 'done');
	repo.deleteActivity(replyId);
	const back = repo.getItem(fup.id);
	assert.equal(back.item.state, 'todo');
	assert.ok(!back.activity.some((a) => a.kind === 'done' || a.kind === 'reply'));
});

test('reabrir una tarea completada vuelve a su estado y limpia la bitácora', () => {
	const fup = repo.createItem({ category: 'followup', title: 'CCN' });
	repo.touchItem(fup.id, {});
	repo.completeItem(fup.id);
	const reopened = repo.reopenItem(fup.id);
	assert.equal(reopened.state, 'waiting');
	assert.equal(reopened.completed_at, null);
	assert.ok(!repo.getItem(fup.id).activity.some((a) => a.kind === 'done'));
});

test('vistas Hoy, Próximos, Follow-ups y Tareas', () => {
	const overdue = repo.createItem({ category: 'followup', title: 'Vencido', due_date: '2026-10-20' });
	repo.createItem({ category: 'task', title: 'Hoy', due_date: '2026-10-26' });
	repo.createItem({ category: 'task', title: 'Destacada', flagged: true });
	repo.createItem({ category: 'task', title: 'Viernes', due_date: '2026-10-30' });
	repo.createItem({ category: 'task', title: 'Lejana', due_date: '2026-12-01' });

	assert.deepEqual(repo.listItems('today').items.map((i) => i.title), ['Vencido', 'Hoy', 'Destacada']);
	assert.deepEqual(repo.listItems('upcoming').items.map((i) => i.title), ['Viernes']);
	assert.deepEqual(repo.listItems('followups').items.map((i) => i.title), ['Vencido']);
	assert.equal(repo.listItems('tasks').items.length, 4);

	repo.completeItem(overdue.id);
	assert.deepEqual(repo.listItems('followups').done.map((i) => i.title), ['Vencido']);
	assert.deepEqual(repo.listItems('today').done.map((i) => i.title), ['Vencido']);

	const c = repo.counts();
	assert.equal(c.today, 2);
	assert.equal(c.upcoming, 1);
	assert.equal(c.tasks, 4);
});

test('PoCs: plantilla, progreso, pausa hasta Q1 y reanudación automática', () => {
	const poc = repo.createPoc({ name: 'Corporación América', company: 'Aeropuertos Argentinos', country: 'ar' }, { useTemplate: true });
	assert.equal(poc.country, 'AR');
	assert.equal(poc.total, 5);
	const first = repo.listItems('poc', { pocId: poc.id }).items[0];
	repo.updateItem(first.id, { due_date: '2026-10-26' });
	repo.completeItem(repo.listItems('poc', { pocId: poc.id }).items[1].id);
	assert.equal(repo.getPoc(poc.id).poc.done, 1);
	assert.equal(repo.listItems('today').items.length, 1);

	repo.setPocStatus(poc.id, { status: 'paused', paused_until: '2027-01-11', body: 'No hacen PoC hasta Q1' });
	assert.equal(repo.listItems('today').items.length, 0, 'una PoC pausada no aparece en Hoy');

	at('2027-01-11T08:00:00');
	assert.equal(repo.housekeeping(), 1);
	assert.equal(repo.getPoc(poc.id).poc.status, 'active');
	const kinds = repo.getPoc(poc.id).activity.map((a) => a.kind);
	assert.ok(kinds.includes('paused') && kinds.includes('resumed') && kinds.includes('done'));
});

test('subtareas heredan categoría y PoC; mover una tarea a una PoC mueve sus subtareas', () => {
	const poc = repo.createPoc({ name: 'Cafam' });
	const task = repo.createItem({ category: 'task', title: 'Confirmar PoC' });
	const sub = repo.createItem({ parent_id: task.id, title: 'Escribir a Brigitte' });
	assert.equal(sub.category, 'task');
	assert.throws(() => repo.createItem({ parent_id: sub.id, title: 'Nieta' }), /un nivel/);

	repo.updateItem(task.id, { poc_id: poc.id });
	const detail = repo.getItem(task.id);
	assert.equal(detail.item.category, 'poc');
	assert.equal(detail.subtasks[0].poc_id, poc.id);
	assert.equal(detail.item.sub_total, 1);
});

test('semana: completadas, toques y respuestas dentro de su ventana', () => {
	const a = repo.createItem({ category: 'followup', title: 'BCI' });
	repo.touchItem(a.id, { channel: 'email' });
	const b = repo.createItem({ category: 'task', title: 'Grandvalira' });
	repo.completeItem(b.id);
	at('2026-11-02T10:00:00');
	repo.replyItem(a.id, {});

	const w44 = repo.getWeek('2026-W44');
	assert.deepEqual(w44.done.map((i) => i.title), ['Grandvalira']);
	assert.equal(w44.touches.length, 1);
	assert.equal(w44.replies.length, 0);
	assert.equal(repo.getWeek('2026-W45').replies.length, 1);
	const weeks = repo.listWeeks();
	assert.equal(weeks[0].week, '2026-W45');
	assert.equal(weeks[1].done, 1);
});

test('papelera, restaurar y vaciar', () => {
	const t = repo.createItem({ category: 'task', title: 'Borrar' });
	repo.createItem({ parent_id: t.id, title: 'Sub' });
	repo.deleteItem(t.id);
	assert.equal(repo.listItems('tasks').items.length, 0);
	assert.equal(repo.listItems('trash').items.length, 1, 'solo la madre, no sus subtareas');
	repo.restoreItem(t.id);
	assert.equal(repo.listItems('tasks').items.length, 1);
	repo.deleteItem(t.id);
	assert.equal(repo.emptyTrash(), 1);
	assert.equal(repo.counts().trash, 0);
});

test('búsqueda sin acentos y por prefijo; sugerencias de empresa y contacto', () => {
	repo.createItem({ category: 'followup', title: 'Llamar a Matías', company: 'Aeropuertos Argentinos', contact: 'Matías' });
	repo.createItem({ category: 'task', title: 'Pedir a Diego que reagende Intercorp' });
	repo.createPoc({ name: 'Corporación América' });
	assert.equal(repo.search('matias').items.length, 1);
	assert.equal(repo.search('reag inter').items.length, 1);
	assert.equal(repo.search('corporacion').pocs.length, 1);
	assert.deepEqual(repo.suggestions().contacts, [{ value: 'Matías', company: 'Aeropuertos Argentinos' }]);
});

test('ajustes validados y con valores por defecto', () => {
	assert.equal(repo.getSettings().fup_days, 3);
	assert.equal(repo.setSettings({ fup_days: 5, open_at_login: true }).fup_days, 5);
	assert.throws(() => repo.setSettings({ fup_days: 0 }), /1 a 60/);
	assert.throws(() => repo.setSettings({ digest_time: '25:00' }), /Hora/);
});

test('recordatorios pendientes', () => {
	const t = repo.createItem({ category: 'task', title: 'Llamar', remind_at: '2026-10-26T09:30' });
	assert.deepEqual(repo.dueReminders().map((i) => i.id), [t.id]);
	repo.markNotified(t.id);
	assert.equal(repo.dueReminders().length, 0);
	repo.updateItem(t.id, { remind_at: '2026-10-26T09:45' });
	assert.equal(repo.dueReminders().length, 1, 'cambiar la hora reactiva el aviso');
});

test('ficha de la PoC: owner, fecha de inicio y admins del cliente', () => {
	const poc = repo.createPoc({ name: 'Cafam', owner: 'Daniel', start_date: '2026-11-03' });
	assert.equal(poc.owner, 'Daniel');
	assert.equal(poc.start_date, '2026-11-03');
	assert.equal(poc.admin_count, 0);
	assert.throws(() => repo.updatePoc(poc.id, { start_date: '3 nov' }), /inicio/);

	const brigitte = repo.addPocAdmin(poc.id, { name: 'Alida Brigitte Albarracín', email: 'Brigitte@Cafam.com.co', role: 'CISO' });
	assert.equal(brigitte.email, 'brigitte@cafam.com.co');
	repo.addPocAdmin(poc.id, { name: 'Carlos Ruiz' });
	assert.throws(() => repo.addPocAdmin(poc.id, { name: 'X', email: 'no-es-email' }), /email/);
	assert.throws(() => repo.addPocAdmin(poc.id, { email: 'a@b.co' }), /nombre/);

	const detail = repo.getPoc(poc.id);
	assert.equal(detail.poc.admin_count, 2);
	assert.deepEqual(detail.admins.map((a) => a.name), ['Alida Brigitte Albarracín', 'Carlos Ruiz']);
	assert.equal(repo.updatePocAdmin(brigitte.id, { role: 'Responsable de seguridad' }).role, 'Responsable de seguridad');
	repo.deletePocAdmin(brigitte.id);
	assert.equal(repo.getPoc(poc.id).admins.length, 1);

	assert.equal(repo.search('carlos').pocs.length, 1, 'se encuentra la PoC por sus admins');
	assert.equal(repo.search('daniel').pocs.length, 1, 'y por su owner');
	assert.deepEqual(repo.suggestions().owners, ['Daniel']);
	repo.deletePoc(poc.id);
	assert.equal(repo.search('carlos').pocs.length, 0, 'los admins se borran con la PoC');
});
