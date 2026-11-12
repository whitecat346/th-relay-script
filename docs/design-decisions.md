# TH-Relay-Note 设计决议清单

> 本文档是 30 条人工决策的落地规范，是实现的**唯一依据**。规格部分的权威顺序：
> **`README.md`（意图与规则） > `doc/ui/*.png`（交互与文案） > `doc/example/*.md`（仅排版参考）**。
> 与示例冲突处均已按 README 裁决，个别地方标注了「与示例不同」。

---

## 1. 范围

- 平台：B 站 **PC 桌面版**三类页面——`/video/BV*`、`/read/cv*`、`/opus/*` 与 `t.bilibili.com/*`。
- 形态：Tampermonkey 用户脚本，右侧贴边入口 + 页内模态管理界面（Shadow DOM 隔离）。
- 不做：手机版、番剧/直播、快捷键、云同步、导出预览。

---

## 2. 数据模型（`schemaVersion: 1`）

存储位置：业务数据 → `GM_setValue('relayNoteData')`；目录句柄 → IndexedDB（`FileSystemDirectoryHandle` 只能存这里）。

```js
{
  schemaVersion: 1,
  projects: [{
    id: 'relay-20261111-1',        // relay-YYYYMMDD-序号
    name: '晨光创作接力 2026',
    hostName: '星野',               // 主催昵称
    hostLink: 'https://space.bilibili.com/10001',
    eventDate: '2026-11-11',       // 活动日期，可为 null
    promotions: [{ url: '...' }],  // 宣传链接，顺序即「一宣/二宣/…/终宣」
    extraNotes: [{ label: '总结', url: '...' }], // 附加标注行
    barOrder: ['barId', ...],      // 仅「保留原棒号」排序时使用，管理页展示顺序
    createdAt: 1762...,
    updatedAt: 1762...
  }],
  bars: [{
    id: 'bar-...',
    projectId: 'relay-20261111-1',
    kind: 'normal' | 'ex',
    number: 12,                    // 正整数，同项目同 kind 内允许重复（仅警告）
    eventDate: '2026-11-11',       // 棒所属日期（用于跨日换算基准）
    minutes: 1547,                 // 当天起算分钟数，可 > 1440，见 §4.3
    timeRaw: '25:47',              // 用户原始输入，导出时原样输出
    authorName: '',
    authorLink: '',
    workLink: '',
    typeId: 'type-illustration',
    createdAt: 1762...,
    updatedAt: 1762...
  }],
  types: [{ id: 'type-illustration', name: '插画' }, ...],
  settings: {
    boundProjectId: 'relay-20261111-1' | null,
    fillMissingBars: true,         // 缺号补 N/A 开关，默认开
    exportMode: 'directory' | 'download',
    panelPosition: 42,             // 贴边入口的纵向百分比
    boundHandleKey: 'relayDirHandle' // IndexedDB key
  }
}
```

读取时跑 `migrate(data)`：`schemaVersion` 小于当前版本 → 先写 `__backup_v{n}` 再迁移。

**预置类型**：`插画 / 视频 / 文章 / MMD`。

---

## 3. 导出文件名

```
<项目名称>_<活动日期年>_<活动日期月补零>.md
例：晨光创作接力 2026_2026_11.md
```

- 年月取自 `project.eventDate`。
- `eventDate` 为空 → 回退用**导出当天**的年月，并在导出弹窗灰字提示「项目缺少活动日期，文件名使用了当天年月」。

---

## 4. 导出格式（精确文法）

### 4.1 整体骨架

```
## 宣传
<空行>
主催 [<主催昵称>](<主催链接或 N/A>)
<空行>
一宣：[查看](<url>)
<空行>
…
<空行>
终宣：[查看](<url>)
<空行>
总结：[查看](<url>)            ← 附加标注行，可 0..n 条
<空行>
## 整点接力
<空行>
### 第1棒 9:00
<空行>
创作者 [@<作者昵称>](<作者链接或 N/A>)
<空行>
<类型名> [查看](<作品链接或 N/A>)
<空行>
---
<空行>
### 第2棒 10:00
…
<空行>
---
<空行>
## EX棒
<空行>
### 第EX1棒 13:44
…
```

