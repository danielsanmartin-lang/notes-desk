import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { migrate, openDb } from '../server/db.js';
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
	assert.equal(poc.total, 3);
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

	// «Pausar» sin fecha: sigue en pausa hasta que se reactive a mano.
	repo.setPocStatus(poc.id, { status: 'paused' });
	at('2027-06-01T08:00:00');
	assert.equal(repo.housekeeping(), 0);
	assert.equal(repo.getPoc(poc.id).poc.status, 'paused');
	assert.equal(repo.getPoc(poc.id).poc.paused_until, null);
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
	assert.deepEqual([repo.getSettings().appearance, repo.getSettings().theme], ['system', 'zepo']);
	const s = repo.setSettings({ appearance: 'dark', theme: 'oceano' });
	assert.deepEqual([s.appearance, s.theme], ['dark', 'oceano']);
	assert.throws(() => repo.setSettings({ appearance: 'sepia' }), /Aspecto/);
	assert.throws(() => repo.setSettings({ theme: 'rosa' }), /Tema/);
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
	assert.deepEqual(detail.contacts.map((a) => a.name), ['Alida Brigitte Albarracín', 'Carlos Ruiz']);
	assert.equal(repo.updatePocAdmin(brigitte.id, { role: 'Responsable de seguridad' }).role, 'Responsable de seguridad');
	repo.deletePocAdmin(brigitte.id);
	assert.equal(repo.getPoc(poc.id).contacts.length, 1);

	assert.equal(repo.search('carlos').pocs.length, 1, 'se encuentra la PoC por sus admins');
	assert.equal(repo.search('daniel').pocs.length, 1, 'y por su owner');
	assert.deepEqual(repo.suggestions().owners, ['Daniel']);
	repo.deletePoc(poc.id);
	assert.equal(repo.search('carlos').pocs.length, 0, 'los admins se borran con la PoC');
});

test('Hoy incluye lo que no tiene fecha y te toca, también de PoCs activas', () => {
	const poc = repo.createPoc({ name: 'Cafam', company: 'Cafam' });
	const paused = repo.createPoc({ name: 'Corporación América' });
	repo.createItem({ category: 'task', title: 'Sin fecha' });
	repo.createItem({ category: 'poc', poc_id: poc.id, title: 'Kickoff' });
	repo.createItem({ category: 'poc', poc_id: paused.id, title: 'De una PoC en pausa' });
	repo.setPocStatus(paused.id, { status: 'paused' });
	const waiting = repo.createItem({ category: 'followup', title: 'Esperando sin fecha' });
	repo.touchItem(waiting.id, { next_date: null });
	repo.createItem({ category: 'task', title: 'Con fecha', due_date: '2026-11-20' });
	repo.createItem({ category: 'task', title: 'Destacada sin fecha', flagged: true });

	const today = repo.listItems('today');
	assert.deepEqual(today.undated.map((i) => i.title), ['Kickoff', 'Sin fecha']);
	assert.equal(today.undated[0].poc_name, 'Cafam');
	assert.deepEqual(today.items.map((i) => i.title), ['Destacada sin fecha'], 'lo destacado sigue en su grupo');
	assert.equal(repo.counts().undated, 2);
});

test('lo que tiene fecha no sale en Inicio hasta ese día', () => {
	const fup = repo.createItem({ category: 'followup', title: 'FUP a Catalina', due_date: '2026-10-29' });
	repo.createItem({ category: 'task', title: 'Destacada para el jueves', due_date: '2026-10-29', flagged: true });
	const parent = repo.createItem({ category: 'followup', title: 'ENGIE Chile' });
	const sub = repo.createItem({ parent_id: parent.id, title: 'Okta', due_date: '2026-10-29' });
	const mixed = repo.createItem({ category: 'task', title: 'Revisar deals' });
	repo.createItem({ parent_id: mixed.id, title: 'Sonda', due_date: '2026-11-02' });
	repo.createItem({ parent_id: mixed.id, title: 'Cafam' });

	let today = repo.listItems('today');
	assert.deepEqual(today.items, [], 'ni lo destacado con fecha futura');
	assert.deepEqual(today.undated.map((i) => i.id), [mixed.id], 'la madre sale si alguna subtarea no tiene fecha');
	assert.equal(repo.counts().today, 0);

	at('2026-10-29T08:00:00');
	today = repo.listItems('today');
	assert.deepEqual(today.items.map((i) => i.id).sort(), [fup.id, sub.id, today.items.find((i) => i.flagged).id].sort());
	assert.ok(!today.undated.some((i) => i.id === parent.id));
});

