import fs from 'node:fs';
import path from 'node:path';

export function doneOrderPath(projectRoot) {
  return path.join(projectRoot, 'docs', 'vibe-planning', 'done-order.json');
}

export function emptyDoneOrder() {
  return { version: 1, order: {} };
}

export function readDoneOrder(projectRoot) {
  const p = doneOrderPath(projectRoot);
  if (!fs.existsSync(p)) return emptyDoneOrder();
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const order = raw && typeof raw.order === 'object' && raw.order ? raw.order : {};
    return { version: 1, order: sanitizeOrder(order) };
  } catch {
    return emptyDoneOrder();
  }
}

function sanitizeOrder(order) {
  const out = {};
  if (!order || typeof order !== 'object') return out;
  for (const id of Object.keys(order)) {
    const raw = order[id];
    const list = Array.isArray(raw) ? raw : [raw];
    const nums = [];
    for (const v of list) {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 1) continue;
      const f = Math.floor(n);
      if (!nums.includes(f)) nums.push(f);
    }
    nums.sort((a, b) => a - b);
    if (nums.length) out[id] = nums;
  }
  return out;
}

function atomicWrite(projectRoot, order) {
  const dir = path.join(projectRoot, 'docs', 'vibe-planning');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const payload = { version: 1, order: sanitizeOrder(order) };
  const p = doneOrderPath(projectRoot);
  const tmp = p + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  try {
    fs.renameSync(tmp, p);
  } catch {
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ }
    fs.renameSync(tmp, p);
  }
  return payload;
}

export function mergeDoneOrder(projectRoot, partialOrder) {
  const current = readDoneOrder(projectRoot);
  const merged = Object.assign({}, current.order);
  const partial = sanitizeOrder(partialOrder);
  for (const id of Object.keys(partial)) {
    const set = new Set([].concat(merged[id] || [], partial[id]));
    merged[id] = Array.from(set).sort((a, b) => a - b);
  }
  return atomicWrite(projectRoot, merged);
}