规则：

1. **宣传段始终输出**（即使 `promotions` 为空），主催行始终存在。
2. 宣传编号：第 1–10 条为中文数字 `一/二/…/十`，第 11 条起为 `宣11`、`宣12`…；**最后一条永远是 `终宣`**。只有 1 条时直接是 `终宣`。
3. 附加标注行格式 `标签：[查看](链接)`，位置在 `终宣` 之后。
4. `---` **只出现在两个相邻棒之间**：`## EX棒` 标题前有 `---`（普通棒与 EX 棒的边界），**文件末尾不留** `---`。
5. 未知链接一律写 `N/A`（`创作者 [@妖](N/A)` 风格），不省略、不留空。
6. 时间：小时不补零、分钟补两位（`9:00` / `9:05` / `13:44`）；> 24 小时按原始数值输出（`25:47`）；全角冒号归一化为半角。

### 4.2 段标题与空段

- 项目**有**棒时：`## 整点接力` 与 `## EX棒` 两个段标题**始终输出**，即使该段为空（方便手写占位）。
- 项目**一根棒都没有**：宣传段 + `## 整点接力` + `## EX棒` 两个空段标题（用户 2026-11-11 追加指令：「只输出宣传端，其他内容只给节标题以便于后期填写」）。
  - 已定稿：两个段标题**恒输出**，与有棒时一致；实现见 `src/core/export-md.js`，单测 `0 棒项目只输出宣传段与两个空节标题`。

### 4.3 棒的时间与跨日

- 存储 `minutes`（当天起算分钟数），同时存 `timeRaw` 用户原始输入。
- 输入框接受 `25:47`，显示归一化提示「次日 01:47」；`minutes` 上限 5999（99:59）。
- **导出用 `timeRaw`**，即 `25:47` 原样输出。

### 4.4 缺号补齐

- 开关 `settings.fillMissingBars`（默认开，设置页可关）。
- 开启时：普通棒补 `min..max` 区间内的缺号；EX 棒独立补 `min..max` 区间内的缺号。
- 补位棒渲染（与示例不同，按 README:120）：

```
### 第28棒 N/A

创作者 N/A

N/A [查看](N/A)
```

### 4.5 排序

- 导出**严格按棒号升序**：普通棒 `1..max`、EX 棒 `1..max`。
- 「保留原棒号」排序**只影响管理页展示顺序**（`project.barOrder`），不影响导出。
- 同号重复时：按 `minutes` 升序，仍相同则按 `createdAt` 升序。

---

## 5. 导出执行流程

1. 点「导出」→ 若有棒则提示格式，生成 markdown 字符串。
2. `exportMode === 'directory'`：
   - 从句柄恢复目录 → `queryPermission({mode:'readwrite'})`；非 `granted` 则**当场** `requestPermission`（需用户手势，FSA 权限不跨会话持久）。
   - 目录中若已存在目标文件：将其内容复制到 `<name>.md.1`（已存在则 `.2`…），再写新文件。
   - 失败（不支持/拒绝授权）→ 自动回退浏览器下载并提示。
3. `exportMode === 'download'`：`<a download>` 触发下载；**同名文件由浏览器自行加 `(1)` 后缀**，UI 上明确写出这一限制。

---

## 6. 页面抓取

顺序（**不是** DOM 优先）：页面 state → 官方接口 → 结构无关 DOM 探测 → 失败留空。