test('cuentas: agrupa por empresa (o la de su PoC) sin distinguir mayúsculas ni acentos', () => {
	const poc = repo.createPoc({ name: 'Confirmación PoC', company: 'Cafam' });
	repo.addPocAdmin(poc.id, { name: 'Brigitte', email: 'b@cafam.co' });
	repo.createItem({ category: 'poc', poc_id: poc.id, title: 'Kickoff', contact: 'Brigitte' });
	const fup = repo.createItem({ category: 'followup', title: 'Llamar', company: 'CAFAM', contact: 'Andrés' });
	repo.createItem({ category: 'task', title: 'Precio', company: 'Centro Cuesta Nacional' });
	repo.touchItem(fup.id, { channel: 'call' });
	at('2026-10-28T10:00:00');
	repo.replyItem(fup.id, { body: 'Ok' });

	const list = repo.listAccounts();
	assert.deepEqual(list.map((a) => a.name).sort(), ['Cafam', 'Centro Cuesta Nacional']);
	const cafam = list.find((a) => a.name === 'Cafam');
	assert.equal(cafam.followups + cafam.poc_items, 2);
	assert.equal(cafam.pocs.length, 1);

	const detail = repo.getAccount('cafam');
	assert.equal(detail.open.length, 2);
	assert.deepEqual(detail.contacts.map((c) => c.name).sort(), ['Andrés', 'Brigitte']);
	assert.equal(detail.contacts.find((c) => c.name === 'Brigitte').email, 'b@cafam.co');
	assert.equal(detail.stats.avg_response_days, 2);
	assert.ok(detail.activity.some((a) => a.kind === 'reply'));
	assert.deepEqual(repo.search('cuesta').accounts, ['Centro Cuesta Nacional']);
	assert.throws(() => repo.getAccount('nadie'), /no existe/);
});

test('estadísticas del periodo: totales, respuesta, espera y canales', () => {
	const a = repo.createItem({ category: 'followup', title: 'BCI', company: 'BCI' });
	const b = repo.createItem({ category: 'followup', title: 'IMQ', company: 'IMQ' });
	repo.touchItem(a.id, { channel: 'email' });
	repo.touchItem(b.id, { channel: 'whatsapp' });
	repo.completeItem(repo.createItem({ category: 'task', title: 'Hecha' }).id);
	at('2026-10-30T10:00:00');
	repo.replyItem(a.id, {});

	const s = repo.stats(4);
	assert.equal(s.weekly.length, 4);
	assert.equal(s.weekly.at(-1).week, '2026-W44');
	assert.deepEqual(s.totals, { done: 1, touches: 2, replies: 1 });
	assert.equal(s.response.rate, 50);
	assert.equal(s.response.avg_days, 4);
	assert.equal(s.now.waiting, 1);
	assert.equal(s.waiting_buckets[1].n, 1, 'IMQ lleva 4 días esperando');
	assert.deepEqual(s.channels.map((c) => c.channel).sort(), ['email', 'whatsapp']);
	assert.equal(s.accounts[0].name, 'BCI');
});

test('importe manual de una PoC', () => {
	const poc = repo.createPoc({ name: 'Grandvalira', country: 'AD', amount: '12.500', currency: 'eur' });
	assert.equal(poc.amount, 12500);
	assert.equal(poc.currency, 'EUR');
	assert.equal(repo.updatePoc(poc.id, { amount: 9000.5 }).amount, 9000.5);
	assert.equal(repo.updatePoc(poc.id, { amount: '' }).amount, null);
	assert.throws(() => repo.updatePoc(poc.id, { amount: 'mucho' }), /número/);
	assert.throws(() => repo.updatePoc(poc.id, { currency: 'euros' }), /tres letras/);
});

