import fs from 'node:fs';
import path from 'node:path';

export function layoutPath(projectRoot) {
  return path.join(projectRoot, 'docs', 'vibe-planning', 'layout.json');
}

export function emptyLayout() {
  return { version: 1, positions: {} };
}

export function readLayout(projectRoot) {
  const p = layoutPath(projectRoot);
  if (!fs.existsSync(p)) return emptyLayout();
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const positions = raw && typeof raw.positions === 'object' && raw.positions
      ? raw.positions
      : {};
    return { version: 1, positions };
  } catch {
    return emptyLayout();
  }
}

function sanitizePositions(positions) {
  const out = {};
  if (!positions || typeof positions !== 'object') return out;
  for (const id of Object.keys(positions)) {
    const v = positions[id];
    if (!v || typeof v !== 'object') continue;
    const x = Number(v.x);
    const y = Number(v.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out[id] = { x, y };
  }
  return out;
}

function atomicWriteLayout(projectRoot, positions) {
  const dir = path.join(projectRoot, 'docs', 'vibe-planning');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const layout = {
    version: 1,
    positions: sanitizePositions(positions),
  };
  const p = layoutPath(projectRoot);
  const tmp = p + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(layout, null, 2) + '\n', 'utf8');
  try {
    fs.renameSync(tmp, p);
  } catch {
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ }
    fs.renameSync(tmp, p);
  }
  return layout;
}

export function writeLayout(projectRoot, positions) {
  return atomicWriteLayout(projectRoot, positions);
}

export function mergeLayout(projectRoot, partialPositions) {
  const current = readLayout(projectRoot);
  return atomicWriteLayout(
    projectRoot,
    Object.assign({}, current.positions, sanitizePositions(partialPositions)),
  );
}
