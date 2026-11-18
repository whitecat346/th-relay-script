import test from 'node:test';
import assert from 'node:assert/strict';

import { backupFileName, buildBackup, mergeData, parseBackup } from '../src/core/backup.js';
import { defaultData } from '../src/core/model.js';

function sampleData() {
  return {
    schemaVersion: 1,
    projects: [
      {
        id: 'relay-a',
        name: '晨光创作接力 2026',
        hostName: '星野',
        hostLink: 'https://space.bilibili.com/1',
        eventDate: '2026-11-11',
        promotions: [],
        extraNotes: [],
        sortMode: 'renumber',
        barOrder: ['bar-1'],
        createdAt: 1,
      },
    ],
    bars: [
      {
        id: 'bar-1',
        projectId: 'relay-a',
        kind: 'normal',
        number: 1,
        minutes: 540,
        timeRaw: '9:00',
        authorName: '云间',
        typeId: 'type-1',
        createdAt: 1,
      },
    ],
    types: [
      { id: 'type-1', name: '插画' },
      { id: 'type-2', name: '视频' },
    ],
    settings: { ...defaultData().settings, boundProjectId: 'relay-a' },
  };
}

test('备份可以往返解析', () => {
  const text = buildBackup(sampleData(), new Date('2026-11-18T12:30:00+08:00'));
  const parsed = parseBackup(text);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.counts, { projects: 1, bars: 1, types: 2 });
  assert.equal(parsed.exportedAt, '2026-11-18T04:30:00.000Z');
  assert.equal(parsed.data.projects[0].name, '晨光创作接力 2026');
  assert.equal(parsed.data.bars.length, 1);
});

test('备份文件拒绝无关内容', () => {
  assert.equal(parseBackup('not json').ok, false);
  assert.equal(parseBackup('{"hello":1}').ok, false);
  assert.match(parseBackup('not json').error, /JSON/);
});

test('可以导入未包裹的裸数据', () => {
  const parsed = parseBackup(JSON.stringify(sampleData()));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.projects.length, 1);
});

test('备份文件名带日期与时间', () => {
  assert.equal(backupFileName(new Date(2026, 10, 18, 12, 30)), '接力收集备份_20261118_1230.json');
});

test('合并时 id 冲突会重新分配并保住关联', () => {
  const current = sampleData();
  const incoming = sampleData();
  incoming.bars[0].authorName = '另一个人';
  incoming.projects[0].name = '冬日来信接力';
  const merged = mergeData(current, incoming);
  assert.equal(merged.projects.length, 2);
  assert.equal(merged.bars.length, 2);
  assert.notEqual(merged.projects[1].id, 'relay-a');
  const imported = merged.bars.find((b) => b.authorName === '另一个人');
  assert.equal(imported.projectId, merged.projects[1].id);
  assert.deepEqual(merged.projects[1].barOrder, [imported.id]);
  assert.equal(merged.types.length, 2);
});

test('合并按名称去重类型', () => {
  const current = sampleData();
  const incoming = sampleData();
  incoming.types = [
    { id: 'type-9', name: '插画' },
    { id: 'type-10', name: '音乐' },
  ];
  incoming.bars[0].typeId = 'type-9';
  const merged = mergeData(current, incoming);
  assert.deepEqual(merged.types.map((t) => t.name), ['插画', '视频', '音乐']);
  const imported = merged.bars[1];
  assert.equal(imported.typeId, 'type-1');
});

test('合并保留现有设置', () => {
  const current = sampleData();
  const incoming = sampleData();
  incoming.settings = { ...incoming.settings, boundProjectId: null, theme: 'dark', animations: false };
  const merged = mergeData(current, incoming);
  assert.equal(merged.settings.theme, 'auto');
  assert.equal(merged.settings.boundProjectId, 'relay-a');
  assert.equal(merged.settings.animations, true);
});