test('estadísticas por región y país', () => {
	const simon = repo.createPoc({ name: 'Simon Electric', company: 'Simon Electric', country: 'ES', start_date: '2026-09-18', amount: 20000, currency: 'EUR' });
	repo.createPoc({ name: 'Primax', company: 'Primax', country: 'PE', start_date: '2026-10-08', amount: 15000, currency: 'USD' });
	const omint = repo.createPoc({ name: 'Grupo Omint', company: 'Grupo Omint', country: 'AR', amount: 20000, currency: 'USD' });
	repo.updatePoc(omint.id, {});
	repo.applyHubspotDeal(omint.id, { id: '1', name: 'Omint', closeDate: '2026-11-30', amount: 20000, currency: 'USD' });
	repo.setPocStatus(repo.createPoc({ name: 'Ganada', country: 'PT' }).id, { status: 'won' });

	// Un follow-up sin PoC pero de la misma cuenta que Simon Electric cuenta como Iberia.
	const fup = repo.createItem({ category: 'followup', title: 'FUP Simon', company: 'simon electric' });
	repo.touchItem(fup.id, { channel: 'email' });
	const lat = repo.createItem({ category: 'poc', poc_id: omint.id, title: 'FUP Omint' });
	repo.touchItem(lat.id, { channel: 'whatsapp' });
	repo.touchItem(repo.createItem({ category: 'task', title: 'Sin región' }).id, {});

	const all = repo.stats(4);
	assert.equal(all.totals.touches, 3);
	assert.deepEqual(all.activity_by_region.map((r) => [r.region, r.touches]), [['iberia', 1], ['latam', 1], ['none', 1]]);
	assert.deepEqual(all.regions.map((r) => [r.region, r.active, r.won]), [['iberia', 1, 1], ['latam', 2, 0]]);
	assert.deepEqual(all.regions[1].amounts, [{ currency: 'USD', value: 35000 }]);

	const iberia = repo.stats(4, 'iberia');
	assert.equal(iberia.region, 'iberia');
	assert.equal(iberia.totals.touches, 1);
	assert.deepEqual(iberia.channels.map((c) => c.channel), ['email']);
	assert.equal(iberia.now.waiting, 1);
	assert.deepEqual(iberia.countries.map((c) => c.country), ['ES']);
	assert.deepEqual(iberia.poc_days.map((p) => [p.name, p.days]), [['Simon Electric', 38]]);

	const latam = repo.stats(4, 'latam');
	assert.deepEqual(latam.countries.map((c) => c.country), ['AR', 'PE']);
	assert.equal(latam.closes[1].month, '2026-11');
	assert.equal(latam.closes[1].latam, 1);
	assert.equal(latam.pocs.active, 2);
	assert.equal(simon.country, 'ES');
});

test('el país tiene que existir', () => {
	assert.equal(repo.createPoc({ name: 'HSBC', country: 'mx' }).country, 'MX');
	assert.throws(() => repo.createPoc({ name: 'Nada', country: 'XX' }), /No conozco el país/);
	assert.throws(() => repo.createPoc({ name: 'Nada', country: 'Mexico' }), /No conozco el país/);
});

test('partner y tipos de contacto de la PoC', () => {
	const poc = repo.createPoc({ name: 'Global Bank', company: 'Global Bank', partner: 'Sofistic' });
	assert.equal(poc.partner, 'Sofistic');
	repo.addPocAdmin(poc.id, { name: 'Lisbeth', kind: 'main', role: 'CISO' });
	repo.addPocAdmin(poc.id, { name: 'Angel', kind: 'partner' });
	repo.addPocAdmin(poc.id, { name: 'Ana', email: 'ana@gb.com' });
	assert.throws(() => repo.addPocAdmin(poc.id, { name: 'X', kind: 'jefe' }), /Tipo/);

	const { poc: p, contacts } = repo.getPoc(poc.id);
	assert.deepEqual(contacts.map((c) => [c.name, c.kind]), [['Lisbeth', 'main'], ['Angel', 'partner'], ['Ana', 'admin']]);
	assert.equal(p.admin_count, 1, 'solo cuenta los admins');
	assert.equal(repo.search('sofistic').pocs.length, 1);
	assert.deepEqual(repo.suggestions().partners, ['Sofistic']);
	const account = repo.getAccount('global bank');
	assert.equal(account.contacts.find((c) => c.name === 'Angel').kind, 'partner');
});

