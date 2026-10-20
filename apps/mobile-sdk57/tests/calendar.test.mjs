import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarMonth, moveMonth, todayInPalmas, displayDate } from '../src/lib/calendar.ts';
test('calendário respeita dias da semana, fevereiro e ano bissexto', () => {
 const leap = calendarMonth(2028, 1);
 assert.equal(leap.filter(Boolean).length, 29);
 assert.equal(calendarMonth(2027, 1).filter(Boolean).length, 28);
 assert.equal(calendarMonth(2026, 9).indexOf('2026-10-01'), 4);
 assert.equal(leap.length % 7, 0);
 assert.deepEqual(moveMonth(2026, 11, 1), { year: 2027, month: 0 });
 assert.deepEqual(moveMonth(2026, 0, -1), { year: 2025, month: 11 });
});
test('data segue o dia de Palmas e a apresentação em português', () => {
 assert.equal(todayInPalmas(new Date('2026-10-21T01:00:00Z')), '2026-10-20');
 assert.equal(displayDate('2026-10-20'), '20/10/2026');
});
