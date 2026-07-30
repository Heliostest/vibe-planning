import fs from 'node:fs';
import { parseYaml, stringifyPlanTree } from './yaml-mini.mjs';

function uniqueNodeId(baseId, existingIds) {
  if (!existingIds.has(baseId)) return baseId;
  let n = 2;
  while (existingIds.has(baseId + '-' + n)) n++;
  return baseId + '-' + n;
}

export function promoteGhostInTree(tree, ghostId) {
  if (!Array.isArray(tree.ghosts)) tree.ghosts = [];
  if (!Array.isArray(tree.nodes)) tree.nodes = [];
  const idx = tree.ghosts.findIndex((g) => g && g.id === ghostId);
  if (idx < 0) return { ok: false, error: 'ghost not found' };
  const ghost = tree.ghosts[idx];
  let baseId = String(ghost.id || '');
  if (baseId.startsWith('ghost-')) baseId = baseId.slice(6);
  if (!baseId) baseId = 'node';
  const existing = new Set(tree.nodes.map((n) => n && n.id).filter(Boolean));
  const id = uniqueNodeId(baseId, existing);
  const node = {
    id,
    title: ghost.title != null ? ghost.title : id,
    status: 'idea',
    kind: ghost.kind || 'backlog',
  };
  if (ghost.parent != null) node.parent = ghost.parent;
  if (ghost.dependsOn != null) node.dependsOn = ghost.dependsOn;
  if (ghost.docs != null) node.docs = ghost.docs;
  if (ghost.notes != null) node.notes = ghost.notes;
  tree.ghosts.splice(idx, 1);
  tree.nodes.push(node);
  return { ok: true, node };
}

export function promoteGhost(yamlFilePath, ghostId) {
  const tree = parseYaml(fs.readFileSync(yamlFilePath, 'utf8'));
  const result = promoteGhostInTree(tree, ghostId);
  if (!result.ok) return result;
  fs.writeFileSync(yamlFilePath, stringifyPlanTree(tree), 'utf8');
  return { ok: true, node: result.node };
}
