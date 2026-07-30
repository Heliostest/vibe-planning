#!/usr/bin/env node
/**
 * vibe-planning live HTTP server
 * Usage: node serve.mjs <projectRoot> [--port 7465] [--open]
 * Port auto-bumps on EADDRINUSE (7465 → 7466 → …).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { parseYaml } from './lib/yaml-mini.mjs';
import { runSync, buildAiSyncPrompt } from './lib/sync-repo.mjs';
import { promoteGhost } from './lib/promote-ghost.mjs';
import { readLayout, mergeLayout } from './lib/layout-store.mjs';
import { readDoneOrder, mergeDoneOrder } from './lib/done-order-store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SKILL_ROOT, '..', '..');
const TEMPLATE = path.join(SKILL_ROOT, 'assets', 'board.template.html');

function readVersion() {
  for (const p of [
    path.join(REPO_ROOT, 'VERSION'),
    path.join(SKILL_ROOT, 'VERSION'),
    path.join(REPO_ROOT, 'package.json'),
  ]) {
    try {
      if (!fs.existsSync(p)) continue;
      if (p.endsWith('package.json')) {
        const v = JSON.parse(fs.readFileSync(p, 'utf8')).version;
        if (v) return String(v);
      } else {
        const v = fs.readFileSync(p, 'utf8').trim();
        if (v) return v;
      }
    } catch { /* try next */ }
  }
  return '1.1.0';
}

const VERSION = readVersion();

function fail(msg) {
  console.error('[vibe-planning]', msg);
  process.exit(1);
}

function parseArgs(argv) {
  let projectRoot = null;
  let port = 7465;
  let open = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') { port = Number(argv[++i]) || 7465; continue; }
    if (a === '--open') { open = true; continue; }
    if (a.startsWith('--')) continue;
    if (!projectRoot) projectRoot = a;
  }
  return { projectRoot, port, open };
}

function vibeDir(projectRoot) {
  return path.join(projectRoot, 'docs', 'vibe-planning');
}

function yamlPath(projectRoot) {
  return path.join(vibeDir(projectRoot), 'plan-tree.yaml');
}

function loadTree(projectRoot) {
  const p = yamlPath(projectRoot);
  if (!fs.existsSync(p)) throw new Error('plan-tree.yaml not found: ' + p);
  const tree = parseYaml(fs.readFileSync(p, 'utf8'));
  if (!Array.isArray(tree.nodes)) tree.nodes = [];
  if (!Array.isArray(tree.ghosts)) tree.ghosts = [];
  return tree;
}

