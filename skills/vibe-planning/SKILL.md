---
name: vibe-planning
version: 1.1.19
description: >-
  Maintains a doc-backed dependency graph for product planning: indexes specs/plans
  in plan-tree.yaml, aligns cached status from linked docs, suggests next work from
  a node as ghost children, serves a live hierarchical HTML board over HTTP, and
  syncs the tree from repo docs/git. Use when the user mentions vibe-planning,
  plan-tree, dependency board, HTTP server, 「同步」, 「重排」, sync-prompt, 「从此处建议」,
  align board, ghost nodes, or wants a roadmapped-style deps view without installing
  roadmapped.
disable-model-invocation: true
metadata:
  version: "1.1.19"
---

# vibe-planning

**版本 1.1.19**

文档（specs/plans/roadmaps）是**唯一真相源**。`plan-tree.yaml` 是索引/缓存，供看板展示与交互；文档与 YAML 冲突时以文档扫描结果为准。

详细 schema / 状态规则 / align 启发 → [reference.md](reference.md)

## 路径约定

- 项目目录：`<project>/docs/vibe-planning/`
- 索引：`plan-tree.yaml`
- 布局：`layout.json`（节点拖拽坐标，与 plan-tree 分离）
- 完成序：`done-order.json`（每行最多 5 个、最多显示 5 行，超出用上下三角滚动；悬停高亮同号；缺省按 docs 日期启发）ne 节点右上角可多个序号：自身完成波次 + 子孙完成波次上卷；每行最多 5 个；缺省按 docs 日期启发）
- 看板：HTTP 实时服务（主路径）；可选静态 `board.html`
- 同步提示：`sync-prompt.md` + `ai-sync-prompt.md`（看板「同步」一次生成，弹窗可复制）
- 技能根目录：本 `SKILL.md` 所在目录（记为 `<skill>`）
- 技能脚本：`<skill>/scripts/serve.mjs`、`render-board.mjs`、`lib/*`
- 模板：`<skill>/assets/board.template.html`
- 安装：`npx skills add Heliostest/vibe-planning`（或仓库 `install.sh` / `install.ps1`）
- 运行时：Node.js ≥ 18（零 npm 依赖）

## 工作流

### 1. init

若 `<project>/docs/vibe-planning/` 不存在：

1. 创建目录
2. 写入最小 `plan-tree.yaml`（`version: 1`、`project`、`nodes` 含 root、`ghosts: []`）
3. 启动 serve（见下）

### 2. ingest / link

把已有 docs 挂进索引：

1. 读 docs 标题与结论，新建或更新 `nodes[]`
2. `docs:` 写相对项目根的路径；**禁止编造不存在的文件**
3. 设 `parent`（树）与 `dependsOn`（图边）
4. `status` 先按文档信号估（见 align），不确定用 `idea` / `proposed`
5. 看板会自动 reload（SSE / 轮询）

### 3. align

扫描每个节点 `docs[]`，更新 YAML 缓存状态：

| 文档信号 | status |
|---|---|
| 明确「不做 / 取消 / won't」 | `cancelled` 或 `deferred`（看语气） |
| 「延后 / 以后 / postponed / deferred」 | `deferred` |
| 勾选完成 / Done / 已交付 / 闸门全绿 | `done` |
| 有 implementation plan 且未完成 | `planned` |
| 有 design/spec 草稿 | `proposed` |
| 正文写「进行中 / in progress」 | `doing` |
| 仅粗想法 | `idea` |

规则：

- 文档 > YAML；冲突时改 YAML
- 不发明 docs
- 多个信号冲突时取更「靠后」的生命周期（done > doing > planned > proposed > idea）；`cancelled`/`deferred` 仅在文档显式声明时覆盖

也可用看板 **「同步」** 做启发式 align + 孤儿文档入库。

### 4. suggest-from(nodeId) — Mode B

1. 读源节点 + 其 `docs[]`
2. 产出：
   - **简要推进提示词**（中文，可直接粘贴开新对话）
   - **2–3 个 ghost 节点**：`id` 前缀 `ghost-`，`status: idea`，`parent`/`dependsOn` 指向源节点
