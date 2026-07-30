/**
 * vibe-planning repo sync: walk docs, git log, heuristic plan-tree updates.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseYaml, stringifyPlanTree } from './yaml-mini.mjs';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', 'coverage']);
const STATUS_RANK = {
  idea: 1,
  proposed: 2,
  planned: 3,
  doing: 4,
  done: 5,
  deferred: 6,
  cancelled: 7,
};

function readText(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

function walkMd(root, base = root, out = []) {
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return out; }
  for (const ent of entries) {
    if (ent.name === 'board.html') continue;
    const abs = path.join(root, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      walkMd(abs, base, out);
    } else if (ent.isFile() && ent.name.endsWith('.md')) {
      const rel = path.relative(base, abs).split(path.sep).join('/');
      if (rel.startsWith('docs/')) out.push(rel);
    }
  }
  return out;
}

function collectPlanningDocs(projectRoot) {
  const docsRoot = path.join(projectRoot, 'docs');
  if (!fs.existsSync(docsRoot)) return [];
  const all = walkMd(docsRoot, projectRoot);
  return all.filter((rel) => {
    if (rel === 'docs/vibe-planning/sync-prompt.md') return false;
    if (rel === 'docs/vibe-planning/ai-sync-prompt.md') return false;
    if (rel.startsWith('docs/vibe-planning/') && rel.endsWith('.md') && !rel.includes('/')) return true;
    return (
      rel.startsWith('docs/') &&
      (rel.includes('/specs/') ||
        rel.includes('/plans/') ||
        rel.includes('/superpowers/') ||
        /-(design|plan|spec|roadmap)\.md$/i.test(rel) ||
        rel.endsWith('.md'))
    );
  });
}

function linkedDocs(tree) {
  const linked = new Set();
  for (const n of tree.nodes || []) {
    for (const d of n.docs || []) linked.add(d.split(path.sep).join('/'));
  }
  return linked;
}

function classifyOrphans(projectRoot, linked) {
  const docs = collectPlanningDocs(projectRoot);
  const orphans = docs.filter((d) => !linked.has(d));
  const clearOrphans = [];
  const ambiguousOrphans = [];
  for (const d of orphans) {
    if (isClearDesignOrPlan(d)) clearOrphans.push(d);
    else ambiguousOrphans.push(d);
  }
  return { docs, orphans, clearOrphans, ambiguousOrphans };
}

/**
 * Read-only scan → detailed prompt for an LLM to sync/complete plan-tree.
 * Does NOT mutate plan-tree.yaml. Optionally writes ai-sync-prompt.md.
 * @param {string} projectRoot
 * @param {{ writeFile?: boolean }} [options]
 * @returns {{ ok: boolean, prompt: string, promptPath: string, summary?: string }}
 */