| 页面 | 首选 | 回退 |
| --- | --- | --- |
| `/video/BV*` | `unsafeWindow.__INITIAL_STATE__.videoData`（`owner.mid/name`、`bvid`、`title`） | `api.bilibili.com/x/web-interface/view?bvid=` |
| `/read/cv*` | `__INITIAL_STATE__.readInfo`（作者路径存疑，多键 try/catch 探测） | `api.bilibili.com/x/article/viewinfo?id=cv*` → `data.mid`、`data.author_name` |
| `/opus/*`、`t.bilibili.com/*` | `__INITIAL_STATE__.detail`（`basic.rid_str` 等） | 接口 `modules[]` 的 `MODULE_TYPE_AUTHOR → module_author.mid/name/jump_url` |

- DOM 回退**只用结构无关写法**：`document.querySelector('a[href*="space.bilibili.com/"]')`，不硬编码未经证实的 class（`#v_upinfo`、`.up-name` 等一律未验证）。
- 全部失败：字段留空 + 面板提示「未识别当前页面，请手动填写」，**不猜、不用页面标题凑**。
- 主页链接由 `mid` 拼 `https://space.bilibili.com/<mid>`。
- 沙箱硬约束：`@grant` 后读页面全局必须走 `unsafeWindow`。

### 6.1 新增棒的预填

- 棒数：同 kind 当前最大号 + 1（允许改成重复号，仅警告）。
- 时间跨日校正：
  - 今天 == 活动日期 → `minutes = 当前时分`
  - 今天 == 活动日期 + 1 → `minutes = 1440 + 当前时分`（凌晨 1 点录得 `25:00`）
  - 其它日期 → 按普通 `HH:mm` 填，提示「与活动日期不一致，请手动确认」

---

## 7. 校验规则

- 项目：`项目名称` **必填**（≤ 40 字）；`主催昵称`、`主催链接`、`活动日期` **选填**（缺日期允许保存，见 §3）。
- 棒：`棒数`、`时间` **必填**；`作者昵称`、`作者链接`、`作品链接`、`类型` **选填**。
- 同项目同 kind 棒号重复：**只警告不阻断**（`第 12 棒已存在`）。

空值在导出中的表现：

| 字段 | 为空时导出 |
| --- | --- |
| 主催昵称 | `主催 N/A` |
| 主催链接 / 作者链接 / 作品链接 | 写 `N/A` 作为链接目标 |
| 作者昵称 | `创作者 [@N/A](N/A)` |
| 类型 | `N/A [查看](链接)` |

---

## 8. UI 清单

| 截图 | 说明 |
| --- | --- |
| 侧边菜单 · 已绑定项目 | 面板头 + 当前绑定卡片 + 4 个入口 |
| 创建接力项目 | 名称/主催昵称/主催链接/活动日期 + 「创建后自动绑定」 |
| 编辑接力项目 | 同上，填充态 |
| 接力棒信息 · 悬浮面板 | 新增棒的完整表单 |
| 编辑接力棒 · 已填充 | 同上，填充态 |
| 项目管理 · 项目详情 | 左侧项目列表 + 右侧统计/搜索/筛选/表格/分页 |
| 接力棒排序 | 重新编排 vs 保留原号 + 拖拽/上下移 + 按时间排序 |
| 设置 · 类型与导出 | 棒类型表 + 增删改 + 导出方式 + 目录 |
| 导出项目 · Markdown | 文件名预览 + 导出位置 + 两个按钮 |
| 删除接力棒 / 删除接力项目 / 删除作品类型 / 编辑作品类型 | 二次确认与迁移弹窗 |

**截图以外新增的两处 UI**（Q4 决策）：
1. 项目编辑弹窗内：**宣传链接列表**（可增删、可拖排序，每行一个 URL）。
2. 同弹窗内：**附加标注行列表**（`标签` + `链接` 两列）。

**交互**：右侧贴边竖排标签「接力收集」，hover 展开、点击固定，可上下拖动（位置存 `settings.panelPosition`），拖到下半屏时向上展开。主色 `#6b5bdb`。暗色适配通过 `documentElement.classList.contains('bili_dark')` 检测并切换 CSS 变量。

