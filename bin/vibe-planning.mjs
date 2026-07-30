#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(__dirname, '..', 'skills', 'vibe-planning');
const SERVE = path.join(SKILL, 'scripts', 'serve.mjs');
const RENDER = path.join(SKILL, 'scripts', 'render-board.mjs');

const argv = process.argv.slice(2);
const cmd = argv[0];
const rest = argv.slice(1);

function usage() {
  console.log(`vibe-planning — doc-backed planning board

Usage:
  vibe-planning serve <projectRoot> [--port 7465] [--open]
  vibe-planning render <path/to/plan-tree.yaml>
  vibe-planning skill-path

Requires Node.js >= 18.
`);
}

if (!cmd || cmd === '-h' || cmd === '--help') {
  usage();
  process.exit(cmd ? 0 : 1);
}

if (cmd === 'skill-path') {
  console.log(SKILL);
  process.exit(0);
}

const script = cmd === 'serve' ? SERVE : cmd === 'render' ? RENDER : null;
if (!script) {
  console.error('Unknown command:', cmd);
  usage();
  process.exit(1);
}

const child = spawn(process.execPath, [script, ...rest], {
  stdio: 'inherit',
  env: process.env,
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