3. 写入 `plan-tree.yaml` 的 `ghosts:`；看板自动 reload
4. 请用户选择保留哪些
5. **确认后**：看板选中 ghost 点「推进」→ `POST /api/promote-ghost` 升为正式 `nodes`（`status: idea`，去掉 `ghost-` 前缀）；或手写 YAML / 清空其余 `ghosts`
6. **拒绝**：清空 `ghosts`
7. **禁止**在用户确认前把 ghost 写成正式节点

剪贴板请求格式（看板「从此处建议」也会生成同类文本）：

```
vibe-planning:suggest-from
project: <project>
nodeId: <id>
title: <title>
```

### 5. serve（主路径）

```bash
node "<skill>/scripts/serve.mjs" "<projectRoot>" --port 7465 --open
# 或（已 clone / npx github 包）：
npx --yes github:Heliostest/vibe-planning serve "<projectRoot>" --open
```

- 看板：默认 `http://localhost:7465/`；端口占用时自动 +1（最多尝试 30 次）
- 启动时打印实际 URL；`--open` 跨平台打开浏览器
- 零 npm 依赖；YAML 助手在 `scripts/lib/yaml-mini.mjs`
- API：`GET /api/tree`、`GET/POST /api/layout`、`POST /api/relayout`、`GET /api/health`、`GET /api/events`（SSE `reload`）、`POST /api/sync`、`POST /api/promote-ghost`、`POST /api/propose-ghost`、`POST /api/soft-delete`、`GET /api/sync-prompt`
- 看板加载后拉 `/api/tree` + `/api/layout` 重绘；拖拽位置写入 `layout.json`；「重排」写整表 layout；SSE + 每 2s 轮询

解析 `<skill>`：Cursor/Claude 下通常为 `~/.cursor/skills/vibe-planning` 或项目内 `.cursor/skills/vibe-planning`；也可用 `node <repo>/bin/vibe-planning.mjs skill-path`。

### 6. sync（看板按钮或脚本）

看板标题栏 **「同步」** → `POST /api/sync` → `runSync` + `buildAiSyncPrompt`：

1. 扫描规划文档（`docs/**/*.md`，优先 specs/plans；跳过 `node_modules`/`.git`/`dist`/`board.html`）
2. `git log --oneline -n 80`（及近期 name-only）
3. 按 align 规则更新已有节点 status；清晰孤儿挂项目根，按文档日期串联 `dependsOn`；模糊孤儿只写入提示
4. 写 `sync-prompt.md` + `ai-sync-prompt.md`；响应带 `prompt`，看板弹窗可复制
5. 保存 YAML；SSE 通知看板 reload

看板 **「重排」** → `POST /api/relayout` `{ mode: tree|radial }`：树状或圆形蜘蛛网；设置中切换（`vibe-planning.layoutMode`）。

### 7. render（可选静态导出）

```bash
node "<skill>/scripts/render-board.mjs" "<project>/docs/vibe-planning/plan-tree.yaml"
```

输出同目录 `board.html`（内嵌 bootstrap `PLAN_TREE`）。日常优先用 serve。

## 看板行为（给用户说明）

- 主视图：vis-network 依赖图（barnesHut 稳定后冻结）；`parent` 实线、`dependsOn` 淡虚线
- 节点颜色按 status（见 reference 色板）
- **节点悬停/选中**：上方浮动工具栏「提议 / 推进 / 删除」；「提议」弹层左下角为「启发」；ghost 上「推进→构想」经 `/api/promote-ghost` 升为正式节点；提示词含现有节点列表并要求补全 `dependsOn`
- 标题栏：**「同步」**、**「重排」**；侧栏：**「从此处建议」**（复用 inspire 提示词）
- 设置弹窗可选界面语言（`zh-CN`/`en`，`localStorage`：`vibe-planning.locale`）；节点内容语言不变
- 同步后弹窗展示可贴 LLM 提示词；meta/toast 显示摘要

## 状态色板（速查）

| status | 视觉 |
|---|---|
| idea | 蓝描边 |
| proposed | 实心蓝 |
| planned | 紫 |
| doing | 琥珀 |
| done | 绿 |
| deferred | 虚线琥珀/棕 |
| cancelled | 灰 + 删除线 |

## 锁定决策（勿重开）

- 文档 = 真相源；YAML = 索引缓存
- 主 UI = 依赖树图（灵感来自 roadmapped deps，**不是**移植）
- Mode B：先 ghost + 短提示词，确认后再写正式 YAML
- 不向项目安装 roadmapped
- 日常用 HTTP serve，不用 file://
