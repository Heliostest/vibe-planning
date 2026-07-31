import fs from 'node:fs';
import { parseYaml, stringifyPlanTree } from './yaml-mini.mjs';

function summarizeTitle(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '新提议';
  const first = (t.split(/[。！？\n.!?;；]/)[0] || t).trim() || t;
  if (first.length <= 36) return first;
  return first.slice(0, 36) + '…';
}

function slugify(text) {
  const ascii = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28);
  if (ascii.length >= 2) return ascii;
  return 'idea-' + Date.now().toString(36);
}

function uniqueGhostId(base, existing) {
  let id = 'ghost-' + base;
  if (!existing.has(id)) return id;
  let n = 2;
  while (existing.has(id + '-' + n)) n++;
  return id + '-' + n;
}

export function proposeGhostInTree(tree, { sourceId, text }) {
  if (!Array.isArray(tree.nodes)) tree.nodes = [];
  if (!Array.isArray(tree.ghosts)) tree.ghosts = [];
  const src =
    tree.nodes.find((n) => n && n.id === sourceId) ||
    tree.ghosts.find((n) => n && n.id === sourceId);
  if (!src) return { ok: false, error: 'source not found' };
  const body = String(text || '').trim();
  if (!body) return { ok: false, error: 'text required' };

  const title = summarizeTitle(body);
  const existing = new Set(
    []
      .concat(tree.nodes, tree.ghosts)
      .map((n) => n && n.id)
      .filter(Boolean),
  );
  const id = uniqueGhostId(slugify(title), existing);
  const ghost = {
    id,
    title,
    status: 'idea',
    kind: 'backlog',
    parent: sourceId,
    dependsOn: [sourceId],
    notes: body,
  };
  tree.ghosts.push(ghost);
  return { ok: true, ghost };
}

export function proposeGhost(yamlFilePath, opts) {
  const tree = parseYaml(fs.readFileSync(yamlFilePath, 'utf8'));
  const result = proposeGhostInTree(tree, opts || {});
  if (!result.ok) return result;
  fs.writeFileSync(yamlFilePath, stringifyPlanTree(tree), 'utf8');
  return result;
}

export function toggleRemovedInTree(tree, id) {
  if (!Array.isArray(tree.nodes)) tree.nodes = [];
  if (!Array.isArray(tree.ghosts)) tree.ghosts = [];
  const node =
    tree.nodes.find((n) => n && n.id === id) ||
    tree.ghosts.find((n) => n && n.id === id);
  if (!node) return { ok: false, error: 'node not found' };
  if (node.removed) {
    delete node.removed;
    return { ok: true, removed: false, node };
  }
  node.removed = true;
  return { ok: true, removed: true, node };
}

export function toggleRemoved(yamlFilePath, id) {
  const tree = parseYaml(fs.readFileSync(yamlFilePath, 'utf8'));
  const result = toggleRemovedInTree(tree, id);
  if (!result.ok) return result;
  fs.writeFileSync(yamlFilePath, stringifyPlanTree(tree), 'utf8');
  return result;
}
