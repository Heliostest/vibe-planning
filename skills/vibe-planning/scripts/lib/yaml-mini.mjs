/** Minimal YAML parse/stringify for vibe-planning schema. Zero npm deps. */

export function parseYaml(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\t/g, '  ').split('\n');
  let i = 0;

  function peek() {
    while (i < lines.length) {
      const raw = lines[i];
      const t = raw.trim();
      if (t === '' || t.startsWith('#')) { i++; continue; }
      return raw;
    }
    return null;
  }

  function indentOf(raw) {
    return raw.match(/^( *)/)[1].length;
  }

  function parseScalar(s) {
    s = s.trim();
    if (s === '' || s === '~' || s === 'null') return null;
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      return s.slice(1, -1);
    }
    if (s.startsWith('[') && s.endsWith(']')) {
      const inner = s.slice(1, -1).trim();
      if (!inner) return [];
      return inner.split(',').map((x) => parseScalar(x));
    }
    if (s.startsWith('{') && s.endsWith('}')) {
      const obj = {};
      const inner = s.slice(1, -1).trim();
      if (!inner) return obj;
      for (const part of splitTop(inner)) {
        const idx = part.indexOf(':');
        if (idx < 0) continue;
        obj[part.slice(0, idx).trim()] = parseScalar(part.slice(idx + 1));
      }
      return obj;
    }
    return s;
  }

  function splitTop(s) {
    const out = [];
    let cur = '';
    let depth = 0;
    let quote = null;
    for (let c = 0; c < s.length; c++) {
      const ch = s[c];
      if (quote) {
        cur += ch;
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
      if (ch === '[' || ch === '{') depth++;
      if (ch === ']' || ch === '}') depth--;
      if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur);
    return out;
  }

  function parseBlock(minIndent) {
    const raw = peek();
    if (raw == null) return null;
    const ind = indentOf(raw);
    if (ind < minIndent) return null;
    const trimmed = raw.trim();
    if (trimmed.startsWith('- ')) {
      const arr = [];
      while (true) {
        const r = peek();
        if (r == null) break;
        const idn = indentOf(r);
        if (idn < ind || !r.trim().startsWith('- ')) break;
        i++;
        const rest = r.trim().slice(2);
        if (rest === '' || (rest.endsWith(':') && !rest.includes(': '))) {
          if (rest.endsWith(':') && rest.length > 1) {
            const key = rest.slice(0, -1).trim();
            const child = parseBlock(idn + 1);
            arr.push({ [key]: child });
          } else {
            arr.push(parseBlock(idn + 1));
          }
        } else if (rest.includes(': ') || /^[^:]+:\s*$/.test(rest) || /^[^:]+:/.test(rest)) {
          const map = {};
          const m = rest.match(/^([^:]+):(.*)$/);
          if (m) {
            const k = m[1].trim();
            const v = m[2].trim();
            map[k] = v === '' ? parseBlock(idn + 1) : parseScalar(v);
          }
          while (true) {
            const r2 = peek();
            if (r2 == null) break;
            const idn2 = indentOf(r2);
            const t2 = r2.trim();
            if (idn2 <= idn || t2.startsWith('- ')) break;
            i++;
            const m2 = t2.match(/^([^:]+):(.*)$/);
            if (!m2) continue;
            const k2 = m2[1].trim();
            const v2 = m2[2].trim();
            map[k2] = v2 === '' ? parseBlock(idn2 + 1) : parseScalar(v2);
          }
          arr.push(map);
        } else {
          arr.push(parseScalar(rest));
        }
      }
      return arr;
    }

    const obj = {};
    while (true) {
      const r = peek();
      if (r == null) break;
      const idn = indentOf(r);
      if (idn < ind) break;
      if (idn > ind && Object.keys(obj).length) break;
      const t = r.trim();
      if (t.startsWith('- ')) break;
      i++;
      const m = t.match(/^([^:]+):(.*)$/);
      if (!m) continue;
      const key = m[1].trim();
      const val = m[2].trim();
      if (val === '') {
        const child = parseBlock(idn + 1);
        obj[key] = child === null ? {} : child;
      } else {
        obj[key] = parseScalar(val);
      }
    }
    return obj;
  }

  return parseBlock(0) || {};
}

function needsQuote(s) {
  if (s === '') return true;
  if (/^[\s]|[\s]$/.test(s)) return true;
  if (/[#:{}[\],&*!|>'"%@`]/.test(s)) return true;
  if (/^(true|false|null|~)$/i.test(s)) return true;
  if (/^-?\d+(\.\d+)?$/.test(s)) return true;
  return false;
}

function dumpScalar(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  const s = String(v);
  return needsQuote(s) ? '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"' : s;
}

function dumpBlock(obj, indent) {
  const sp = '  '.repeat(indent);
  if (Array.isArray(obj)) {
    if (!obj.length) return sp + '[]\n';
    let out = '';
    for (const item of obj) {
      if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
        const keys = Object.keys(item);
        if (!keys.length) { out += sp + '- {}\n'; continue; }
        let first = true;
        for (const k of keys) {
          const v = item[k];
          const prefix = first ? sp + '- ' : sp + '  ';
          first = false;
          if (v !== null && typeof v === 'object') {
            if (Array.isArray(v) && !v.length) {
              out += prefix + k + ': []\n';
            } else if (!Array.isArray(v) && !Object.keys(v).length) {
              out += prefix + k + ': {}\n';
            } else {
              out += prefix + k + ':\n' + dumpBlock(v, indent + 2);
            }
          } else {
            out += prefix + k + ': ' + dumpScalar(v) + '\n';
          }
        }
      } else {
        out += sp + '- ' + dumpScalar(item) + '\n';
      }
    }
    return out;
  }
  let out = '';
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v !== null && typeof v === 'object') {
      if (Array.isArray(v) && !v.length) out += sp + k + ': []\n';
      else if (!Array.isArray(v) && !Object.keys(v).length) out += sp + k + ': {}\n';
      else out += sp + k + ':\n' + dumpBlock(v, indent + 1);
    } else {
      out += sp + k + ': ' + dumpScalar(v) + '\n';
    }
  }
  return out;
}

export function stringifyYaml(value) {
  if (value === null || typeof value !== 'object') return dumpScalar(value) + '\n';
  return dumpBlock(value, 0);
}

export function stringifyPlanTree(tree) {
  const obj = {};
  for (const k of ['version', 'project', 'nodes', 'ghosts']) {
    if (k in tree) obj[k] = tree[k];
  }
  for (const k of Object.keys(tree)) {
    if (!(k in obj)) obj[k] = tree[k];
  }
  return dumpBlock(obj, 0);
}
