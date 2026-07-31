import fs from 'node:fs';
import path from 'node:path';
import { parseYaml, stringifyPlanTree } from './yaml-mini.mjs';
import { readLayout, writeLayout } from './layout-store.mjs';
import { readDoneOrder, doneOrderPath } from './done-order-store.mjs';

function vibeDir(projectRoot) {
  return path.join(projectRoot, 'docs', 'vibe-planning');
}

function trashJsonPath(projectRoot) {
  return path.join(vibeDir(projectRoot), 'trash', 'trash.json');
}

function trashFilesDir(projectRoot, entryId) {
  return path.join(vibeDir(projectRoot), 'trash', 'files', entryId);
}

function normRel(p) {
  return String(p || '').split(path.sep).join('/');
}

function readTrash(projectRoot) {
  const p = trashJsonPath(projectRoot);
  if (!fs.existsSync(p)) return { version: 1, entries: [] };
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!Array.isArray(data.entries)) data.entries = [];
    return data;
  } catch {
    return { version: 1, entries: [] };
  }
}

function writeTrash(projectRoot, data) {
  const p = trashJsonPath(projectRoot);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function makeEntryId(nodeId) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return stamp + '-' + String(nodeId || 'node').replace(/[^\w.-]+/g, '_').slice(0, 40);
}

function moveDocToTrash(projectRoot, entryId, relDoc) {
  const fromRel = normRel(relDoc);
  if (!fromRel || fromRel.startsWith('docs/vibe-planning/trash/')) return null;
  const fromAbs = path.join(projectRoot, ...fromRel.split('/'));
  if (!fs.existsSync(fromAbs) || !fs.statSync(fromAbs).isFile()) return null;
  const toRel = normRel(path.join('docs/vibe-planning/trash/files', entryId, fromRel));
  const toAbs = path.join(projectRoot, ...toRel.split('/'));
  fs.mkdirSync(path.dirname(toAbs), { recursive: true });
  fs.renameSync(fromAbs, toAbs);
  return { from: fromRel, to: toRel };
}

function restoreDoc(projectRoot, moved) {
  if (!moved || !moved.from || !moved.to) return false;
  const fromAbs = path.join(projectRoot, ...normRel(moved.to).split('/'));
  const toAbs = path.join(projectRoot, ...normRel(moved.from).split('/'));
  if (!fs.existsSync(fromAbs)) return false;
  fs.mkdirSync(path.dirname(toAbs), { recursive: true });
  if (fs.existsSync(toAbs)) return false;
  fs.renameSync(fromAbs, toAbs);
  return true;
}

function scrubRefs(tree, id, fallbackParent) {
  const all = [].concat(tree.nodes || [], tree.ghosts || []);
  for (const n of all) {
    if (!n) continue;
    if (n.parent === id) {
      if (fallbackParent) n.parent = fallbackParent;
      else delete n.parent;
    }
    if (Array.isArray(n.dependsOn)) {
      n.dependsOn = n.dependsOn.filter((d) => d && d !== id);
      if (!n.dependsOn.length) delete n.dependsOn;
    }
  }
}

function removeLayoutPos(projectRoot, id) {
  const layout = readLayout(projectRoot);
  if (!layout.positions || !layout.positions[id]) return;
  delete layout.positions[id];
  writeLayout(projectRoot, layout.positions);
}

function removeDoneOrder(projectRoot, id) {
  const order = readDoneOrder(projectRoot);
  if (!order || !order.order || order.order[id] == null) return;
  delete order.order[id];
  fs.writeFileSync(
    doneOrderPath(projectRoot),
    JSON.stringify({ version: 1, order: order.order }, null, 2) + '\n',
    'utf8',
  );
}

export function listTrash(projectRoot) {
  const data = readTrash(projectRoot);
  return {
    ok: true,
    entries: (data.entries || []).slice().sort(function (a, b) {
      return String(b.deletedAt || '').localeCompare(String(a.deletedAt || ''));
    }),
  };
}

export function permanentDelete(projectRoot, yamlFilePath, id) {
  if (!id) return { ok: false, error: 'id required' };
  if (id === 'root') return { ok: false, error: 'cannot delete root' };
  const tree = parseYaml(fs.readFileSync(yamlFilePath, 'utf8'));
  if (!Array.isArray(tree.nodes)) tree.nodes = [];
  if (!Array.isArray(tree.ghosts)) tree.ghosts = [];

  let source = 'nodes';
  let idx = tree.nodes.findIndex((n) => n && n.id === id);
  let node = idx >= 0 ? tree.nodes[idx] : null;
  if (!node) {
    source = 'ghosts';
    idx = tree.ghosts.findIndex((n) => n && n.id === id);
    node = idx >= 0 ? tree.ghosts[idx] : null;
  }
  if (!node) return { ok: false, error: 'node not found' };

  const entryId = makeEntryId(id);
  const movedFiles = [];
  for (const doc of node.docs || []) {
    const moved = moveDocToTrash(projectRoot, entryId, doc);
    if (moved) movedFiles.push(moved);
  }

  const fallbackParent = node.parent || null;
  if (source === 'nodes') tree.nodes.splice(idx, 1);
  else tree.ghosts.splice(idx, 1);
  scrubRefs(tree, id, fallbackParent);

  const entry = {
    entryId,
    deletedAt: new Date().toISOString(),
    source,
    node,
    movedFiles,
  };
  const trash = readTrash(projectRoot);
  trash.entries.push(entry);
  writeTrash(projectRoot, trash);
  fs.writeFileSync(yamlFilePath, stringifyPlanTree(tree), 'utf8');
  try { removeLayoutPos(projectRoot, id); } catch { /* ignore */ }
  try { removeDoneOrder(projectRoot, id); } catch { /* ignore */ }
  return { ok: true, entry };
}

export function restoreTrashEntry(projectRoot, yamlFilePath, entryId) {
  if (!entryId) return { ok: false, error: 'entryId required' };
  const trash = readTrash(projectRoot);
  const idx = (trash.entries || []).findIndex((e) => e && e.entryId === entryId);
  if (idx < 0) return { ok: false, error: 'entry not found' };
  const entry = trash.entries[idx];
  const node = entry.node;
  if (!node || !node.id) return { ok: false, error: 'invalid entry' };

  const tree = parseYaml(fs.readFileSync(yamlFilePath, 'utf8'));
  if (!Array.isArray(tree.nodes)) tree.nodes = [];
  if (!Array.isArray(tree.ghosts)) tree.ghosts = [];
  const exists =
    tree.nodes.some((n) => n && n.id === node.id) ||
    tree.ghosts.some((n) => n && n.id === node.id);
  if (exists) return { ok: false, error: 'node id already exists' };

  const restoredFiles = [];
  for (const m of entry.movedFiles || []) {
    if (restoreDoc(projectRoot, m)) restoredFiles.push(m.from);
  }

  delete node.removed;
  if (entry.source === 'ghosts') tree.ghosts.push(node);
  else tree.nodes.push(node);

  trash.entries.splice(idx, 1);
  writeTrash(projectRoot, trash);
  fs.writeFileSync(yamlFilePath, stringifyPlanTree(tree), 'utf8');

  const filesDir = trashFilesDir(projectRoot, entryId);
  try {
    if (fs.existsSync(filesDir)) fs.rmSync(filesDir, { recursive: true, force: true });
  } catch { /* ignore */ }

  return { ok: true, node, restoredFiles };
}