test('con subtareas abiertas, el contador pasa de la tarea a cada subtarea', () => {
	const parent = repo.createItem({ category: 'task', title: 'Revisar los 3 deals de LATAM', due_date: '2026-10-26' });
	assert.deepEqual(repo.listItems('today').items.map((i) => i.title), ['Revisar los 3 deals de LATAM']);

	const cafam = repo.createItem({ parent_id: parent.id, title: 'Cafam', due_date: '2026-10-26' });
	const sonda = repo.createItem({ parent_id: parent.id, title: 'Sonda' });
	repo.touchItem(sonda.id, { channel: 'email', next_date: '2026-10-28' });

	// En Hoy sale la subtarea con fecha, no la madre.
	assert.deepEqual(repo.listItems('today').items.map((i) => i.title), ['Cafam']);
	assert.deepEqual(repo.listItems('upcoming').items.map((i) => i.title), ['Sonda']);
	// En Tareas, la madre lleva sus subtareas con su propio estado.
	const row = repo.listItems('tasks').items.find((i) => i.id === parent.id);
	assert.deepEqual(row.subs.map((s) => [s.title, s.state]), [['Cafam', 'todo'], ['Sonda', 'waiting']]);
	assert.equal(repo.stats(4).now.waiting, 1, 'cuenta la subtarea en espera');

	// Completadas todas las subtareas, la madre recupera su contador.
	repo.completeItem(cafam.id);
	repo.completeItem(sonda.id);
	assert.deepEqual(repo.listItems('today').items.map((i) => i.title), ['Revisar los 3 deals de LATAM']);
});

test('enlace de HubSpot de una cuenta, visible en sus tareas', () => {
	repo.setSettings({ hubspot_portal_id: '144272575' });
	const t = repo.createItem({ category: 'followup', title: 'FUP', company: 'BCI' });
	const acc = repo.setAccountHubspot('bci', '402201184484');
	assert.equal(acc.hubspot_url, 'https://app.hubspot.com/contacts/144272575/record/0-2/402201184484');
	assert.equal(repo.listAccounts().find((a) => a.name === 'BCI').hubspot_company_id, '402201184484');
	assert.equal(repo.getItem(t.id).item.account_hubspot_url, acc.hubspot_url);
	assert.equal(repo.setAccountHubspot('BCI', 'https://app.hubspot.com/contacts/144272575/record/0-2/9/').hubspot_company_id, '9');
	assert.throws(() => repo.setAccountHubspot('BCI', 'https://google.com'), /No reconozco/);
	assert.equal(repo.setAccountHubspot('BCI', '').hubspot_url, null);
	assert.throws(() => repo.setAccountHubspot('Nadie', '1'), /no existe/);
});

