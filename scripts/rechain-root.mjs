#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseYaml, stringifyPlanTree } from '../skills/vibe-planning/scripts/lib/yaml-mini.mjs';

const projectRoot = path.resolve(process.argv[2] || '.');
const yamlPath = path.join(projectRoot, 'docs', 'vibe-planning', 'plan-tree.yaml');
const tree = parseYaml(fs.readFileSync(yamlPath, 'utf8'));
if (!Array.isArray(tree.nodes)) tree.nodes = [];

tree.nodes = tree.nodes.filter((n) => n.id !== 'inbox');
const root = tree.nodes.find((n) => !n.parent)?.id || tree.project;
for (const n of tree.nodes) {
  if (n.parent === 'inbox') n.parent = root;
}

const core = tree.nodes.find((n) => n.id === 'aa-sim-core');
const core2 = tree.nodes.find((n) => n.id === 'aa-sim-core-2');
if (core && core2) {
  core.docs = [...new Set([...(core.docs || []), ...(core2.docs || [])])];
  tree.nodes = tree.nodes.filter((n) => n.id !== 'aa-sim-core-2');
  for (const n of tree.nodes) {
    if (!Array.isArray(n.dependsOn)) continue;
    n.dependsOn = [...new Set(n.dependsOn.map((d) => (d === 'aa-sim-core-2' ? 'aa-sim-core' : d)).filter((d) => d && d !== n.id))];
    if (!n.dependsOn.length) delete n.dependsOn;
  }
}

function docDateKey(docPath) {
  const m = String(docPath || '').match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '9999-99-99';
}
function earliestDocDate(n) {
  let best = '9999-99-99';
  for (const d of n.docs || []) {
    const k = docDateKey(d);
    if (k < best) best = k;
  }
  return best;
}
function isDesignish(n) {
  return n.kind === 'spec' || /design/i.test(String(n.id || ''));
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

const skip = new Set([root, 'air-dimension', 'vibe-planning']);
const chain = tree.nodes.filter((n) => n.parent === root && !skip.has(n.id));
const sorted = chain.slice().sort(compareImplOrder);
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

fs.writeFileSync(yamlPath, stringifyPlanTree(tree), 'utf8');
for (const n of sorted) {
  console.log(earliestDocDate(n), n.id, '←', (n.dependsOn || []).join(', ') || '-');
}
