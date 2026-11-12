import { cnNumber, formatTime, pad2 } from './model.js';

const NA = 'N/A';

function link(url, text) {
  const href = String(url || '').trim() || NA;
  return `${text} [查看](${href})`;
}

function barHeading(title, time) {
  const t = String(time || '').trim();
  return `### ${title} ${t || NA}`;
}

function barBlock(bar, types) {
  const authorName = String(bar.authorName || '').trim() || NA;
  const authorLink = String(bar.authorLink || '').trim() || NA;
  const t = (types || []).find((x) => x.id === bar.typeId);
  const typeName = t ? String(t.name || '').trim() || NA : NA;
  const workLink = String(bar.workLink || '').trim() || NA;
  return [
    barHeading(bar.kind === 'ex' ? `第EX${bar.number}棒` : `第${bar.number}棒`, bar.timeRaw || formatTime(bar.minutes)),
    '',
    `创作者 [@${authorName}](${authorLink})`,
    '',
    link(workLink, typeName),
  ];
}

function placeholderBlock(kind, number) {
  const title = kind === 'ex' ? `第EX${number}棒` : `第${number}棒`;
  return [barHeading(title, NA), '', '创作者 N/A', '', link('', NA)];
}

function sortWithin(a, b) {
  if (a.minutes !== b.minutes) return a.minutes - b.minutes;
  return (a.createdAt || 0) - (b.createdAt || 0);
}

function buildSectionBars(bars, kind, fillMissingBars, types) {
  const list = bars.filter((b) => b.kind === kind).sort(sortWithin);
  if (!list.length) return [];
  if (!fillMissingBars) return list.map((b) => barBlock(b, types));
  const blocks = [];
  const max = list.reduce((m, b) => Math.max(m, b.number), 0);
  for (let n = 1; n <= max; n += 1) {
    const same = list.filter((b) => b.number === n);
    if (!same.length) blocks.push(placeholderBlock(kind, n));
    else same.forEach((b) => blocks.push(barBlock(b, types)));
  }
  return blocks;
}

export function promotionLabel(index, total) {
  if (total <= 1) return '终宣';
  if (index === total - 1) return '终宣';
  const n = index + 1;
  return n <= 10 ? `${cnNumber(n)}宣` : `宣${n}`;
}

export function exportFileName(project, now = new Date()) {
  const name = String(project && project.name ? project.name : '未命名项目').trim();
  const date = String((project && project.eventDate) || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const year = m ? m[1] : String(now.getFullYear());
  const month = m ? m[2] : pad2(now.getMonth() + 1);
  return `${name}_${year}_${month}.md`;
}

export function buildMarkdown({ project, bars = [], types = [], fillMissingBars = true }) {
  const hostName = String(project && project.hostName ? project.hostName : '').trim() || NA;
  const hostLink = String(project && project.hostLink ? project.hostLink : '').trim() || NA;
  const promotions = (project && project.promotions) || [];
  const extraNotes = (project && project.extraNotes) || [];

  const out = [];
  out.push('## 宣传');
  out.push('');
  out.push(`主催 [${hostName}](${hostLink})`);
  promotions.forEach((p, i) => {
    out.push('');
    out.push(`${promotionLabel(i, promotions.length)}：[查看](${String(p.url || '').trim() || NA})`);
  });
  extraNotes.forEach((n) => {
    out.push('');
    out.push(`${String(n.label || '').trim() || '标注'}：[查看](${String(n.url || '').trim() || NA})`);
  });

  out.push('');
  out.push('## 整点接力');

  const normalBlocks = buildSectionBars(bars, 'normal', fillMissingBars, types);
  const exBlocks = buildSectionBars(bars, 'ex', fillMissingBars, types);

  if (normalBlocks.length) {
    normalBlocks.forEach((block, i) => {
      if (i > 0) {
        out.push('');
        out.push('---');
      }
      out.push('');
      out.push(...block);
    });
  }

  out.push('');
  if (normalBlocks.length) {
    out.push('---');
    out.push('');
  }
  out.push('## EX棒');

  exBlocks.forEach((block, i) => {
    if (i > 0) {
      out.push('');
      out.push('---');
    }
    out.push('');
    out.push(...block);
  });

  return `${out.join('\n')}\n`;
}

export function missingNumbers(bars, kind) {
  const nums = bars.filter((b) => b.kind === kind).map((b) => b.number);
  if (!nums.length) return [];
  const max = Math.max(...nums);
  const set = new Set(nums);
  const miss = [];
  for (let n = 1; n <= max; n += 1) if (!set.has(n)) miss.push(n);
  return miss;
}