test('buscador del Inicio: título, notas, PoC e historial, sin acentos ni mayúsculas', () => {
	const poc = repo.createPoc({ name: 'Primax', company: 'Primax', country: 'PE' });
	const kickoff = repo.createItem({ category: 'poc', poc_id: poc.id, title: 'Kickoff con Brigitte' });
	const fup = repo.createItem({ category: 'followup', title: 'Llamar a Catalina', company: 'BCI', notes: 'Le interesa la integración con Okta' });
	repo.touchItem(fup.id, { body: 'Mandada la propuesta económica' });
	const done = repo.createItem({ category: 'task', title: 'Preparar demo Primax' });
	repo.completeItem(done.id);
	const trashed = repo.createItem({ category: 'task', title: 'Primax borrada' });
	repo.deleteItem(trashed.id);

	const primax = repo.searchItems('primax');
	assert.deepEqual(primax.items.map((i) => i.id), [kickoff.id], 'por el nombre de su PoC, sin las de la papelera');
	assert.deepEqual(primax.done.map((i) => i.id), [done.id]);

	const okta = repo.searchItems('INTEGRACION okta');
	assert.deepEqual(okta.items.map((i) => i.id), [fup.id]);
	assert.equal(okta.items[0].snippet, 'Le interesa la integración con Okta');

	const hist = repo.searchItems('catalina económica');
	assert.deepEqual(hist.items.map((i) => i.id), [fup.id], 'todas las palabras, aunque estén en sitios distintos');
	assert.equal(hist.items[0].snippet, 'Mandada la propuesta económica');

	assert.equal(repo.searchItems('catalina primax').items.length, 0);
	assert.deepEqual(repo.searchItems('  '), { items: [], done: [] });
});

test('el historial de la PoC incluye sus tareas desde que se añaden (no las de la papelera)', () => {
	const poc = repo.createPoc({ name: 'Primax' });
	const task = repo.createItem({ category: 'poc', poc_id: poc.id, title: 'Mandar follow-up PoC' });
	const gone = repo.createItem({ category: 'poc', poc_id: poc.id, title: 'Borrada' });
	repo.completeItem(task.id);
	repo.deleteItem(gone.id);
	const hist = repo.getPoc(poc.id).activity.map((a) => [a.kind, a.item_title ?? null]);
	assert.deepEqual(hist, [
		['done', 'Mandar follow-up PoC'],
		['created', 'Mandar follow-up PoC'],
		['created', null],
	]);
});

test('la PoC enseña lo que se apunta en su cuenta: tareas abiertas e historial mientras está abierta', () => {
	const before = repo.createItem({ category: 'followup', title: 'Antes de la PoC', company: 'MyInvestor' });
	repo.completeItem(before.id);
	at('2026-10-27T10:00:00');
	const poc = repo.createPoc({ name: 'MyInvestor (Fujitsu)', company: 'MyInvestor' });
	at('2026-11-03T13:04:00');
	const task = repo.createItem({ category: 'task', title: 'FUP con el partner por whatsapp', company: 'myinvestor ' });
	repo.createItem({ category: 'task', title: 'De otra cuenta', company: 'Primax' });
	const other = repo.createPoc({ name: 'Otra PoC', company: 'MyInvestor' });
	repo.createItem({ category: 'poc', poc_id: other.id, title: 'De la otra PoC' });
	const got = repo.getPoc(poc.id);
	assert.deepEqual(got.account_items.map((i) => i.title), ['FUP con el partner por whatsapp']);
	assert.deepEqual(
		got.activity.map((a) => [a.kind, a.item_title ?? null, a.from_account]),
		[
			['created', 'FUP con el partner por whatsapp', true],
			['created', null, false],
		],
	);
	repo.completeItem(task.id);
	assert.equal(repo.getPoc(poc.id).account_items.length, 0);
	assert.equal(repo.getPoc(poc.id).activity[0].kind, 'done');
	// Cerrada la PoC, lo que venga después de la cuenta ya no es suyo.
	repo.setPocStatus(poc.id, { status: 'won' });
	at('2026-11-10T10:00:00');
	repo.createItem({ category: 'task', title: 'Después de ganarla', company: 'MyInvestor' });
	const closed = repo.getPoc(poc.id);
	assert.equal(closed.account_items.length, 0);
	assert.ok(!closed.activity.some((a) => a.item_title === 'Después de ganarla'));
});

test('meter en la PoC una tarea de su cuenta: sale del bloque de la cuenta y cuenta en el progreso', () => {
	const poc = repo.createPoc({ name: 'MyInvestor (Fujitsu)', company: 'MyInvestor' });
	const fup = repo.createItem({ category: 'followup', title: 'FUP con el partner', company: 'MyInvestor' });
	assert.equal(repo.getPoc(poc.id).account_items.length, 1);
	repo.updateItem(fup.id, { category: 'poc', poc_id: poc.id });
	const got = repo.getPoc(poc.id);
	assert.equal(got.account_items.length, 0);
	assert.equal(got.poc.total, 1);
	assert.equal(repo.getItem(fup.id).item.category, 'poc');
});

