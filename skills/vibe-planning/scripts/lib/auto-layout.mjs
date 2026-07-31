const COL = 260;
const ROW = 180;

function compareSiblings(a, b, byId) {
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

/**
 * Parent-tree tidy layout: depth by parent, siblings ordered by dependsOn/docs.
 * Parent edges fan downward without crossing when children are left-to-right.
 */
export function autoLayout(nodes, ghosts = []) {
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
    kids.sort((ai, bi) => compareSiblings(byId.get(ai), byId.get(bi), byId));
  }

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

  const roots = children.get(null) || [];
  for (const id of roots) place(id, 0);

  for (const id of byId.keys()) {
    if (!positions[id]) {
      positions[id] = { x: nextLeaf * COL, y: 0 };
      nextLeaf += 1;
    }
  }

  return positions;
}
