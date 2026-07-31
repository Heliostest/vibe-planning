const COL = 260;
const ROW = 180;

function compareSiblings(a, b) {
  const aDeps = Array.isArray(a.dependsOn) ? a.dependsOn : [];
  const bDeps = Array.isArray(b.dependsOn) ? b.dependsOn : [];
  if (aDeps.includes(b.id) && !bDeps.includes(a.id)) return 1;
  if (bDeps.includes(a.id) && !aDeps.includes(b.id)) return -1;
  const ad = firstDoc(a);
  const bd = firstDoc(b);
  if (ad && bd && ad !== bd) return ad < bd ? -1 : 1;
  return String(a.id).localeCompare(String(b.id));
}

function firstDoc(n) {
  const docs = Array.isArray(n.docs) ? n.docs : [];
  return docs[0] || '';
}

function buildForest(nodes, ghosts) {
  const list = []
    .concat(Array.isArray(nodes) ? nodes : [])
    .concat(Array.isArray(ghosts) ? ghosts : []);
  const byId = new Map();
  for (const n of list) {
    if (n && n.id) byId.set(n.id, n);
  }

  const children = new Map();
  for (const n of byId.values()) {
    const p = n.parent && byId.has(n.parent) ? n.parent : null;
    if (!children.has(p)) children.set(p, []);
    children.get(p).push(n.id);
  }
  for (const [, kids] of children) {
    kids.sort((ai, bi) => compareSiblings(byId.get(ai), byId.get(bi)));
  }
  return { byId, children };
}

function leafCount(id, children, memo) {
  if (memo.has(id)) return memo.get(id);
  const kids = children.get(id) || [];
  let n = 1;
  if (kids.length) {
    n = 0;
    for (const k of kids) n += leafCount(k, children, memo);
  }
  memo.set(id, n);
  return n;
}

function layoutTree(byId, children) {
  const positions = {};
  let nextLeaf = 0;

  function place(id, depth) {
    const kids = children.get(id) || [];
    if (!kids.length) {
      positions[id] = { x: nextLeaf * COL, y: depth * ROW };
      nextLeaf += 1;
      return;
    }
    for (const k of kids) place(k, depth + 1);
    const xs = kids.map((k) => positions[k].x);
    positions[id] = {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: depth * ROW,
    };
  }

  for (const id of children.get(null) || []) place(id, 0);
  for (const id of byId.keys()) {
    if (!positions[id]) {
      positions[id] = { x: nextLeaf * COL, y: 0 };
      nextLeaf += 1;
    }
  }
  return positions;
}

/** Spider / radial: children sit on a ring (or outward fan) around their parent. */
function layoutRadial(byId, children) {
  const positions = {};
  const memo = new Map();

  function place(id, x, y, fromAngle) {
    positions[id] = { x, y };
    const kids = children.get(id) || [];
    if (!kids.length) return;

    const total = kids.reduce((s, k) => s + leafCount(k, children, memo), 0);
    const radius = Math.max(220, 150 + Math.sqrt(total) * 95 + kids.length * 12);

    let start;
    let span;
    if (fromAngle == null) {
      start = -Math.PI / 2;
      span = Math.PI * 2;
    } else {
      span = Math.min(Math.PI * 1.7, Math.PI * 0.55 + kids.length * 0.4);
      span = Math.max(span, Math.PI * 0.7);
      start = fromAngle - span / 2;
    }

    let ang = start;
    for (const k of kids) {
      const frac = leafCount(k, children, memo) / total;
      const w = span * frac;
      const mid = ang + w / 2;
      place(k, x + Math.cos(mid) * radius, y + Math.sin(mid) * radius, mid);
      ang += w;
    }
  }

  const roots = children.get(null) || [];
  if (!roots.length) {
    for (const id of byId.keys()) positions[id] = { x: 0, y: 0 };
    return positions;
  }

  if (roots.length === 1) {
    place(roots[0], 0, 0, null);
  } else {
    const preferred = roots.includes('root') ? 'root' : roots[0];
    place(preferred, 0, 0, null);
    const others = roots.filter((id) => id !== preferred);
    if (others.length) {
      const ring = Math.max(420, 280 + others.length * 80);
      const start = Math.PI / 2;
      for (let i = 0; i < others.length; i++) {
        const a = start + (Math.PI * 2 * i) / others.length;
        place(others[i], Math.cos(a) * ring, Math.sin(a) * ring, a);
      }
    }
  }

  for (const id of byId.keys()) {
    if (!positions[id]) positions[id] = { x: 0, y: 0 };
  }
  return positions;
}

/**
 * @param {object[]} nodes
 * @param {object[]} [ghosts]
 * @param {{ mode?: 'tree' | 'radial' }} [opts]
 */
export function autoLayout(nodes, ghosts = [], opts = {}) {
  const { byId, children } = buildForest(nodes, ghosts);
  const mode = opts && opts.mode === 'radial' ? 'radial' : 'tree';
  return mode === 'radial' ? layoutRadial(byId, children) : layoutTree(byId, children);
}