test('el siguiente paso de la PoC puede ser una tarea de su cuenta si llega antes', () => {
	const poc = repo.createPoc({ name: 'MyInvestor (Fujitsu)', company: 'MyInvestor' });
	repo.createItem({ category: 'poc', poc_id: poc.id, title: 'Revisar usuarios', due_date: '2026-11-10' });
	assert.equal(repo.getPoc(poc.id).poc.next.title, 'Revisar usuarios');
	repo.createItem({ category: 'task', title: 'Chequear si el partner ha respondido', company: 'MyInvestor', due_date: '2026-11-06' });
	assert.equal(repo.getPoc(poc.id).poc.next.title, 'Chequear si el partner ha respondido');
	assert.equal(repo.listPocs()[0].next.title, 'Chequear si el partner ha respondido');
	// Con la PoC ganada, lo de la cuenta ya no es su siguiente paso.
	repo.setPocStatus(poc.id, { status: 'won' });
	assert.equal(repo.getPoc(poc.id).poc.next.title, 'Revisar usuarios');
});

test('cliente o partner: se detecta al crear y la PoC dice desde cuándo espera cada uno', () => {
	const poc = repo.createPoc({ name: 'MyInvestor (Fujitsu)', company: 'MyInvestor', partner: 'Fujitsu' });
	repo.addPocAdmin(poc.id, { name: 'Ángel Ruiz', kind: 'partner' });
	const viaWord = repo.createItem({ category: 'task', title: 'He hecho FUP con el partner por whatsapp', company: 'MyInvestor' });
	const viaName = repo.createItem({ category: 'poc', poc_id: poc.id, title: 'Preguntar a FUJITSU directamente' });
	const viaContact = repo.createItem({ category: 'followup', title: 'Llamar', contact: 'Angel Ruiz', company: 'MyInvestor' });
	const client = repo.createItem({ category: 'poc', poc_id: poc.id, title: 'Revisar usuarios del cliente' });
	const other = repo.createItem({ category: 'task', title: 'Hablar con el partner', company: 'Primax' });
	assert.deepEqual(
		[viaWord, viaName, viaContact, client, other].map((i) => i.audience),
		['partner', 'partner', 'partner', null, null],
	);
	// A mano manda lo elegido.
	assert.equal(repo.updateItem(viaName.id, { audience: 'client' }).audience, null);
	assert.equal(repo.createItem({ category: 'poc', poc_id: poc.id, title: 'Partner', audience: 'client' }).audience, null);

	repo.updateItem(viaWord.id, { state: 'waiting' });
	at('2026-10-28T09:00:00');
	repo.updateItem(client.id, { state: 'waiting' });
	const p = repo.getPoc(poc.id).poc;
	assert.equal(p.partner_waiting_since, '2026-10-26T10:00:00');
	assert.equal(p.client_waiting_since, '2026-10-28T09:00:00');
});

test('migración 007: lo ya apuntado que nombra al partner queda marcado como del partner', () => {
	const db = openDb(':memory:');
	const r = createRepo(db, { now: () => clock });
	const poc = r.createPoc({ name: 'MyInvestor (Fujitsu)', company: 'MyInvestor', partner: 'Fujitsu' });
	const a = r.createItem({ category: 'task', title: 'He hecho FUP con el partner', company: 'myinvestor' });
	const b = r.createItem({ category: 'poc', poc_id: poc.id, title: 'Preguntar a Fujitsu' });
	const c = r.createItem({ category: 'poc', poc_id: poc.id, title: 'Kickoff con el cliente' });
	db.exec('ALTER TABLE items DROP COLUMN audience');
	db.pragma('user_version = 6');
	migrate(db);
	assert.deepEqual(
		[a, b, c].map((i) => db.prepare('SELECT audience FROM items WHERE id = ?').get(i.id).audience),
		['partner', 'partner', null],
	);
});
