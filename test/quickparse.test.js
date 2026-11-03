import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHubspotRef } from '../shared/hubspot.js';
import { parseQuick } from '../shared/quickparse.js';

const now = new Date(2026, 9, 26, 13, 0); // lunes 26 oct 2026
const pocs = [
	{ id: 1, name: 'Cafam', company: 'Cafam', color: '#1D9E75' },
	{ id: 2, name: 'Corporación América', company: 'Aeropuertos Argentinos', color: '#888780' },
];
const companies = ['BCI', 'Eurecat', 'IMQ', 'Centro Cuesta Nacional'];
const parse = (text) => parseQuick(text, { now, pocs, companies });

test('follow-up con día de la semana y empresa conocida', () => {
	const r = parse('FUP Catalina BCI el viernes');
	assert.equal(r.title, 'FUP Catalina BCI');
	assert.equal(r.category, 'followup');
	assert.equal(r.dueDate, '2026-10-30');
	assert.equal(r.remindAt, null);
	assert.equal(r.company, 'BCI');
});

test('etiquetas de categoría, PoC y destacada', () => {
	const r = parse('Revisar resultados @cafam mañana !');
	assert.equal(r.title, 'Revisar resultados');
	assert.equal(r.category, 'poc');
	assert.equal(r.pocId, 1);
	assert.equal(r.dueDate, '2026-10-27');
	assert.equal(r.flagged, true);

	const t = parse('Preparar precio Centro Cuesta Nacional #tarea');
	assert.equal(t.category, 'task');
	assert.equal(t.title, 'Preparar precio Centro Cuesta Nacional');
	assert.equal(t.company, 'Centro Cuesta Nacional');
	assert.equal(t.dueDate, null);
});

test('PoC con espacios, por empresa y sin acentos', () => {
	assert.equal(parse('Llamar a Matías @"Corporación América"').pocId, 2);
	assert.equal(parse('Llamar a Matías @aeropuertos').pocId, 2);
	assert.equal(parse('Llamar a Matías @corporacion').pocId, 2);
	const unknown = parse('Escribir a @juan');
	assert.equal(unknown.pocId, null);
	assert.equal(unknown.title, 'Escribir a @juan');
});

test('fechas en castellano que chrono no resuelve bien', () => {
	assert.equal(parse('Llamar a Juan pasado mañana').dueDate, '2026-10-28');
	assert.equal(parse('Llamar a Juan pasado mañana').title, 'Llamar a Juan');
	assert.equal(parse('Reunión interna la semana que viene').dueDate, '2026-11-02');
	const r = parse('Grandvalira el jueves que viene');
	assert.equal(r.dueDate, '2026-10-29');
	assert.equal(r.title, 'Grandvalira');
	const lab = parse('FUP Eurecat en 3 días laborables');
	assert.equal(lab.dueDate, '2026-10-29');
	assert.equal(lab.title, 'FUP Eurecat');
	assert.equal(parseQuick('Llamar a IMQ en 3 días hábiles', { now: new Date(2026, 9, 29, 9) }).dueDate, '2026-11-03');
});

test('con hora crea recordatorio', () => {
	const r = parse('Llamar a Alberto Olivares lunes 10:00');
	assert.equal(r.dueDate, '2026-11-02');
	assert.equal(r.remindAt, '2026-11-02T10:00:00');
	assert.equal(r.title, 'Llamar a Alberto Olivares');
	assert.equal(parse('FUP Eurecat en 3 días').dueDate, '2026-10-29');
	assert.equal(parse('FUP Eurecat 30 oct').dueDate, '2026-10-30');
});

test('enlaces de HubSpot', () => {
	assert.deepEqual(parseHubspotRef('https://app-eu1.hubspot.com/contacts/1234567/record/0-3/98765432/'), {
		dealId: '98765432',
		url: 'https://app-eu1.hubspot.com/contacts/1234567/record/0-3/98765432/',
		portalId: '1234567',
	});
	assert.equal(parseHubspotRef('98765432').dealId, '98765432');
	assert.equal(parseHubspotRef('https://google.com'), null);
});
