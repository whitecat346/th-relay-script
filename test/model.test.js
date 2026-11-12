import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTimeParts, splitTime } from '../src/core/model.js';

test('时 / 分分开填写', () => {
  assert.deepEqual(parseTimeParts('9', '00'), { ok: true, minutes: 540, timeRaw: '9:00' });
  assert.deepEqual(parseTimeParts('9', ''), { ok: true, minutes: 540, timeRaw: '9:00' });
  assert.deepEqual(parseTimeParts('13', '5'), { ok: true, minutes: 785, timeRaw: '13:05' });
  assert.deepEqual(parseTimeParts('25', '47'), { ok: true, minutes: 1547, timeRaw: '25:47' });
});

test('时 / 分非法输入', () => {
  assert.equal(parseTimeParts('', '00').ok, false);
  assert.equal(parseTimeParts('abc', '00').ok, false);
  assert.equal(parseTimeParts('9', '99').ok, false);
  assert.equal(parseTimeParts('100', '00').ok, false);
});

test('拆分已有时间', () => {
  assert.deepEqual(splitTime('9:00'), { hourInput: '9', minuteInput: '00' });
  assert.deepEqual(splitTime('25:47'), { hourInput: '25', minuteInput: '47' });
  assert.deepEqual(splitTime('', 785), { hourInput: '13', minuteInput: '05' });
});
