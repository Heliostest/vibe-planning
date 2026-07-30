#!/usr/bin/env node
/**
 * vibe-planning: plan-tree.yaml → board.html (static export, optional)
 * Usage: node render-board.mjs <path/to/plan-tree.yaml>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from './lib/yaml-mini.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.resolve(__dirname, '..');
const TEMPLATE = path.join(SKILL_ROOT, 'assets', 'board.template.html');

function fail(msg) {
  console.error('[vibe-planning]', msg);
  process.exit(1);
}

function main() {
  const yamlPath = process.argv[2];
  if (!yamlPath) fail('Usage: node render-board.mjs <plan-tree.yaml>');
  const absYaml = path.resolve(yamlPath);
  if (!fs.existsSync(absYaml)) fail('YAML not found: ' + absYaml);
  if (!fs.existsSync(TEMPLATE)) fail('Template missing: ' + TEMPLATE);

  const raw = fs.readFileSync(absYaml, 'utf8');
  let tree;
  try {
    tree = parseYaml(raw);
  } catch (e) {
    fail('YAML parse error: ' + e.message);
  }
  if (!tree || typeof tree !== 'object') fail('Invalid plan-tree root');
  if (!Array.isArray(tree.nodes)) tree.nodes = [];
  if (!Array.isArray(tree.ghosts)) tree.ghosts = [];

  const tpl = fs.readFileSync(TEMPLATE, 'utf8');
  const json = JSON.stringify(tree, null, 2);
  if (!tpl.includes('/*__PLAN_TREE__*/null')) {
    fail('Template missing /*__PLAN_TREE__*/null placeholder');
  }
  const html = tpl.replace('/*__PLAN_TREE__*/null', json);
  const out = path.join(path.dirname(absYaml), 'board.html');
  fs.writeFileSync(out, html, 'utf8');
  console.log('[vibe-planning] wrote', out);
  console.log('[vibe-planning] nodes=', tree.nodes.length, 'ghosts=', tree.ghosts.length);
}

main();
