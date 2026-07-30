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
    const n = Number(order[id]);
    if (!Number.isFinite(n) || n < 1) continue;
    out[id] = Math.floor(n);
  }
  return out;
}

export function mergeDoneOrder(projectRoot, partialOrder) {
  const dir = path.join(projectRoot, 'docs', 'vibe-planning');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const current = readDoneOrder(projectRoot);
  const merged = {
    version: 1,
    order: Object.assign({}, current.order, sanitizeOrder(partialOrder)),
  };
  const p = doneOrderPath(projectRoot);
  const tmp = p + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(merged, null, 2) + '\n', 'utf8');
  try {
    fs.renameSync(tmp, p);
  } catch {
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ }
    fs.renameSync(tmp, p);
  }
  return merged;
}