function boardHtml(projectRoot) {
  if (!fs.existsSync(TEMPLATE)) throw new Error('Template missing: ' + TEMPLATE);
  let tree;
  try { tree = loadTree(projectRoot); } catch {
    tree = { version: 1, project: path.basename(projectRoot), nodes: [], ghosts: [] };
  }
  const tpl = fs.readFileSync(TEMPLATE, 'utf8');
  return tpl.replace('/*__PLAN_TREE__*/null', JSON.stringify(tree));
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendText(res, code, text, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const sseClients = new Set();

function broadcastReload() {
  for (const res of sseClients) {
    try {
      res.write('event: reload\ndata: {}\n\n');
    } catch { /* ignore */ }
  }
}

function watchYaml(projectRoot) {
  const p = yamlPath(projectRoot);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) return;
  let timer = null;
  const fire = () => {
    clearTimeout(timer);
    timer = setTimeout(() => broadcastReload(), 120);
  };
  try {
    fs.watch(p, { persistent: true }, fire);
  } catch {
    try { fs.watch(dir, { persistent: true }, (e, f) => {
      if (!f || f === 'plan-tree.yaml') fire();
    }); } catch { /* ignore */ }
  }
}

function openBrowser(url) {
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

function main() {
  const { projectRoot: prArg, port, open } = parseArgs(process.argv.slice(2));
  if (!prArg) fail('Usage: node serve.mjs <projectRoot> [--port 7465] [--open]');
  const projectRoot = path.resolve(prArg);
  if (!fs.existsSync(projectRoot)) fail('projectRoot not found: ' + projectRoot);

  watchYaml(projectRoot);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const pathname = url.pathname;

    try {
      if (req.method === 'GET' && pathname === '/api/health') {
        return sendJson(res, 200, { ok: true, projectRoot });
      }

      if (req.method === 'GET' && pathname === '/api/tree') {
        return sendJson(res, 200, loadTree(projectRoot));
      }

      if (req.method === 'GET' && pathname === '/api/sync-prompt') {
        const p = path.join(vibeDir(projectRoot), 'sync-prompt.md');
        if (!fs.existsSync(p)) return sendText(res, 404, 'no sync-prompt yet');
        return sendText(res, 200, fs.readFileSync(p, 'utf8'), 'text/markdown; charset=utf-8');
      }

      if (req.method === 'GET' && pathname === '/api/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        res.write('event: hello\ndata: {}\n\n');
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
        return;
      }

      if (req.method === 'POST' && pathname === '/api/sync') {
        const result = runSync(projectRoot);
        broadcastReload();
        return sendJson(res, result.ok ? 200 : 500, {
          ok: result.ok,
          updated: result.updated,
          promptPath: result.promptPath,
          summary: result.summary,
        });
      }

      if (req.method === 'POST' && pathname === '/api/ai-sync-prompt') {
        const result = buildAiSyncPrompt(projectRoot, { writeFile: true });
        return sendJson(res, result.ok ? 200 : 500, {
          ok: result.ok,
          prompt: result.prompt,
          promptPath: result.promptPath,
          summary: result.summary,
        });
      }

      if (req.method === 'POST' && pathname === '/api/promote-ghost') {
        const raw = await readBody(req);
        let body = {};
        try { body = raw ? JSON.parse(raw) : {}; } catch {
          return sendJson(res, 400, { ok: false, error: 'invalid JSON' });
        }
        const id = body && body.id;
        if (!id) return sendJson(res, 400, { ok: false, error: 'id required' });
        const result = promoteGhost(yamlPath(projectRoot), id);
        if (!result.ok) return sendJson(res, 404, { ok: false, error: result.error || 'ghost not found' });
        broadcastReload();
        return sendJson(res, 200, { ok: true, node: result.node });
      }

      if (req.method === 'GET' && pathname === '/api/layout') {
        return sendJson(res, 200, readLayout(projectRoot));
      }

      if (req.method === 'POST' && pathname === '/api/layout') {
        const raw = await readBody(req);
        let body = {};
        try { body = raw ? JSON.parse(raw) : {}; } catch {
          return sendJson(res, 400, { ok: false, error: 'invalid JSON' });
        }
        mergeLayout(projectRoot, body && body.positions);
        return sendJson(res, 200, { ok: true });
      }

      if (req.method === 'GET' && pathname === '/api/done-order') {
        return sendJson(res, 200, readDoneOrder(projectRoot));
      }

      if (req.method === 'POST' && pathname === '/api/done-order') {
        const raw = await readBody(req);
        let body = {};
        try { body = raw ? JSON.parse(raw) : {}; } catch {
          return sendJson(res, 400, { ok: false, error: 'invalid JSON' });
        }
        mergeDoneOrder(projectRoot, body && body.order);
        return sendJson(res, 200, { ok: true });
      }

      if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html' || pathname === '/board.html')) {
        return sendText(res, 200, boardHtml(projectRoot), 'text/html; charset=utf-8');
      }

      sendText(res, 404, 'not found');
    } catch (e) {
      sendJson(res, 500, { ok: false, error: String(e && e.message ? e.message : e) });
    }
  });

  const maxTries = 30;
  let tryPort = port;
  let tries = 0;

  function onListening() {
    const url = `http://localhost:${tryPort}/`;
    console.log('[vibe-planning]', 'v' + VERSION, 'serving', projectRoot);
    if (tryPort !== port) {
      console.log('[vibe-planning] port', port, 'busy → using', tryPort);
    }
    console.log('[vibe-planning]', url);
    if (open) openBrowser(url);
  }

  function tryListen() {
    tries += 1;
    server.once('error', (err) => {
      if (err && err.code === 'EADDRINUSE' && tries < maxTries) {
        tryPort += 1;
        tryListen();
        return;
      }
      fail(err && err.message ? err.message : String(err));
    });
    server.listen(tryPort, '127.0.0.1', onListening);
  }

  tryListen();
}

main();
