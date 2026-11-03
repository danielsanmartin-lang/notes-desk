import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	addBusinessDays,
	addDays,
	daysBetween,
	isoWeek,
	nextDow,
	relativeDay,
	skipWeekend,
	waitingLevel,
	weekLabel,
	weekRange,
} from '../shared/dates.js';

test('semana ISO como la del Google Doc (26 oct 2026 = W44)', () => {
	assert.equal(isoWeek('2026-10-26'), '2026-W44');
	assert.equal(isoWeek('2026-11-01'), '2026-W44');
	assert.equal(isoWeek('2026-11-02'), '2026-W45');
	assert.equal(isoWeek('2027-01-01'), '2026-W53');
	assert.equal(isoWeek('2026-01-01'), '2026-W01');
});

test('rango de una semana, de lunes a domingo', () => {
	assert.deepEqual(weekRange('2026-W44'), { start: '2026-10-26', end: '2026-11-01' });
	assert.deepEqual(weekRange('2026-W01'), { start: '2025-12-29', end: '2026-01-04' });
	assert.equal(weekLabel('2026-W44'), 'W44 · 26 oct – 1 nov');
});

test('días entre fechas, incluido el cambio de hora de octubre', () => {
	assert.equal(daysBetween('2026-10-16', '2026-10-26'), 10);
	assert.equal(addDays('2026-10-24', 2), '2026-10-26');
});

test('un follow-up no cae en fin de semana', () => {
	assert.equal(skipWeekend('2026-10-31'), '2026-11-02');
	assert.equal(skipWeekend('2026-11-01'), '2026-11-02');
	assert.equal(skipWeekend('2026-10-30'), '2026-10-30');
	assert.equal(nextDow('2026-10-26', 1), '2026-11-02');
	assert.equal(nextDow('2026-10-26', 5), '2026-10-30');
});

test('etiquetas relativas y nivel de espera', () => {
	assert.equal(relativeDay('2026-10-26', '2026-10-26'), 'Hoy');
	assert.equal(relativeDay('2026-10-27', '2026-10-26'), 'Mañana');
	assert.equal(relativeDay('2026-10-30', '2026-10-26'), 'viernes');
	assert.equal(relativeDay('2026-10-20', '2026-10-26'), 'hace 6 días');
	assert.equal(waitingLevel(2), 'ok');
	assert.equal(waitingLevel(5), 'warn');
	assert.equal(waitingLevel(10), 'late');
});

test('días laborables: se saltan sábado y domingo', () => {
	assert.equal(addBusinessDays('2026-10-29', 3), '2026-11-03'); // jueves + 3 = martes
	assert.equal(addBusinessDays('2026-10-26', 3), '2026-10-29'); // lunes + 3 = jueves
	assert.equal(addBusinessDays('2026-10-31', 1), '2026-11-02'); // desde el sábado, el lunes
	assert.equal(addBusinessDays('2026-10-30', 0), '2026-10-30');
});