export function buildAiSyncPrompt(projectRoot, options = {}) {
  const root = path.resolve(projectRoot);
  const yamlPath = path.join(root, 'docs', 'vibe-planning', 'plan-tree.yaml');
  const promptPath = path.join(root, 'docs', 'vibe-planning', 'ai-sync-prompt.md');
  const promptPathPosix = promptPath.split(path.sep).join('/');

  if (!fs.existsSync(yamlPath)) {
    return {
      ok: false,
      prompt: '',
      promptPath: promptPathPosix,
      summary: '缺少 plan-tree.yaml',
    };
  }

  const yamlRaw = fs.readFileSync(yamlPath, 'utf8');
  const tree = parseYaml(yamlRaw);
  if (!Array.isArray(tree.nodes)) tree.nodes = [];
  if (!Array.isArray(tree.ghosts)) tree.ghosts = [];

  const linked = linkedDocs(tree);
  const { clearOrphans, ambiguousOrphans } = classifyOrphans(root, linked);
  const git = gitLog(root);
  const project = tree.project || path.basename(root);
  const generatedAt = new Date().toISOString();

  const listOrEmpty = (arr) =>
    arr.length ? arr.map((d) => `- ${d}`).join('\n') : '- （无）';

  const prompt = [
    '# vibe-planning AI sync prompt',
    '',
    `生成时间: ${generatedAt}`,
    `项目: ${project}`,
    '',
    '---',
    '',
    '## 指令 / Instructions',
    '',
    '请先调用 / 遵循 Cursor skill：**vibe-planning**（English: invoke the vibe-planning skill）。',
    '',
    '硬性规则：',
    '1. **文档是唯一真相源**（docs = source of truth）；`docs/vibe-planning/plan-tree.yaml` 只是索引/缓存。',
    '2. 根据下方扫描结果更新 `docs/vibe-planning/plan-tree.yaml`（status / parent / dependsOn / docs / 新节点）。',
    '3. **禁止编造不存在的文件路径**；`docs:` 只能引用真实存在的路径。',
    '4. 改完 YAML 后重新 render / 让看板 reload（HTTP serve 会 SSE 刷新）。',
    '',
    '## 目标 / Goals',
    '',
    '- 根据已挂接文档对齐各节点 `status`（done / doing / planned / proposed / deferred / cancelled / idea）',
    '- 安置孤儿文档：能归类则挂合适 parent；否则挂项目根，按文档日期（实现顺序）串联 `dependsOn`（禁止 inbox）',
    '- 合理设置 `parent`（树）与 `dependsOn`（依赖边）；design→plan 保留，其余按实现序链式连接',
    '- 结合近期 git 提交，把已交付标 `done`、暂缓标 `deferred`；勿凭空发明功能',
    '- 模糊孤儿仅在有把握时挂接，否则保留说明供人工处理',
    '',
    '## 当前 plan-tree.yaml（全文）',
    '',
    '```yaml',
    yamlRaw.trimEnd(),
    '```',
    '',
    '## 清晰孤儿文档（design/plan/spec 路径未挂接）',
    '',
    listOrEmpty(clearOrphans),
    '',
    '## 模糊孤儿文档（路径未挂接，需判断是否入库）',
    '',
    listOrEmpty(ambiguousOrphans),
    '',
    '## 最近提交（git log --oneline -n 80）',
    '',
    '```',
    git.oneline || '(empty)',
    '```',
    '',
    git.names
      ? [
          '## 最近提交涉及文件（name-only 节选）',
          '',
          '```',
          git.names.slice(0, 6000),
          '```',
          '',
        ].join('\n')
      : '',
    '## 回复检查清单 / Reply checklist',
    '',
    '请在回复中完成：',
    '1. **改了什么**：列出对 `plan-tree.yaml` 的具体变更（节点 id、status、parent、dependsOn、docs）',
    '2. **孤儿处理**：每个清晰孤儿如何挂接；模糊孤儿采纳/跳过及理由',
    '3. **git 依据**：哪些提交支撑 done/deferred/doing 判断',
    '4. **摘要**：一段话说明树现在的结构与下一步建议',
    '5. 确认已写入 YAML，且未编造文件路径',
    '',
  ].join('\n');

  if (options.writeFile !== false) {
    fs.mkdirSync(path.dirname(promptPath), { recursive: true });
    fs.writeFileSync(promptPath, prompt, 'utf8');
  }

  return {
    ok: true,
    prompt,
    promptPath: promptPathPosix,
    summary: `AI sync prompt 已生成（清晰孤儿 ${clearOrphans.length}，模糊孤儿 ${ambiguousOrphans.length}）`,
  };
}

function isClearDesignOrPlan(rel) {
  return (
    /-(design|plan)\.md$/i.test(rel) ||
    rel.includes('/superpowers/specs/') ||
    rel.includes('/superpowers/plans/')
  );
}