**2026-11-12 修订（按用户反馈）**：
- 绑定切换从项目详情的「更换绑定 ⌄」下拉移到**左侧项目栏**：鼠标悬浮未绑定项目时出现「绑定项目」按钮，已绑定项目只显示「当前绑定」徽章、不出现按钮。
- 侧边菜单里的 `›` 文本箭头统一换成 12px 内联 SVG chevron（`chev()`），随文字颜色取 `currentColor`、透明度 0.72。
- 暗色下把 `--trn-border-strong` 从 `#3d3f48` 提到 `#4c4f5b`，作品类型 chip 改用 `--trn-bg-input` 作底色；并修掉 `.trn-root button` 重置规则（改为 `:where(button)`）导致 chip / 次按钮边框被吃掉的问题。

**2026-11-12 修订（第二轮）**：
- 活动日期改用原生 `<input type="date">`（日历控件），值仍是 `YYYY-MM-DD`。
- 接力时间拆成「时」「分」两个输入框（`hourInput` / `minuteInput`），中间冒号 + 右侧「现在」按钮；保存时用 `parseTimeParts()` 合并为 `minutes` / `timeRaw`，跨日（25:47）照常支持。
- 新建棒打开即用 `suggestBarPrefill()` 自动填入当前时间（跨日顺延规则不变），点「现在」可再刷新一次。
- 存储结构未变（仍是 `bar.minutes` + `bar.timeRaw`）。

**列表功能**：搜索（作者/棒号）、筛选（全部/普通棒/EX 棒）、排序下拉（按时间/按棒号）全部实现；分页每页 20 条，不足 20 条时显示「1 / 1」。

---

## 9. 工程结构

```
package.json            # esbuild + node:test
esbuild.config.mjs
src/main.js             # 入口：注入面板、路由监听
src/core/storage.js     # GM_setValue 封装 + migrate
src/core/model.js       # 数据模型与校验
src/core/export-md.js   # 纯函数：项目 → markdown（重点被测）
src/core/export-file.js # FSA + 下载回退
src/core/scrape.js      # 三级回退抓取
src/ui/styles.js        # 内联 CSS（Shadow DOM，含暗色变量）
src/ui/*.js             # 面板 / 各模态
dist/th-relay-note.user.js
test/export-md.test.js
docs/                   # 本文件 + 使用说明
```

元数据：`@name B站接力收集（TH-Relay-Note）`、`@namespace th-relay-note`、`@author whitecat346`、`@version 0.1.0`、`@run-at document-start`、`@match https://www.bilibili.com/*`、`@match https://t.bilibili.com/*`，`@grant GM_setValue/GM_getValue/GM_addValueChangeListener/unsafeWindow`。

`dist/` 提交进仓库；README 追加「安装与使用」一节，不改动原有规格内容。

---

## 10. 测试与验收

- `node:test` 覆盖 `export-md.js`：完整项目、缺号补位、EX 段、跨日时间、空宣传、0 棒、重复号、文件名生成。断言逐字相等。
- 用 `doc/example/` 数据造本地 HTML 夹具自测抓取与 UI。
- **真实 B 站页面验收由用户完成**（涉及登录态，脚本不碰）。

---

## 11. 未验证项与风险

1. 三类页面 `__INITIAL_STATE__` 内 `module_author` / `readInfo.author` 的确切路径**未验证**，需运行期多键探测 + 失败留空。
2. `t.bilibili.com/<id>` 与 `/opus/<id>` 是否等价**未验证**。
3. FSA 在沙箱内需 `unsafeWindow.showDirectoryPicker` 调用，**未实测**；权限每会话重新申请。
4. Firefox 不支持 FSA（全球支持率约 30.6%），下载是主路径之一。
5. Shadow DOM 下字体不继承、滚动条样式受限，需显式 `font-family: inherit` 与自绘滚动条。
6. 暗色判定用 `bili_dark` class；`data-theme` 属性**不存在**，不要用。
