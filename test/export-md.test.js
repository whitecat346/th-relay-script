import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMarkdown, exportFileName, promotionLabel } from '../src/core/export-md.js';

const TYPES = [
  { id: 't-illust', name: '插画' },
  { id: 't-video', name: '视频' },
];

function bar(over) {
  return {
    id: 'b' + Math.random().toString(36).slice(2, 7),
    projectId: 'p1',
    kind: 'normal',
    number: 1,
    minutes: 540,
    timeRaw: '9:00',
    authorName: '云间',
    authorLink: 'https://space.bilibili.com/2',
    workLink: 'https://www.bilibili.com/video/BV1',
    typeId: 't-illust',
    createdAt: 1,
    ...over,
  };
}

function project(over) {
  return {
    id: 'p1',
    name: '晨光创作接力 2026',
    hostName: '星野',
    hostLink: 'https://space.bilibili.com/1',
    eventDate: '2026-11-11',
    promotions: [],
    extraNotes: [],
    ...over,
  };
}

test('完整项目：宣传 + 普通棒 + EX 棒', () => {
  const md = buildMarkdown({
    project: project({
      promotions: [{ url: 'https://a/1' }, { url: 'https://a/2' }],
    }),
    bars: [
      bar({ number: 1 }),
      bar({ number: 2, minutes: 600, timeRaw: '10:00', workLink: 'https://www.bilibili.com/video/BV2' }),
      bar({ kind: 'ex', number: 1, minutes: 824, timeRaw: '13:44', workLink: 'https://www.bilibili.com/video/BV3' }),
    ],
    types: TYPES,
  });

  const expected = [
    '## 宣传',
    '',
    '主催 [星野](https://space.bilibili.com/1)',
    '',
    '一宣：[查看](https://a/1)',
    '',
    '终宣：[查看](https://a/2)',
    '',
    '## 整点接力',
    '',
    '### 第1棒 9:00',
    '',
    '创作者 [@云间](https://space.bilibili.com/2)',
    '',
    '插画 [查看](https://www.bilibili.com/video/BV1)',
    '',
    '---',
    '',
    '### 第2棒 10:00',
    '',
    '创作者 [@云间](https://space.bilibili.com/2)',
    '',
    '插画 [查看](https://www.bilibili.com/video/BV2)',
    '',
    '---',
    '',
    '## EX棒',
    '',
    '### 第EX1棒 13:44',
    '',
    '创作者 [@云间](https://space.bilibili.com/2)',
    '',
    '插画 [查看](https://www.bilibili.com/video/BV3)',
    '',
  ].join('\n');

  assert.equal(md, expected);
});

test('缺号按模板补 N/A 占位', () => {
  const md = buildMarkdown({
    project: project({ hostName: '', hostLink: '' }),
    bars: [
      bar({ number: 1 }),
      bar({ number: 3, minutes: 660, timeRaw: '11:00' }),
    ],
    types: TYPES,
  });

  assert.match(md, /### 第2棒 N\/A\n\n创作者 N\/A\n\nN\/A \[查看\]\(N\/A\)/);
  assert.match(md, /主催 \[N\/A\]\(N\/A\)/);
  assert.ok(md.includes('### 第3棒 11:00'));
});

test('关闭补号时不生成占位', () => {
  const md = buildMarkdown({
    project: project(),
    bars: [bar({ number: 1 }), bar({ number: 3, minutes: 660, timeRaw: '11:00' })],
    types: TYPES,
    fillMissingBars: false,
  });
  assert.ok(!md.includes('第2棒'));
});

test('0 棒项目只输出宣传段与两个空节标题', () => {
  const md = buildMarkdown({ project: project({ promotions: [] }), bars: [], types: TYPES });
  const expected = [
    '## 宣传',
    '',
    '主催 [星野](https://space.bilibili.com/1)',
    '',
    '## 整点接力',
    '',
    '## EX棒',
    '',
  ].join('\n');
  assert.equal(md, expected);
});

test('空字段导出为 N/A', () => {
  const md = buildMarkdown({
    project: project({ promotions: [{ url: '' }], extraNotes: [{ label: '总结', url: 'https://s/1' }] }),
    bars: [bar({ authorName: '', authorLink: '', workLink: '', typeId: null })],
    types: TYPES,
  });
  assert.ok(md.includes('终宣：[查看](N/A)'));
  assert.ok(md.includes('总结：[查看](https://s/1)'));
  assert.ok(md.includes('创作者 [@N/A](N/A)'));
  assert.ok(md.includes('N/A [查看](N/A)'));
});

test('跨日时间按原始写法输出', () => {
  const md = buildMarkdown({
    project: project(),
    bars: [bar({ number: 1, minutes: 1547, timeRaw: '25:47' })],
    types: TYPES,
  });
  assert.ok(md.includes('### 第1棒 25:47'));
});

test('宣传编号：十条以内中文，之后宣N，末条终宣', () => {
  assert.equal(promotionLabel(0, 1), '终宣');
  assert.equal(promotionLabel(0, 2), '一宣');
  assert.equal(promotionLabel(1, 2), '终宣');
  assert.equal(promotionLabel(9, 12), '十宣');
  assert.equal(promotionLabel(10, 12), '宣11');
  assert.equal(promotionLabel(11, 12), '终宣');
});

test('文件名取自活动日期年月', () => {
  assert.equal(exportFileName(project()), '晨光创作接力 2026_2026_11.md');
  assert.equal(
    exportFileName(project({ eventDate: null }), new Date(2027, 2, 5)),
    '晨光创作接力 2026_2027_03.md',
  );
});

test('文件末尾不留分隔线', () => {
  const md = buildMarkdown({
    project: project(),
    bars: [bar({ number: 1 }), bar({ kind: 'ex', number: 1 })],
    types: TYPES,
  });
  assert.ok(!md.trimEnd().endsWith('---'));
  assert.ok(md.endsWith('\n'));
});