function slugFromDoc(rel) {
  const base = path.basename(rel, '.md')
    .replace(/^\d{4}-\d{2}-\d{2}-/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return base || 'doc';
}

function titleFromDoc(abs, fallback) {
  const text = readText(abs);
  const m = text.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : fallback;
}

function alignStatusFromDoc(rel, text) {
  const lower = text.toLowerCase();
  const pathLower = rel.toLowerCase();

  // Whole-doc cancel/defer only — ignore 「做/不做」表格与局部 out-of-scope
  const wholeCancel =
    /(^|\n)\s*(status|状态)\s*[:：]\s*(cancelled|canceled|取消)\b/i.test(text) ||
    /(本文|本方案|本设计|本计划|此功能|整个).{0,12}(取消|不做|won't)/i.test(text) ||
    /\b(cancelled|won't do|out of scope)\b.{0,20}(entire|whole|this (spec|plan|feature))/i.test(lower);
  const wholeDefer =
    /(^|\n)\s*(status|状态)\s*[:：]\s*(deferred|延后|暂缓)\b/i.test(text) ||
    /(本文|本方案|本设计|本计划|此功能).{0,12}(延后|以后再说|postponed|deferred|暂不做)/i.test(text);

  const checks = [...text.matchAll(/-\s\[([ xX])\]/g)];
  const checked = checks.filter((m) => m[1].toLowerCase() === 'x').length;
  const unchecked = checks.length - checked;
  const strongDone =
    /(已交付|闸门全绿|shipped|已完成)/i.test(text) ||
    (checks.length >= 3 && checked >= unchecked && checked > 0);

  if (wholeCancel && !strongDone) return 'cancelled';
  if (wholeDefer && !strongDone) return 'deferred';

  if (strongDone || /\bdone\b/i.test(text)) return 'done';
  if (/(进行中|in progress|\bwip\b)/i.test(lower)) return 'doing';
  if (pathLower.includes('/plans/') || /implementation plan/i.test(text)) return 'planned';
  if (pathLower.includes('/specs/') || /(设计|design)/i.test(text)) return 'proposed';
  return 'idea';
}

function mergeStatus(current, next) {
  if (!next) return current || 'idea';
  if (!current) return next;
  // cancelled/deferred only stick if not contradicted by lifecycle progress
  if ((next === 'cancelled' || next === 'deferred') &&
      ['done', 'doing', 'planned', 'proposed'].includes(current)) {
    return current;
  }
  if ((current === 'cancelled' || current === 'deferred') &&
      ['done', 'doing', 'planned', 'proposed'].includes(next)) {
    return next;
  }
  const cr = STATUS_RANK[current] || 0;
  const nr = STATUS_RANK[next] || 0;
  const lifecycle = (s) => (STATUS_RANK[s] || 0) <= STATUS_RANK.done;
  if (lifecycle(current) && lifecycle(next)) return nr >= cr ? next : current;
  return nr >= cr ? next : current;
}

function gitLog(projectRoot) {
  try {
    const oneline = execFileSync('git', ['log', '--oneline', '-n', '80'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    let names = '';
    try {
      names = execFileSync('git', ['log', '--name-only', '--pretty=format:%h %s', '-n', '25'], {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch { /* optional */ }
    return { oneline, names };
  } catch {
    return { oneline: '(git log unavailable)', names: '' };
  }
}

function rootNodeId(tree) {
  const root = tree.nodes.find((n) => !n.parent || n.parent === null || n.parent === 'null')
    || tree.nodes[0];
  return root ? root.id : null;
}

function docDateKey(docPath) {
  const m = String(docPath || '').match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '9999-99-99';
}

function earliestDocDate(n) {
  const docs = Array.isArray(n.docs) ? n.docs : [];
  let best = '9999-99-99';
  for (const d of docs) {
    const k = docDateKey(d);
    if (k < best) best = k;
  }
  return best;
}

function isDesignish(n) {
  const id = String(n.id || '');
  return n.kind === 'spec' || /design/i.test(id) || /-design$/i.test(id);
}

function nodeStem(n) {
  return String(n.id || '').replace(/-design$/i, '');
}

function compareImplOrder(a, b) {
  const da = earliestDocDate(a);
  const db = earliestDocDate(b);
  if (da !== db) return da.localeCompare(db);
  const sa = nodeStem(a);
  const sb = nodeStem(b);
  if (sa !== sb) return sa.localeCompare(sb);
  if (isDesignish(a) !== isDesignish(b)) return isDesignish(a) ? -1 : 1;
  return String(a.id).localeCompare(String(b.id));
}

/** Rebuild peer dependsOn by impl order; keep deps outside the set; design→plan; no cycles. */
function chainByImplOrder(nodes) {
  const sorted = nodes.slice().sort(compareImplOrder);
  const indexOf = new Map(sorted.map((n, i) => [n.id, i]));
  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i];
    const external = (Array.isArray(n.dependsOn) ? n.dependsOn : [])
      .filter((d) => d && d !== n.id && !indexOf.has(d));
    let deps = external.slice();
    if (!isDesignish(n) && indexOf.has(n.id + '-design') && indexOf.get(n.id + '-design') < i) {
      deps.unshift(n.id + '-design');
    } else if (i > 0) {
      deps.unshift(sorted[i - 1].id);
    }
    const seen = new Set();
    deps = deps.filter((d) => (seen.has(d) ? false : (seen.add(d), true)));
    if (deps.length) n.dependsOn = deps;
    else delete n.dependsOn;
  }
  return sorted;
}

/** Remove inbox; hang former children on root; chain by doc date. */
function dissolveInbox(tree, changes) {
  const inboxIdx = tree.nodes.findIndex((n) => n.id === 'inbox');
  if (inboxIdx < 0) return;
  const root = rootNodeId(tree);
  const kids = tree.nodes.filter((n) => n.parent === 'inbox');
  for (const n of kids) {
    n.parent = root || undefined;
  }
  tree.nodes = tree.nodes.filter((n) => n.id !== 'inbox');
  if (kids.length) chainByImplOrder(kids);
  changes.push('移除 inbox；原孤儿挂根并按实现顺序串联 dependsOn');
}

function uniqueId(base, used) {
  let id = base;
  let n = 2;
  while (used.has(id)) {
    id = base + '-' + n;
    n++;
  }
  used.add(id);
  return id;
}

/**
 * @param {string} projectRoot
 * @returns {{ ok: boolean, updated: boolean, promptPath: string, summary: string, tree: object }}
 */
export function runSync(projectRoot) {
  const root = path.resolve(projectRoot);
  const yamlPath = path.join(root, 'docs', 'vibe-planning', 'plan-tree.yaml');
  const promptPath = path.join(root, 'docs', 'vibe-planning', 'sync-prompt.md');
  if (!fs.existsSync(yamlPath)) {
    return {
      ok: false,
      updated: false,
      promptPath,
      summary: '缺少 plan-tree.yaml',
      tree: null,
    };
  }

  const raw = fs.readFileSync(yamlPath, 'utf8');
  const tree = parseYaml(raw);
  if (!Array.isArray(tree.nodes)) tree.nodes = [];
  if (!Array.isArray(tree.ghosts)) tree.ghosts = [];

  const changes = [];
  const linked = linkedDocs(tree);

  for (const n of tree.nodes) {
    if (!n.docs || !n.docs.length) continue;
    const prev = n.status || 'idea';
    let best = prev;
    let via = null;
    for (const d of n.docs) {
      const abs = path.join(root, d);
      if (!fs.existsSync(abs)) continue;
      const st = alignStatusFromDoc(d, readText(abs));
      const merged = mergeStatus(best, st);
      if (merged !== best) { best = merged; via = d; }
    }
    if (best !== prev) {
      changes.push(`状态 ${n.id}: ${prev} → ${best}` + (via ? `（据 ${via}）` : ''));
      n.status = best;
    }
  }

  dissolveInbox(tree, changes);

  const { clearOrphans, ambiguousOrphans } = classifyOrphans(root, linked);

  const usedIds = new Set(tree.nodes.map((n) => n.id));
  const rootId = rootNodeId(tree);
  let added = 0;
  const created = [];
  if (clearOrphans.length) {
    const sortedDocs = clearOrphans.slice().sort((a, b) => {
      const da = docDateKey(a);
      const db = docDateKey(b);
      if (da !== db) return da < db ? -1 : 1;
      return a.localeCompare(b);
    });
    for (const d of sortedDocs) {
      const base = slugFromDoc(d);
      const id = uniqueId(base, usedIds);
      const title = titleFromDoc(path.join(root, d), base);
      const status = alignStatusFromDoc(d, readText(path.join(root, d)));
      const kind = d.includes('/plans/') ? 'plan' : d.includes('/specs/') ? 'spec' : 'backlog';
      const node = {
        id,
        title,
        status: status === 'idea' ? 'proposed' : status,
        kind,
        parent: rootId || undefined,
        docs: [d],
        notes: 'sync 自动发现；按实现顺序挂根',
      };
      tree.nodes.push(node);
      created.push(node);
      added++;
      changes.push(`新增节点 ${id} ← ${d}`);
    }
    // Tip: last existing root child by impl order (excluding just-created)
    const createdIds = new Set(created.map((n) => n.id));
    const tips = tree.nodes
      .filter((n) => n.parent === rootId && !createdIds.has(n.id) && n.id !== rootId)
      .sort(compareImplOrder);
    const tip = tips.length ? tips[tips.length - 1].id : null;
    if (tip && created[0]) {
      const d0 = Array.isArray(created[0].dependsOn) ? created[0].dependsOn : [];
      if (!d0.includes(tip)) created[0].dependsOn = [tip, ...d0];
    }
    chainByImplOrder(created);
  }

  const git = gitLog(root);
  const updated = changes.length > 0;
  if (updated) {
    fs.writeFileSync(yamlPath, stringifyPlanTree(tree), 'utf8');
  }

  const summary = updated
    ? `同步完成：${changes.length} 项变更（新增 ${added} 节点）`
    : `同步完成：无 YAML 变更；孤儿待审 ${ambiguousOrphans.length + clearOrphans.length - added}`;

  const prompt = [
    '# vibe-planning sync-prompt',
    '',
    `生成时间: ${new Date().toISOString()}`,
    `项目: ${tree.project || path.basename(root)}`,
    '',
    '## 变更摘要',
    '',
    changes.length ? changes.map((c) => `- ${c}`).join('\n') : '- （无自动写入变更）',
    '',
    '## 清晰孤儿文档（已挂根并按实现顺序串联）',
    '',
    clearOrphans.length ? clearOrphans.map((d) => `- ${d}`).join('\n') : '- （无）',
    '',
    '## 模糊孤儿文档（仅列表，请人工/AI 整理）',
    '',
    ambiguousOrphans.length ? ambiguousOrphans.map((d) => `- ${d}`).join('\n') : '- （无）',
    '',
    '## 最近提交（git log --oneline -n 80）',
    '',
    '```',
    git.oneline || '(empty)',
    '```',
    '',
    git.names
      ? ['## 最近提交涉及文件（节选）', '', '```', git.names.slice(0, 4000), '```', ''].join('\n')
      : '',
    '## 可贴提示词',
    '',
    '请用 vibe-planning 根据下列扫描结果整理 plan-tree：',
    '',
    '1. 核对上方「变更摘要」是否合理，修正错误的 status / parent / dependsOn',
    '2. 处理「模糊孤儿文档」：挂到合适节点或新建节点，禁止编造不存在的路径',
    '3. 结合最近提交，标出应推进 / 应延后的节点',
    '4. 更新 `docs/vibe-planning/plan-tree.yaml` 后说明变更要点',
    '',
    '### 扫描数据',
    '',
    '- 清晰孤儿:',
    ...clearOrphans.map((d) => `  - ${d}`),
    '- 模糊孤儿:',
    ...ambiguousOrphans.map((d) => `  - ${d}`),
    '- 自动变更:',
    ...changes.map((c) => `  - ${c}`),
    '',
  ].join('\n');

  fs.mkdirSync(path.dirname(promptPath), { recursive: true });
  fs.writeFileSync(promptPath, prompt, 'utf8');

  return {
    ok: true,
    updated,
    promptPath: promptPath.split(path.sep).join('/'),
    summary,
    tree,
    changes,
  };
}
